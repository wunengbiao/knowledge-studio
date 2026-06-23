import { join } from 'node:path'
import type { Conversation, Message, MessageCitation, SearchResult } from '@shared/types'
import Database from 'better-sqlite3'
import { net, app } from 'electron'
import { v4 as uuid } from 'uuid'
import { SearchService } from './search-service'
import { SettingsService } from './settings-service'

interface ConversationRow {
  id: string
  name: string
  kb_ids: string
  created_at: string
  updated_at: string
  message_count: number
}

interface MessageRow {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  citations: string | null
}

export interface StreamEmitter {
  onDelta: (assistantMessageId: string, delta: string) => void
  onDone: (assistantMessageId: string, content: string, createdAt: string) => void
  onError: (assistantMessageId: string, error: string) => void
}

export class ChatService {
  private db: Database.Database
  private searchService: SearchService
  private settingsService: SettingsService

  constructor() {
    const dataDir = join(app.getPath('userData'), 'rag-data')
    this.db = new Database(join(dataDir, 'app.db'))
    this.searchService = new SearchService()
    this.settingsService = new SettingsService()
    this.init()
    this.migrate()
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kb_ids TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        citations TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
    `)
  }

  private migrate(): void {
    const cols = this.db
      .prepare("PRAGMA table_info('messages')")
      .all() as { name: string }[]
    if (!cols.some((c) => c.name === 'citations')) {
      this.db.exec("ALTER TABLE messages ADD COLUMN citations TEXT")
    }
  }

  list(): Conversation[] {
    const rows = this.db
      .prepare('SELECT * FROM conversations ORDER BY updated_at DESC')
      .all() as ConversationRow[]
    return rows.map(this.rowToConversation)
  }

  create(params: { kbIds?: string[] }): Conversation {
    const id = uuid()
    const now = new Date().toISOString()
    const kbIds = params.kbIds ?? []
    this.db
      .prepare(
        `INSERT INTO conversations (id, name, kb_ids, created_at, updated_at, message_count)
         VALUES (?, ?, ?, ?, ?, 0)`
      )
      .run(id, '新对话', JSON.stringify(kbIds), now, now)
    return this.get(id)?.conversation!
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
    return result.changes > 0
  }

  rename(id: string, name: string): Conversation {
    const now = new Date().toISOString()
    this.db
      .prepare('UPDATE conversations SET name = ?, updated_at = ? WHERE id = ?')
      .run(name, now, id)
    return this.get(id)?.conversation!
  }

  get(
    id: string
  ): { conversation: Conversation; messages: Message[] } | null {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
      | ConversationRow
      | undefined
    if (!row) return null
    const messages = this.getMessages(id)
    return { conversation: this.rowToConversation(row), messages }
  }

  getMessages(conversationId: string): Message[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId) as MessageRow[]
    return rows.map(this.rowToMessage)
  }

  async sendMessage(
    params: {
      conversationId: string
      message: string
      kbIds: string[]
      rerankEnabled: boolean
      topK: number
    },
    emitter?: StreamEmitter
  ): Promise<{
    userMessage: Message
    assistantMessageId: string
    citations: MessageCitation[]
  }> {
    const { conversationId, message, kbIds, topK } = params
    const existing = this.get(conversationId)
    if (!existing) throw new Error('对话不存在')

    const userMessage = this.appendMessage(conversationId, 'user', message)
    this.updateKbIds(conversationId, kbIds)

    if (existing.conversation.messageCount === 0) {
      const generated = this.generateConversationName(message)
      this.rename(conversationId, generated)
    }

    let contexts: SearchResult[] = []
    if (kbIds.length > 0) {
      const perKb = Math.max(2, Math.ceil(topK / kbIds.length))
      for (const kbId of kbIds) {
        try {
          const results = await this.searchService.search(kbId, message, 'hybrid', perKb)
          contexts.push(...results)
        } catch (e) {
          console.error('[chat:sendMessage] 检索失败 kbId=', kbId, e)
        }
      }
      contexts.sort((a, b) => b.score - a.score)
      contexts = contexts.slice(0, topK)
    }

    const citations: MessageCitation[] = contexts.map((c, i) => ({
      index: i + 1,
      chunkId: (c as any).chunkId,
      docId: c.docId,
      docTitle: c.docTitle,
      content: c.content,
      score: c.score
    }))

    const assistantId = uuid()
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, created_at, citations)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(assistantId, conversationId, 'assistant', '', now, JSON.stringify(citations))
    this.db
      .prepare(
        `UPDATE conversations SET message_count = message_count + 1, updated_at = ? WHERE id = ?`
      )
      .run(now, conversationId)

    this.streamLLMResponse(assistantId, conversationId, message, contexts, emitter).catch(
      (e) => {
        console.error('[chat:sendMessage] LLM stream failed:', e)
        emitter?.onError(assistantId, e.message || 'LLM 响应失败')
      }
    )

    return { userMessage, assistantMessageId: assistantId, citations }
  }

  private async streamLLMResponse(
    assistantId: string,
    conversationId: string,
    userMessage: string,
    contexts: SearchResult[],
    emitter?: StreamEmitter
  ): Promise<void> {
    const settings = this.settingsService.get()
    if (!settings.llmApiUrl || !settings.llmApiKey) {
      throw new Error('未配置 LLM API，请在设置中填写')
    }

    const systemPrompt = this.buildSystemPrompt(contexts)
    const history = this.getMessages(conversationId)
    const recentHistory = history.slice(-12).filter((m) => m.id !== assistantId)

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage }
    ]

    const response = await net.fetch(settings.llmApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.llmApiKey}`
      },
      body: JSON.stringify({
        model: settings.llmModel || 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        stream: true
      }),
      signal: AbortSignal.timeout(120000)
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`LLM API 错误 HTTP ${response.status}: ${text.slice(0, 200)}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('LLM 响应体不可读')

    const decoder = new TextDecoder()
    const fullContent = await this.readStream(
      reader,
      decoder,
      (chunk) => emitter?.onDelta(assistantId, chunk)
    )

    const now = new Date().toISOString()
    this.db
      .prepare('UPDATE messages SET content = ?, created_at = ? WHERE id = ?')
      .run(fullContent, now, assistantId)
    this.db
      .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(now, conversationId)

    emitter?.onDone(assistantId, fullContent, now)
  }

  private async readStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    onChunk: (text: string) => void
  ): Promise<string> {
    const buffer: string[] = []
    let leftover = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value, { stream: true })
      leftover += text

      const lines = leftover.split('\n')
      leftover = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const json = JSON.parse(data)
          const content = json.choices?.[0]?.delta?.content
          if (content) {
            buffer.push(content)
            onChunk(content)
          }
        } catch {
          // skip malformed JSON lines
        }
      }
    }
    return buffer.join('')
  }

  private appendMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string
  ): Message {
    const id = uuid()
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, conversationId, role, content, now)
    this.db
      .prepare(
        `UPDATE conversations
         SET message_count = message_count + 1, updated_at = ?
         WHERE id = ?`
      )
      .run(now, conversationId)
    return { id, conversationId, role, content, createdAt: now }
  }

  private updateKbIds(conversationId: string, kbIds: string[]): void {
    this.db
      .prepare('UPDATE conversations SET kb_ids = ? WHERE id = ?')
      .run(JSON.stringify(kbIds), conversationId)
  }

  private generateConversationName(firstMessage: string): string {
    const cleaned = firstMessage.replace(/\s+/g, ' ').trim()
    if (cleaned.length <= 24) return cleaned || '新对话'
    return `${cleaned.slice(0, 24)}...`
  }

  private buildSystemPrompt(contexts: SearchResult[]): string {
    if (contexts.length === 0) {
      return '你是一个有帮助的助手。请用 Markdown 格式回答用户问题。'
    }
    const refs = contexts
      .map((c, i) => `[${i + 1}] 来源: ${c.docTitle}\n${c.content}`)
      .join('\n\n---\n\n')
    return `你是一个基于知识库的智能助手。请基于下方参考资料回答用户问题。如果资料无法支持答案，请明确说明。回答使用 Markdown 格式，引用资料时使用 [1] [2] 标注。

## 参考资料

${refs}`
  }

  private rowToConversation(row: ConversationRow): Conversation {
    let kbIds: string[] = []
    try {
      const parsed = JSON.parse(row.kb_ids)
      if (Array.isArray(parsed)) kbIds = parsed
    } catch {
      kbIds = []
    }
    return {
      id: row.id,
      name: row.name,
      kbIds,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.message_count
    }
  }

  private rowToMessage(row: MessageRow): Message {
    let citations: MessageCitation[] | undefined
    if (row.citations) {
      try {
        const parsed = JSON.parse(row.citations)
        if (Array.isArray(parsed)) citations = parsed
      } catch {
        citations = undefined
      }
    }
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
      citations
    }
  }
}

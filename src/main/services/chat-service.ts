import { join } from 'node:path'
import type {
  Assistant,
  AssistantModelParams,
  Conversation,
  CustomParamEntry,
  Message,
  MessageCitation,
  SearchResult
} from '@shared/types'
import Database from 'better-sqlite3'
import { net, app } from 'electron'
import { v4 as uuid } from 'uuid'
import { AssistantService } from './assistant-service'
import { buildChatCompletionMessages } from './chat-message-builder'
import { SearchService } from './search-service'
import { SettingsService, resolveCapabilityUrl } from './settings-service'

interface ConversationRow {
  id: string
  name: string
  kb_ids: string
  created_at: string
  updated_at: string
  message_count: number
  llm_preset_id: string | null
  assistant_id: string | null
}

interface MessageRow {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  citations: string | null
  reasoning: string | null
}

interface ChatCompletionDelta {
  choices?: {
    delta?: {
      content?: string
      reasoning_content?: string
      reasoning?: string
    }
  }[]
}

interface ChatModelEndpoint {
  apiUrl: string
  apiKey: string
  model: string
}

export interface StreamEmitter {
  onDelta: (assistantMessageId: string, delta: string) => void
  onReasoning: (assistantMessageId: string, delta: string) => void
  onDone: (
    assistantMessageId: string,
    content: string,
    reasoning: string,
    createdAt: string
  ) => void
  onError: (assistantMessageId: string, error: string) => void
}

export class ChatService {
  private db: Database.Database
  private searchService: SearchService
  private settingsService: SettingsService
  private assistantService: AssistantService

  constructor() {
    const dataDir = join(app.getPath('userData'), 'rag-data')
    this.db = new Database(join(dataDir, 'app.db'))
    this.searchService = new SearchService()
    this.settingsService = new SettingsService()
    this.assistantService = new AssistantService()
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
        message_count INTEGER NOT NULL DEFAULT 0,
        llm_preset_id TEXT,
        assistant_id TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        citations TEXT,
        reasoning TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
    `)
  }

  private migrate(): void {
    const msgCols = this.db.prepare("PRAGMA table_info('messages')").all() as { name: string }[]
    if (!msgCols.some((c) => c.name === 'citations')) {
      this.db.exec('ALTER TABLE messages ADD COLUMN citations TEXT')
    }
    if (!msgCols.some((c) => c.name === 'reasoning')) {
      this.db.exec('ALTER TABLE messages ADD COLUMN reasoning TEXT')
    }
    const convCols = this.db.prepare("PRAGMA table_info('conversations')").all() as {
      name: string
    }[]
    if (!convCols.some((c) => c.name === 'llm_preset_id')) {
      this.db.exec('ALTER TABLE conversations ADD COLUMN llm_preset_id TEXT')
    }
    if (!convCols.some((c) => c.name === 'assistant_id')) {
      this.db.exec('ALTER TABLE conversations ADD COLUMN assistant_id TEXT')
    }
  }

  list(): Conversation[] {
    const rows = this.db
      .prepare('SELECT * FROM conversations ORDER BY updated_at DESC')
      .all() as ConversationRow[]
    return rows.map(this.rowToConversation)
  }

  create(params: { kbIds?: string[]; llmPresetId?: string; assistantId?: string }): Conversation {
    const id = uuid()
    const now = new Date().toISOString()
    const kbIds = params.kbIds ?? []
    this.db
      .prepare(
        `INSERT INTO conversations (id, name, kb_ids, created_at, updated_at, message_count, llm_preset_id, assistant_id)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(
        id,
        '新对话',
        JSON.stringify(kbIds),
        now,
        now,
        params.llmPresetId ?? null,
        params.assistantId ?? null
      )
    const created = this.get(id)?.conversation
    if (!created) throw new Error('创建对话失败')
    return created
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
    const reloaded = this.get(id)
    if (!reloaded) throw new Error('重命名后对话不存在')
    return reloaded.conversation
  }

  setLlmPreset(id: string, llmPresetId: string | null): Conversation {
    const now = new Date().toISOString()
    this.db
      .prepare('UPDATE conversations SET llm_preset_id = ?, updated_at = ? WHERE id = ?')
      .run(llmPresetId, now, id)
    const updated = this.get(id)?.conversation
    if (!updated) throw new Error('对话不存在')
    return updated
  }

  setAssistant(id: string, assistantId: string | null): Conversation {
    const now = new Date().toISOString()
    this.db
      .prepare('UPDATE conversations SET assistant_id = ?, updated_at = ? WHERE id = ?')
      .run(assistantId, now, id)
    const updated = this.get(id)?.conversation
    if (!updated) throw new Error('对话不存在')
    return updated
  }

  get(id: string): { conversation: Conversation; messages: Message[] } | null {
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
      llmPresetId?: string
      assistantId?: string
    },
    emitter?: StreamEmitter
  ): Promise<{
    userMessage: Message
    assistantMessageId: string
    citations: MessageCitation[]
  }> {
    const { conversationId, message, topK, llmPresetId } = params
    const existing = this.get(conversationId)
    if (!existing) throw new Error('对话不存在')

    const assistant = this.assistantService.resolveAssistant(
      params.assistantId ?? existing.conversation.assistantId
    )
    const effectiveKbIds = params.kbIds
    const effectiveAssistantId =
      params.assistantId ?? existing.conversation.assistantId ?? assistant.id

    const userMessage = this.appendMessage(conversationId, 'user', message)
    this.updateKbIds(conversationId, effectiveKbIds)
    this.setAssistant(conversationId, effectiveAssistantId)
    if (llmPresetId !== undefined) {
      this.setLlmPreset(conversationId, llmPresetId || null)
    }

    if (existing.conversation.messageCount === 0) {
      const generated = this.generateConversationName(message)
      this.rename(conversationId, generated)
    }

    let contexts: SearchResult[] = []
    if (effectiveKbIds.length > 0) {
      const perKb = Math.max(2, Math.ceil(topK / effectiveKbIds.length))
      for (const kbId of effectiveKbIds) {
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
      chunkId: c.chunkId,
      docId: c.docId,
      docTitle: c.docTitle,
      content: c.content,
      score: c.score
    }))

    const assistantMessageId = uuid()
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, created_at, citations, reasoning)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(assistantMessageId, conversationId, 'assistant', '', now, JSON.stringify(citations), '')
    this.db
      .prepare(
        'UPDATE conversations SET message_count = message_count + 1, updated_at = ? WHERE id = ?'
      )
      .run(now, conversationId)

    const effectivePresetId =
      llmPresetId !== undefined ? llmPresetId : existing.conversation.llmPresetId

    this.streamLLMResponse(
      assistantMessageId,
      conversationId,
      userMessage.id,
      message,
      contexts,
      assistant,
      effectivePresetId,
      emitter
    ).catch((e) => {
      console.error('[chat:sendMessage] LLM stream failed:', e)
      this.removeFailedAssistantMessage(conversationId, assistantMessageId)
      const messageText = e instanceof Error ? e.message : 'LLM 响应失败'
      emitter?.onError(assistantMessageId, messageText)
    })

    return { userMessage, assistantMessageId, citations }
  }

  private async streamLLMResponse(
    assistantId: string,
    conversationId: string,
    currentUserMessageId: string,
    userMessage: string,
    contexts: SearchResult[],
    assistant: Assistant,
    llmPresetId: string | null | undefined,
    emitter?: StreamEmitter
  ): Promise<void> {
    await Promise.resolve()
    const endpoint = this.resolveChatEndpoint(assistant, llmPresetId)
    if (!endpoint.apiUrl || !endpoint.apiKey) {
      throw new Error('未配置 LLM API，请在设置中填写')
    }

    const systemPrompt = this.buildSystemPrompt(contexts, assistant.prompt)
    const history = this.getMessages(conversationId)
    const messages = buildChatCompletionMessages({
      systemPrompt,
      history,
      currentUserMessageId,
      currentAssistantMessageId: assistantId,
      userMessage
    })

    const response = await net.fetch(endpoint.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${endpoint.apiKey}`
      },
      body: JSON.stringify({
        model: endpoint.model || 'gpt-4o-mini',
        messages,
        stream: true,
        ...this.enabledModelParams(assistant.modelParams),
        ...this.customParamsToObject(assistant.modelParams.customParameters)
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
    const { content: fullContent, reasoning: fullReasoning } = await this.readStream(
      reader,
      decoder,
      (chunk) => emitter?.onDelta(assistantId, chunk),
      (chunk) => emitter?.onReasoning(assistantId, chunk)
    )

    const now = new Date().toISOString()
    this.db
      .prepare('UPDATE messages SET content = ?, reasoning = ?, created_at = ? WHERE id = ?')
      .run(fullContent, fullReasoning, now, assistantId)
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId)

    emitter?.onDone(assistantId, fullContent, fullReasoning, now)
  }

  private resolveChatEndpoint(
    assistant: Assistant,
    llmPresetId: string | null | undefined
  ): ChatModelEndpoint {
    const settings = this.settingsService.get()
    let endpoint: ChatModelEndpoint = {
      apiUrl: settings.llmApiUrl,
      apiKey: settings.llmApiKey,
      model: settings.llmModel
    }

    const providerId = assistant.providerId ?? llmPresetId
    if (providerId) {
      const provider = settings.providers.find((p) => p.id === providerId)
      const selectedModel = provider?.models.find(
        (m) => m.id === assistant.modelId && m.capabilities.chat
      )
      const fallbackModel = provider?.models.find((m) => m.capabilities.chat)
      const chatModel = selectedModel ?? fallbackModel
      if (provider && chatModel) {
        endpoint = {
          apiUrl: resolveCapabilityUrl(provider, 'chat'),
          apiKey: provider.apiKey,
          model: chatModel.id
        }
      }
    }

    return endpoint
  }

  private enabledModelParams(params: AssistantModelParams): Record<string, number> {
    const enabled: Record<string, number> = {}
    if (params.temperatureEnabled && params.temperature !== undefined) {
      enabled.temperature = params.temperature
    }
    if (params.topPEnabled && params.topP !== undefined) {
      enabled.top_p = params.topP
    }
    if (params.maxTokensEnabled && params.maxTokens !== undefined) {
      enabled.max_tokens = params.maxTokens
    }
    return enabled
  }

  private customParamsToObject(
    entries: readonly CustomParamEntry[] | undefined
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    if (!entries) return result
    for (const entry of entries) {
      const name = entry.name?.trim()
      if (!name) continue
      if (entry.type === 'json') {
        if (typeof entry.value === 'string') {
          try {
            result[name] = JSON.parse(entry.value)
          } catch {
            result[name] = entry.value
          }
        } else {
          result[name] = entry.value
        }
      } else {
        result[name] = entry.value
      }
    }
    return result
  }

  private async readStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    onChunk: (text: string) => void,
    onReasoning: (text: string) => void
  ): Promise<{ content: string; reasoning: string }> {
    const contentBuffer: string[] = []
    const reasoningBuffer: string[] = []
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
          const json: ChatCompletionDelta = JSON.parse(data)
          const delta = json.choices?.[0]?.delta
          const content = delta?.content
          if (content) {
            contentBuffer.push(content)
            onChunk(content)
          }
          const reasoning = delta?.reasoning_content ?? delta?.reasoning
          if (reasoning) {
            reasoningBuffer.push(reasoning)
            onReasoning(reasoning)
          }
        } catch {}
      }
    }
    return { content: contentBuffer.join(''), reasoning: reasoningBuffer.join('') }
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

  private removeFailedAssistantMessage(conversationId: string, assistantMessageId: string): void {
    const result = this.db
      .prepare(
        "DELETE FROM messages WHERE id = ? AND conversation_id = ? AND role = 'assistant' AND content = ''"
      )
      .run(assistantMessageId, conversationId)
    if (result.changes === 0) return

    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE conversations
         SET message_count = max(message_count - 1, 0), updated_at = ?
         WHERE id = ?`
      )
      .run(now, conversationId)
  }

  private generateConversationName(firstMessage: string): string {
    const cleaned = firstMessage.replace(/\s+/g, ' ').trim()
    if (cleaned.length <= 24) return cleaned || '新对话'
    return `${cleaned.slice(0, 24)}...`
  }

  private buildSystemPrompt(contexts: SearchResult[], assistantPrompt: string): string {
    const basePrompt =
      assistantPrompt.trim() || '你是一个有帮助的助手。请用 Markdown 格式回答用户问题。'
    if (contexts.length === 0) {
      return basePrompt
    }
    const refs = contexts
      .map((c, i) => `[${i + 1}] 来源: ${c.docTitle}\n${c.content}`)
      .join('\n\n---\n\n')
    return `${basePrompt}

请基于下方参考资料回答用户问题。如果资料无法支持答案，请明确说明。引用资料时使用 [1] [2] 标注。

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
      messageCount: row.message_count,
      llmPresetId: row.llm_preset_id ?? undefined,
      assistantId: row.assistant_id ?? undefined
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
      citations,
      reasoning: row.reasoning ?? undefined
    }
  }
}

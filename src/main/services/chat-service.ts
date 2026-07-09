import { join } from 'node:path'
import type {
  Assistant,
  AssistantModelParams,
  Conversation,
  CustomParamEntry,
  Message,
  MessageCitation,
  MessageImage,
  SearchResult
} from '@shared/types'
import Database from 'better-sqlite3'
import { net, app } from 'electron'
import { v4 as uuid } from 'uuid'
import { AssistantService } from './assistant-service'
import {
  type ChatCompletionMessage,
  type ChatCompletionToolCall,
  buildChatCompletionMessages
} from './chat-message-builder'
import {
  KNOWLEDGE_SEARCH_TOOL_NAME,
  executeKnowledgeSearch,
  knowledgeSearchToolSchema
} from './builtin-tools'
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
  images: string | null
}

interface ChatCompletionStreamDelta {
  tool_calls?: Array<{
    index: number
    id?: string
    type?: 'function'
    function?: { name?: string; arguments?: string }
  }>
}

interface ChatCompletionDelta {
  choices?: {
    delta?: {
      content?: string
      reasoning_content?: string
      reasoning?: string
    } & ChatCompletionStreamDelta
    finish_reason?: string | null
  }[]
}

interface ChatModelEndpoint {
  apiUrl: string
  apiKey: string
  model: string
  supportsImage: boolean
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

const MAX_TOOL_ROUNDS = 3

function parseKnowledgeSearchArgs(args: string): { query: string } {
  if (!args.trim()) return { query: '' }
  try {
    const parsed = JSON.parse(args)
    if (parsed && typeof parsed.query === 'string') {
      return { query: parsed.query }
    }
  } catch {
    /* ignore parse errors, return empty query */
  }
  return { query: '' }
}

export class ChatService {
  private db: Database.Database
  private searchService: SearchService
  private settingsService: SettingsService
  private assistantService: AssistantService
  private abortControllers = new Map<string, AbortController>()
  private abortReasons = new Map<string, 'user' | 'timeout'>()

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
        images TEXT,
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
    if (!msgCols.some((c) => c.name === 'images')) {
      this.db.exec('ALTER TABLE messages ADD COLUMN images TEXT')
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
      images?: MessageImage[]
    },
    emitter?: StreamEmitter
  ): Promise<{
    userMessage: Message
    assistantMessageId: string
    citations: MessageCitation[]
  }> {
    const { conversationId, message, topK, llmPresetId, images } = params
    const existing = this.get(conversationId)
    if (!existing) throw new Error('对话不存在')

    const assistant = this.assistantService.resolveAssistant(
      params.assistantId ?? existing.conversation.assistantId
    )
    const effectiveKbIds = params.kbIds
    const effectiveAssistantId =
      params.assistantId ?? existing.conversation.assistantId ?? assistant.id
    const effectivePresetId =
      llmPresetId !== undefined ? llmPresetId : existing.conversation.llmPresetId

    const userMessage = this.appendMessage(conversationId, 'user', message, images)
    this.updateKbIds(conversationId, effectiveKbIds)
    this.setAssistant(conversationId, effectiveAssistantId)
    if (llmPresetId !== undefined) {
      this.setLlmPreset(conversationId, llmPresetId || null)
    }

    if (existing.conversation.messageCount === 0) {
      const generated = this.generateConversationName(message)
      this.rename(conversationId, generated)
    }

    const citations: MessageCitation[] = []

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

    this.streamLLMResponse(
      assistantMessageId,
      conversationId,
      userMessage.id,
      message,
      effectiveKbIds,
      topK,
      assistant,
      effectivePresetId,
      emitter,
      images
    ).catch((e) => {
      console.error('[chat:sendMessage] LLM stream failed:', e)
      this.removeFailedAssistantMessage(conversationId, assistantMessageId)
      const messageText = e instanceof Error ? e.message : 'LLM 响应失败'
      emitter?.onError(assistantMessageId, messageText)
    })

    return { userMessage, assistantMessageId, citations }
  }

  deleteMessage(messageId: string): { deletedIds: string[] } {
    const target = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as
      | MessageRow
      | undefined
    if (!target) return { deletedIds: [] }

    const rows = this.db
      .prepare(
        'SELECT id FROM messages WHERE conversation_id = ? AND created_at >= ? ORDER BY created_at ASC'
      )
      .all(target.conversation_id, target.created_at) as { id: string }[]
    const deletedIds = rows.map((r) => r.id)
    if (deletedIds.length === 0) return { deletedIds: [] }

    const placeholders = deletedIds.map(() => '?').join(',')
    this.db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...deletedIds)
    const now = new Date().toISOString()
    this.db
      .prepare(
        'UPDATE conversations SET message_count = max(message_count - ?, 0), updated_at = ? WHERE id = ?'
      )
      .run(deletedIds.length, now, target.conversation_id)

    return { deletedIds }
  }

  async editUserMessage(
    messageId: string,
    content: string,
    emitter?: StreamEmitter,
    images?: MessageImage[]
  ): Promise<{ userMessage: Message; assistantMessageId: string; citations: MessageCitation[] }> {
    const trimmed = content.trim()
    if (!trimmed) throw new Error('消息内容不能为空')

    const target = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as
      | MessageRow
      | undefined
    if (!target) throw new Error('消息不存在')
    if (target.role !== 'user') throw new Error('只能编辑用户消息')

    this.db
      .prepare('UPDATE messages SET content = ?, images = ? WHERE id = ?')
      .run(trimmed, images && images.length > 0 ? JSON.stringify(images) : null, messageId)

    const subsequent = this.db
      .prepare(
        'SELECT id FROM messages WHERE conversation_id = ? AND created_at > ? ORDER BY created_at ASC'
      )
      .all(target.conversation_id, target.created_at) as { id: string }[]
    if (subsequent.length > 0) {
      const subsequentIds = subsequent.map((r) => r.id)
      const placeholders = subsequentIds.map(() => '?').join(',')
      this.db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...subsequentIds)
      const now = new Date().toISOString()
      this.db
        .prepare(
          'UPDATE conversations SET message_count = max(message_count - ?, 0), updated_at = ? WHERE id = ?'
        )
        .run(subsequentIds.length, now, target.conversation_id)
    }

    const updatedRow = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as
      | MessageRow
      | undefined
    if (!updatedRow) throw new Error('编辑后消息不存在')
    const userMessage = this.rowToMessage(updatedRow)

    const result = await this.streamResponseForExistingUserMessage(
      target.conversation_id,
      messageId,
      trimmed,
      emitter,
      10,
      images
    )
    return {
      userMessage,
      assistantMessageId: result.assistantMessageId,
      citations: result.citations
    }
  }

  updateMessageContent(messageId: string, content: string): Message {
    const trimmed = content.trim()
    if (!trimmed) throw new Error('消息内容不能为空')

    const target = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as
      | MessageRow
      | undefined
    if (!target) throw new Error('消息不存在')

    this.db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(trimmed, messageId)

    const now = new Date().toISOString()
    this.db
      .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(now, target.conversation_id)

    const updatedRow = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as
      | MessageRow
      | undefined
    if (!updatedRow) throw new Error('更新后消息不存在')
    return this.rowToMessage(updatedRow)
  }

  async regenerateAssistantMessage(
    assistantMessageId: string,
    emitter?: StreamEmitter
  ): Promise<{ assistantMessageId: string; citations: MessageCitation[] }> {
    const target = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(assistantMessageId) as
      | MessageRow
      | undefined
    if (!target) throw new Error('消息不存在')
    if (target.role !== 'assistant') throw new Error('只能重新生成助手消息')

    const userRow = this.db
      .prepare(
        "SELECT * FROM messages WHERE conversation_id = ? AND role = 'user' AND created_at < ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(target.conversation_id, target.created_at) as MessageRow | undefined
    if (!userRow) throw new Error('找不到对应的用户消息')

    const rows = this.db
      .prepare(
        'SELECT id FROM messages WHERE conversation_id = ? AND created_at >= ? ORDER BY created_at ASC'
      )
      .all(target.conversation_id, target.created_at) as { id: string }[]
    const deletedIds = rows.map((r) => r.id)
    const placeholders = deletedIds.map(() => '?').join(',')
    this.db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...deletedIds)
    const now = new Date().toISOString()
    this.db
      .prepare(
        'UPDATE conversations SET message_count = max(message_count - ?, 0), updated_at = ? WHERE id = ?'
      )
      .run(deletedIds.length, now, target.conversation_id)

    const userImages: MessageImage[] | undefined = (() => {
      if (!userRow.images) return undefined
      try {
        const parsed = JSON.parse(userRow.images)
        if (Array.isArray(parsed)) return parsed
      } catch {
        return undefined
      }
      return undefined
    })()

    return this.streamResponseForExistingUserMessage(
      target.conversation_id,
      userRow.id,
      userRow.content,
      emitter,
      10,
      userImages
    )
  }

  private async streamResponseForExistingUserMessage(
    conversationId: string,
    currentUserMessageId: string,
    userMessageContent: string,
    emitter?: StreamEmitter,
    topK = 10,
    userImages?: MessageImage[]
  ): Promise<{ assistantMessageId: string; citations: MessageCitation[] }> {
    const existing = this.get(conversationId)
    if (!existing) throw new Error('对话不存在')

    const assistant = this.assistantService.resolveAssistant(existing.conversation.assistantId)
    const effectiveKbIds = existing.conversation.kbIds
    const effectivePresetId = existing.conversation.llmPresetId

    const citations: MessageCitation[] = []

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

    this.streamLLMResponse(
      assistantMessageId,
      conversationId,
      currentUserMessageId,
      userMessageContent,
      effectiveKbIds,
      topK,
      assistant,
      effectivePresetId,
      emitter,
      userImages
    ).catch((e) => {
      console.error('[chat:streamResponseForExistingUserMessage] LLM stream failed:', e)
      this.removeFailedAssistantMessage(conversationId, assistantMessageId)
      const messageText = e instanceof Error ? e.message : 'LLM 响应失败'
      emitter?.onError(assistantMessageId, messageText)
    })

    return { assistantMessageId, citations }
  }

  private async streamLLMResponse(
    assistantId: string,
    conversationId: string,
    currentUserMessageId: string,
    userMessage: string,
    kbIds: readonly string[],
    topK: number,
    assistant: Assistant,
    llmPresetId: string | null | undefined,
    emitter?: StreamEmitter,
    userImages?: MessageImage[]
  ): Promise<void> {
    const endpoint = this.resolveChatEndpoint(assistant, llmPresetId)
    if (!endpoint.apiUrl || !endpoint.apiKey) {
      throw new Error('未配置 LLM API，请在设置中填写')
    }

    const hasKb = kbIds.length > 0
    const systemPrompt = this.buildSystemPrompt(assistant.prompt, hasKb)
    const history = this.getMessages(conversationId)
    const initialMessages = buildChatCompletionMessages({
      systemPrompt,
      history,
      currentUserMessageId,
      currentAssistantMessageId: assistantId,
      userMessage,
      userImages,
      modelSupportsImage: endpoint.supportsImage
    })

    const controller = new AbortController()
    this.abortControllers.set(assistantId, controller)
    const timeoutId = setTimeout(() => {
      this.abortReasons.set(assistantId, 'timeout')
      controller.abort()
    }, 120000)

    const partialContent: string[] = []
    const partialReasoning: string[] = []
    const accumulatedContexts: SearchResult[] = []
    const tools = hasKb ? [knowledgeSearchToolSchema] : undefined
    let workingMessages: ChatCompletionMessage[] = initialMessages

    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        if (controller.signal.aborted) {
          throw new Error('aborted')
        }
        const isFinalRound = round === MAX_TOOL_ROUNDS
        const roundTools = isFinalRound ? undefined : tools

        const result = await this.fetchStreamOnce({
          endpoint,
          messages: workingMessages,
          tools: roundTools,
          assistant,
          controller,
          onDelta: (chunk) => {
            partialContent.push(chunk)
            emitter?.onDelta(assistantId, chunk)
          },
          onReasoning: (chunk) => {
            partialReasoning.push(chunk)
            emitter?.onReasoning(assistantId, chunk)
          }
        })

        if (result.toolCalls.length > 0 && !isFinalRound) {
          workingMessages = [
            ...workingMessages,
            {
              role: 'assistant',
              content: result.content || null,
              tool_calls: result.toolCalls
            }
          ]

          for (const call of result.toolCalls) {
            if (call.function.name === KNOWLEDGE_SEARCH_TOOL_NAME) {
              const args = parseKnowledgeSearchArgs(call.function.arguments)
              const hit = await executeKnowledgeSearch({
                searchService: this.searchService,
                kbIds,
                query: args.query,
                topK,
                rerankModelRef: assistant.rerankModelRef
              })
              accumulatedContexts.push(...hit.results)
              workingMessages = [
                ...workingMessages,
                { role: 'tool', content: hit.formattedContext, tool_call_id: call.id }
              ]
            } else {
              workingMessages = [
                ...workingMessages,
                {
                  role: 'tool',
                  content: `错误：未知工具 ${call.function.name}`,
                  tool_call_id: call.id
                }
              ]
            }
          }

          const citations: MessageCitation[] = accumulatedContexts.map((c, i) => ({
            index: i + 1,
            chunkId: c.chunkId,
            docId: c.docId,
            docTitle: c.docTitle,
            content: c.content,
            score: c.score
          }))
          this.db
            .prepare('UPDATE messages SET citations = ? WHERE id = ?')
            .run(JSON.stringify(citations), assistantId)

          continue
        }

        const fullContent = partialContent.join('')
        const fullReasoning = partialReasoning.join('')
        const now = new Date().toISOString()
        this.db
          .prepare('UPDATE messages SET content = ?, reasoning = ?, created_at = ? WHERE id = ?')
          .run(fullContent, fullReasoning, now, assistantId)
        this.db
          .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
          .run(now, conversationId)

        emitter?.onDone(assistantId, fullContent, fullReasoning, now)
        return
      }
    } catch (e) {
      const reason = this.abortReasons.get(assistantId)
      if (reason === 'user' || controller.signal.aborted) {
        const content = partialContent.join('')
        const reasoning = partialReasoning.join('')
        const now = new Date().toISOString()
        this.db
          .prepare('UPDATE messages SET content = ?, reasoning = ?, created_at = ? WHERE id = ?')
          .run(content, reasoning, now, assistantId)
        this.db
          .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
          .run(now, conversationId)
        emitter?.onDone(assistantId, content, reasoning, now)
        return
      }
      if (reason === 'timeout') {
        throw new Error('LLM 响应超时（120秒），请检查网络或稍后重试')
      }
      throw e
    } finally {
      clearTimeout(timeoutId)
      this.abortControllers.delete(assistantId)
      this.abortReasons.delete(assistantId)
    }
  }

  private async fetchStreamOnce(params: {
    endpoint: ChatModelEndpoint
    messages: ChatCompletionMessage[]
    tools: typeof knowledgeSearchToolSchema[] | undefined
    assistant: Assistant
    controller: AbortController
    onDelta: (text: string) => void
    onReasoning: (text: string) => void
  }): Promise<{ content: string; reasoning: string; toolCalls: ChatCompletionToolCall[] }> {
    const { endpoint, messages, tools, assistant, controller, onDelta, onReasoning } = params

    const body: Record<string, unknown> = {
      model: endpoint.model || 'gpt-4o-mini',
      messages,
      stream: true,
      ...this.enabledModelParams(assistant.modelParams),
      ...this.customParamsToObject(assistant.modelParams.customParameters)
    }
    if (tools && tools.length > 0) {
      body.tools = tools
    }

    let response: Response
    try {
      response = await net.fetch(endpoint.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${endpoint.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })
    } catch (_e) {
      if (controller.signal.aborted) {
        throw _e
      }
      throw new Error('无法连接到 LLM 服务，请检查 API 地址、网络连接或代理设置')
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(this.formatLLMError(response.status, text))
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('LLM 响应体不可读')

    const decoder = new TextDecoder()
    return this.readStream(reader, decoder, onDelta, onReasoning)
  }

  abortStream(assistantMessageId: string): boolean {
    const controller = this.abortControllers.get(assistantMessageId)
    if (!controller) return false
    this.abortReasons.set(assistantMessageId, 'user')
    controller.abort()
    return true
  }

  private resolveChatEndpoint(
    assistant: Assistant,
    llmPresetId: string | null | undefined
  ): ChatModelEndpoint {
    const settings = this.settingsService.get()
    let endpoint: ChatModelEndpoint = {
      apiUrl: settings.llmApiUrl,
      apiKey: settings.llmApiKey,
      model: settings.llmModel,
      supportsImage: false
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
          model: chatModel.id,
          supportsImage: !!chatModel.inputs?.image
        }
      }
    }

    return endpoint
  }

  private formatLLMError(status: number, body: string): string {
    if (status === 401 || status === 403) {
      return `API 密钥无效或无权限（HTTP ${status}），请检查 API Key 配置`
    }
    if (status === 429) {
      return '请求过于频繁或额度不足（HTTP 429），请稍后重试'
    }
    if (status >= 500) {
      return `LLM 服务暂时不可用（HTTP ${status}），请稍后重试或检查 API 服务商状态`
    }
    return `LLM API 错误 HTTP ${status}: ${body.slice(0, 200)}`
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
  ): Promise<{ content: string; reasoning: string; toolCalls: ChatCompletionToolCall[] }> {
    const contentBuffer: string[] = []
    const reasoningBuffer: string[] = []
    const toolCallAccumulator = new Map<number, ChatCompletionToolCall>()
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
          const toolCallDeltas = delta?.tool_calls
          if (toolCallDeltas) {
            for (const tc of toolCallDeltas) {
              const existing = toolCallAccumulator.get(tc.index)
              if (!existing) {
                toolCallAccumulator.set(tc.index, {
                  id: tc.id ?? '',
                  type: 'function',
                  function: {
                    name: tc.function?.name ?? '',
                    arguments: tc.function?.arguments ?? ''
                  }
                })
              } else {
                if (tc.id) existing.id = tc.id
                if (tc.function?.name) existing.function.name += tc.function.name
                if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
              }
            }
          }
        } catch {}
      }
    }

    const toolCalls: ChatCompletionToolCall[] = []
    const sortedIndices = [...toolCallAccumulator.keys()].sort((a, b) => a - b)
    for (const idx of sortedIndices) {
      const call = toolCallAccumulator.get(idx)
      if (call) toolCalls.push(call)
    }
    return {
      content: contentBuffer.join(''),
      reasoning: reasoningBuffer.join(''),
      toolCalls
    }
  }

  private appendMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    images?: MessageImage[]
  ): Message {
    const id = uuid()
    const now = new Date().toISOString()
    const imagesJson = images && images.length > 0 ? JSON.stringify(images) : null
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, created_at, images)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, conversationId, role, content, now, imagesJson)
    this.db
      .prepare(
        `UPDATE conversations
         SET message_count = message_count + 1, updated_at = ?
         WHERE id = ?`
      )
      .run(now, conversationId)
    return {
      id,
      conversationId,
      role,
      content,
      createdAt: now,
      images: images && images.length > 0 ? images : undefined
    }
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

  private buildSystemPrompt(assistantPrompt: string, hasKb: boolean): string {
    const basePrompt =
      assistantPrompt.trim() || '你是一个有帮助的助手。请用 Markdown 格式回答用户问题。'
    if (!hasKb) return basePrompt
    return `${basePrompt}

当前对话绑定了知识库。若用户问题需要查阅资料，请调用 \`knowledge_search\` 工具检索，工具返回的资料会以 [1] [2] 编号呈现；回答时使用对应编号标注引用。若用户消息是闲聊、格式化指令或对上文的操作，则不需要调用工具。`
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
    let images: MessageImage[] | undefined
    if (row.images) {
      try {
        const parsed = JSON.parse(row.images)
        if (Array.isArray(parsed) && parsed.length > 0) images = parsed
      } catch {
        images = undefined
      }
    }
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
      citations,
      reasoning: row.reasoning ?? undefined,
      images
    }
  }
}

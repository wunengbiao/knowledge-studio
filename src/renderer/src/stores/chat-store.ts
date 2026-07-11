import type { Conversation, Message, MessageCitation, MessageImage } from '@shared/types'
import { create } from 'zustand'
import { translate } from '../i18n'
import { useKBStore } from './kb-store'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

interface StreamEntry {
  conversationId: string
  content: string
  reasoning: string
}

// Context captured when a send/edit/regenerate fails, so the user can retry
// from the error banner without retyping. `retryMode` determines which store
// action to invoke:
// - 'send': user message was never persisted (IPC failure) -> fresh sendMessage.
// - 'edit': user message was persisted -> editMessage re-triggers streaming.
interface FailedSendContext {
  conversationId: string
  message: string
  kbIds: string[]
  images?: MessageImage[]
  webSearch: boolean
  assistantId?: string
  // For 'edit' mode: the persisted user message ID to call editMessage on.
  userMessageId?: string
  retryMode: 'send' | 'edit'
}

// Module-level bookkeeping: maps an in-flight assistantMessageId to its send
// context, so the `chat:error` handler can populate `lastFailedSend` with the
// original params (which the handler otherwise doesn't have access to). Not
// reactive state - just a lookup table. Cleared on stream-done / error /
// message deletion.
const inFlightSendContexts: Record<string, FailedSendContext> = {}

function stashSendContext(assistantMessageId: string, ctx: FailedSendContext): void {
  inFlightSendContexts[assistantMessageId] = ctx
}

function consumeSendContext(assistantMessageId: string): FailedSendContext | undefined {
  const ctx = inFlightSendContexts[assistantMessageId]
  if (ctx) {
    delete inFlightSendContexts[assistantMessageId]
  }
  return ctx
}

function clearSendContextsForConversation(conversationId: string): void {
  for (const [id, ctx] of Object.entries(inFlightSendContexts)) {
    if (ctx.conversationId === conversationId) {
      delete inFlightSendContexts[id]
    }
  }
}

interface ConversationDraft {
  text: string
  attachedImages: MessageImage[]
  selectedKbIds: string[]
  webSearchEnabled: boolean
}

interface ChatState {
  conversations: Conversation[]
  currentConversationId: string | null
  conversationMessages: Message[]
  // Active streams keyed by assistantMessageId. Supports concurrent streams
  // across different conversations so each conversation is fully isolated.
  streams: Record<string, StreamEntry>
  // Errors that arrived (chat:error) before the corresponding stream entry was
  // registered (race condition: IPC resolve lags behind the error event).
  // Keyed by assistantMessageId; consumed by sendMessage/editMessage/regenerateMessage.
  pendingStreamErrors: Record<string, string>
  // Per-conversation input drafts (unsent text/images/KBs/webSearch). In-memory
  // only; keyed by conversationId. Survives conversation switches but not app
  // restart. Each conversation's input settings are fully isolated.
  drafts: Record<string, ConversationDraft>
  error: string | null
  // When set, the error banner shows a Retry button that re-attempts the
  // failed send/edit/regenerate. Cleared on successful action start or
  // clearError. Scoped to a conversation - the retry button only renders
  // when lastFailedSend.conversationId === currentConversationId.
  lastFailedSend: FailedSendContext | null
  initialized: boolean
  archivedConversations: Conversation[]

  loadConversations: () => Promise<void>
  loadArchivedConversations: () => Promise<void>
  createConversation: (
    kbIds?: string[],
    llmPresetId?: string,
    assistantId?: string
  ) => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, name: string) => Promise<void>
  setConversationLlmPreset: (id: string, llmPresetId: string | null) => Promise<void>
  setConversationAssistant: (id: string, assistantId: string | null) => Promise<void>
  archiveConversation: (id: string) => Promise<void>
  unarchiveConversation: (id: string) => Promise<void>
  selectConversation: (id: string) => Promise<void>
  clearCurrentConversation: () => void
  sendMessage: (
    message: string,
    kbIds: string[],
    llmPresetId?: string,
    assistantId?: string,
    images?: MessageImage[],
    webSearch?: boolean
  ) => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>
  editMessage: (messageId: string, content: string, images?: MessageImage[]) => Promise<void>
  updateMessageContent: (messageId: string, content: string) => Promise<void>
  regenerateMessage: (assistantMessageId: string) => Promise<void>
  abortStream: (assistantMessageId: string) => Promise<void>
  subscribeProgress: () => () => void
  clearError: () => void
  retryLastFailedSend: () => Promise<void>
  setDraft: (conversationId: string, draft: ConversationDraft) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  conversationMessages: [],
  streams: {},
  pendingStreamErrors: {},
  drafts: {},
  error: null,
  lastFailedSend: null,
  initialized: false,
  archivedConversations: [],

  async loadConversations() {
    try {
      const conversations = await window.electronAPI.invoke('conversation:list')
      set({ conversations, initialized: true })
    } catch (e) {
      set({ error: errorMessage(e, translate('error.loadConversationsFailed')), initialized: true })
    }
  },

  async createConversation(kbIds, llmPresetId, assistantId) {
    const conversation = await window.electronAPI.invoke('conversation:create', {
      kbIds,
      llmPresetId,
      assistantId
    })
    const { conversations } = get()
    set({
      conversations: [conversation, ...conversations],
      currentConversationId: conversation.id,
      conversationMessages: []
    })
    window.electronAPI.invoke('conversation:get', { id: conversation.id })
    return conversation.id
  },

  async deleteConversation(id) {
    await window.electronAPI.invoke('conversation:delete', { id })
    const { conversations, currentConversationId, streams, drafts } = get()
    // Drop any active stream entries belonging to the deleted conversation.
    const remainingStreams: Record<string, StreamEntry> = {}
    for (const [key, entry] of Object.entries(streams)) {
      if (entry.conversationId !== id) {
        remainingStreams[key] = entry
      }
    }
    clearSendContextsForConversation(id)
    // Drop the orphaned draft so it doesn't linger in memory.
    const { [id]: _deletedDraft, ...remainingDrafts } = drafts
    set({
      conversations: conversations.filter((c) => c.id !== id),
      archivedConversations: get().archivedConversations.filter((c) => c.id !== id),
      currentConversationId: currentConversationId === id ? null : currentConversationId,
      conversationMessages: currentConversationId === id ? [] : get().conversationMessages,
      streams: remainingStreams,
      drafts: remainingDrafts,
      lastFailedSend: get().lastFailedSend?.conversationId === id ? null : get().lastFailedSend
    })
  },

  async renameConversation(id, name) {
    const updated = await window.electronAPI.invoke('conversation:rename', { id, name })
    set({
      conversations: get().conversations.map((c) => (c.id === id ? updated : c))
    })
  },

  async setConversationLlmPreset(id, llmPresetId) {
    const updated = await window.electronAPI.invoke('conversation:set-llm-preset', {
      id,
      llmPresetId
    })
    set({
      conversations: get().conversations.map((c) => (c.id === id ? updated : c))
    })
  },

  async setConversationAssistant(id, assistantId) {
    const updated = await window.electronAPI.invoke('conversation:set-assistant', {
      id,
      assistantId
    })
    set({
      conversations: get().conversations.map((c) => (c.id === id ? updated : c))
    })
  },

  async selectConversation(id) {
    const data = await window.electronAPI.invoke('conversation:get', { id })
    if (!data) {
      set({ currentConversationId: null, conversationMessages: [] })
      return
    }
    // Sync any in-flight stream content into the loaded messages so switching
    // back to a streaming conversation shows the accumulated content instead
    // of an empty placeholder.
    const streams = get().streams
    const messages = data.messages.map((m: Message) => {
      const entry = streams[m.id]
      if (entry) {
        return { ...m, content: entry.content, reasoning: entry.reasoning }
      }
      return m
    })
    set({
      currentConversationId: id,
      conversationMessages: messages,
      conversations: get().conversations.map((c) => (c.id === id ? data.conversation : c))
    })
  },

  clearCurrentConversation() {
    set({ currentConversationId: null, conversationMessages: [] })
  },

  async sendMessage(message, kbIds, llmPresetId, assistantId, images, webSearch) {
    console.log('[chat:debug:renderer] chat-store.sendMessage called', {
      webSearch,
      webSearchType: typeof webSearch,
      kbIds
    })
    const { currentConversationId } = get()
    if (!currentConversationId) {
      throw new Error(translate('error.noConversationSelected'))
    }

    // 乐观更新：立刻把用户消息推入列表，UI 即时显示，不必等 IPC 返回
    const optimisticUserMessage: Message = {
      id: `optimistic-${crypto.randomUUID()}`,
      conversationId: currentConversationId,
      role: 'user',
      content: message,
      createdAt: new Date().toISOString(),
      images: images && images.length > 0 ? images : undefined
    }

    set({
      error: null,
      lastFailedSend: null,
      conversationMessages: [...get().conversationMessages, optimisticUserMessage]
    })

    try {
      const settings = useKBStore.getState().settings
      console.log('[chat:debug:renderer] IPC conversation:send sending', {
        webSearch,
        webSearchType: typeof webSearch
      })
      const result = await window.electronAPI.invoke('conversation:send', {
        conversationId: currentConversationId,
        message,
        kbIds,
        rerankEnabled: false,
        topK: settings?.searchTopK ?? 10,
        embeddingTopK: settings?.embeddingTopK ?? 20,
        llmPresetId,
        assistantId,
        images,
        webSearch
      })

      const { conversations } = get()
      const now = new Date().toISOString()

      const assistantPlaceholder: Message = {
        id: result.assistantMessageId,
        conversationId: currentConversationId,
        role: 'assistant',
        content: '',
        reasoning: '',
        createdAt: now,
        citations: result.citations
      }

      // 用后端返回的真实用户消息替换乐观消息，保持列表位置不变
      const replaceOptimistic = (msgs: Message[]): Message[] => {
        const idx = msgs.findIndex((m) => m.id === optimisticUserMessage.id)
        if (idx === -1) return [...msgs, result.userMessage]
        const next = msgs.slice()
        next[idx] = result.userMessage
        return next
      }

      // Race condition: chat:error may have arrived before IPC resolved.
      // If so, consume the pending error instead of registering a new stream.
      const pendingError = get().pendingStreamErrors[result.assistantMessageId]
      if (pendingError) {
        const { [result.assistantMessageId]: _consumed, ...restErrors } = get().pendingStreamErrors
        consumeSendContext(result.assistantMessageId)
        set({
          conversationMessages: replaceOptimistic(get().conversationMessages),
          conversations: conversations.map((c) =>
            c.id === currentConversationId
              ? { ...c, messageCount: c.messageCount + 1, updatedAt: now }
              : c
          ),
          error: pendingError,
          pendingStreamErrors: restErrors,
          lastFailedSend: {
            conversationId: currentConversationId,
            message,
            kbIds,
            images,
            webSearch: webSearch ?? false,
            assistantId,
            userMessageId: result.userMessage.id,
            retryMode: 'edit'
          }
        })
        return
      }

      stashSendContext(result.assistantMessageId, {
        conversationId: currentConversationId,
        message,
        kbIds,
        images,
        webSearch: webSearch ?? false,
        assistantId,
        userMessageId: result.userMessage.id,
        retryMode: 'edit'
      })

      set({
        conversationMessages: [
          ...replaceOptimistic(get().conversationMessages),
          assistantPlaceholder
        ],
        conversations: conversations.map((c) =>
          c.id === currentConversationId
            ? { ...c, messageCount: c.messageCount + 2, updatedAt: now }
            : c
        ),
        streams: {
          ...get().streams,
          [result.assistantMessageId]: {
            conversationId: currentConversationId,
            content: '',
            reasoning: ''
          }
        }
      })
    } catch (e) {
      // IPC 失败：移除乐观消息，避免用户消息残留但后端未持久化
      set((state) => ({
        conversationMessages: state.conversationMessages.filter(
          (m) => m.id !== optimisticUserMessage.id
        ),
        error: errorMessage(e, translate('error.sendFailed')),
        lastFailedSend: {
          conversationId: currentConversationId,
          message,
          kbIds,
          images,
          webSearch: webSearch ?? false,
          assistantId,
          retryMode: 'send'
        }
      }))
    }
  },

  async deleteMessage(messageId) {
    const { currentConversationId, conversationMessages, conversations, streams } = get()
    if (!currentConversationId) return

    try {
      const result = await window.electronAPI.invoke('message:delete', { messageId })
      const deletedSet = new Set(result.deletedIds)
      // Drop any stream entries for deleted assistant messages so stale
      // streaming state doesn't linger after deletion.
      const remainingStreams: Record<string, StreamEntry> = {}
      for (const [key, entry] of Object.entries(streams)) {
        if (!deletedSet.has(key)) {
          remainingStreams[key] = entry
        }
      }
      for (const id of result.deletedIds) {
        consumeSendContext(id)
      }
      set({
        conversationMessages: conversationMessages.filter((m) => !deletedSet.has(m.id)),
        conversations: conversations.map((c) =>
          c.id === currentConversationId
            ? { ...c, messageCount: Math.max(c.messageCount - result.deletedIds.length, 0) }
            : c
        ),
        streams: remainingStreams
      })
    } catch (e) {
      set({ error: errorMessage(e, translate('error.deleteMessageFailed')) })
    }
  },

  async editMessage(messageId, content, images) {
    const { currentConversationId, conversationMessages } = get()
    if (!currentConversationId) throw new Error(translate('error.noConversationSelected'))

    const trimmed = content.trim()
    if (!trimmed) throw new Error(translate('error.messageEmpty'))

    const targetIndex = conversationMessages.findIndex((m) => m.id === messageId)
    if (targetIndex === -1) throw new Error(translate('error.messageNotFound'))

    const target = conversationMessages[targetIndex]
    if (target.role !== 'user') throw new Error(translate('error.onlyEditUserMessages'))

    const snapshot = conversationMessages
    const subsequentCount = conversationMessages.length - targetIndex - 1
    const optimisticMessages = [
      ...conversationMessages.slice(0, targetIndex),
      {
        ...target,
        content: trimmed,
        images: images && images.length > 0 ? images : undefined
      }
    ]

    set({
      error: null,
      lastFailedSend: null,
      conversationMessages: optimisticMessages
    })

    try {
      const settings = useKBStore.getState().settings
      const result = await window.electronAPI.invoke('message:edit', {
        messageId,
        content: trimmed,
        images,
        topK: settings?.searchTopK ?? 10,
        embeddingTopK: settings?.embeddingTopK ?? 20
      })
      const now = new Date().toISOString()

      const assistantPlaceholder: Message = {
        id: result.assistantMessageId,
        conversationId: currentConversationId,
        role: 'assistant',
        content: '',
        reasoning: '',
        createdAt: now,
        citations: result.citations
      }

      const replacedMessages = optimisticMessages.map((m) =>
        m.id === messageId ? result.userMessage : m
      )

      const editRetryCtx: FailedSendContext = {
        conversationId: currentConversationId,
        message: trimmed,
        kbIds: [],
        images,
        webSearch: false,
        userMessageId: messageId,
        retryMode: 'edit'
      }

      const pendingError = get().pendingStreamErrors[result.assistantMessageId]
      if (pendingError) {
        const { [result.assistantMessageId]: _consumed, ...restErrors } = get().pendingStreamErrors
        consumeSendContext(result.assistantMessageId)
        set({
          conversationMessages: replacedMessages,
          conversations: get().conversations.map((c) =>
            c.id === currentConversationId
              ? {
                  ...c,
                  messageCount: Math.max(c.messageCount - subsequentCount, 0),
                  updatedAt: now
                }
              : c
          ),
          error: pendingError,
          pendingStreamErrors: restErrors,
          lastFailedSend: editRetryCtx
        })
        return
      }

      stashSendContext(result.assistantMessageId, editRetryCtx)

      set({
        conversationMessages: [...replacedMessages, assistantPlaceholder],
        conversations: get().conversations.map((c) =>
          c.id === currentConversationId
            ? {
                ...c,
                messageCount: Math.max(c.messageCount - subsequentCount + 1, 0),
                updatedAt: now
              }
            : c
        ),
        streams: {
          ...get().streams,
          [result.assistantMessageId]: {
            conversationId: currentConversationId,
            content: '',
            reasoning: ''
          }
        }
      })
    } catch (e) {
      set({
        conversationMessages: snapshot,
        error: errorMessage(e, translate('error.editFailed')),
        lastFailedSend: {
          conversationId: currentConversationId,
          message: trimmed,
          kbIds: [],
          images,
          webSearch: false,
          userMessageId: messageId,
          retryMode: 'edit'
        }
      })
    }
  },

  async updateMessageContent(messageId, content) {
    const { currentConversationId, conversationMessages } = get()
    if (!currentConversationId) throw new Error(translate('error.noConversationSelected'))

    const trimmed = content.trim()
    if (!trimmed) throw new Error(translate('error.messageEmpty'))

    const targetIndex = conversationMessages.findIndex((m) => m.id === messageId)
    if (targetIndex === -1) throw new Error(translate('error.messageNotFound'))

    const snapshot = conversationMessages
    const optimisticMessages = conversationMessages.map((m) =>
      m.id === messageId ? { ...m, content: trimmed } : m
    )

    set({ error: null, conversationMessages: optimisticMessages })

    try {
      const result = await window.electronAPI.invoke('message:update', {
        messageId,
        content: trimmed
      })
      const now = new Date().toISOString()
      set({
        conversationMessages: optimisticMessages.map((m) =>
          m.id === messageId ? result.message : m
        ),
        conversations: get().conversations.map((c) =>
          c.id === currentConversationId ? { ...c, updatedAt: now } : c
        )
      })
    } catch (e) {
      set({
        conversationMessages: snapshot,
        error: errorMessage(e, translate('error.updateFailed'))
      })
    }
  },

  async regenerateMessage(assistantMessageId) {
    const { currentConversationId, conversationMessages } = get()
    if (!currentConversationId) throw new Error(translate('error.noConversationSelected'))

    const targetIndex = conversationMessages.findIndex((m) => m.id === assistantMessageId)
    if (targetIndex === -1) throw new Error(translate('error.messageNotFound'))

    const target = conversationMessages[targetIndex]
    if (target.role !== 'assistant')
      throw new Error(translate('error.onlyRegenerateAssistantMessages'))

    const snapshot = conversationMessages
    const subsequentCount = conversationMessages.length - targetIndex - 1
    const optimisticMessages = conversationMessages.slice(0, targetIndex)
    const precedingUserMessage = targetIndex > 0 ? conversationMessages[targetIndex - 1] : undefined

    set({
      error: null,
      lastFailedSend: null,
      conversationMessages: optimisticMessages
    })

    try {
      const settings = useKBStore.getState().settings
      const result = await window.electronAPI.invoke('message:regenerate', {
        assistantMessageId,
        topK: settings?.searchTopK ?? 10,
        embeddingTopK: settings?.embeddingTopK ?? 20
      })
      const now = new Date().toISOString()

      const assistantPlaceholder: Message = {
        id: result.assistantMessageId,
        conversationId: currentConversationId,
        role: 'assistant',
        content: '',
        reasoning: '',
        createdAt: now,
        citations: result.citations
      }

      const regenerateRetryCtx: FailedSendContext | null = precedingUserMessage
        ? {
            conversationId: currentConversationId,
            message: precedingUserMessage.content,
            kbIds: [],
            images: precedingUserMessage.images,
            webSearch: false,
            userMessageId: precedingUserMessage.id,
            retryMode: 'edit'
          }
        : null

      const pendingError = get().pendingStreamErrors[result.assistantMessageId]
      if (pendingError) {
        const { [result.assistantMessageId]: _consumed, ...restErrors } = get().pendingStreamErrors
        consumeSendContext(result.assistantMessageId)
        set({
          conversationMessages: optimisticMessages,
          conversations: get().conversations.map((c) =>
            c.id === currentConversationId
              ? {
                  ...c,
                  messageCount: Math.max(c.messageCount - subsequentCount - 1, 0),
                  updatedAt: now
                }
              : c
          ),
          error: pendingError,
          pendingStreamErrors: restErrors,
          lastFailedSend: regenerateRetryCtx
        })
        return
      }

      if (regenerateRetryCtx) {
        stashSendContext(result.assistantMessageId, regenerateRetryCtx)
      }

      set({
        conversationMessages: [...optimisticMessages, assistantPlaceholder],
        conversations: get().conversations.map((c) =>
          c.id === currentConversationId
            ? {
                ...c,
                messageCount: Math.max(c.messageCount - subsequentCount, 0),
                updatedAt: now
              }
            : c
        ),
        streams: {
          ...get().streams,
          [result.assistantMessageId]: {
            conversationId: currentConversationId,
            content: '',
            reasoning: ''
          }
        }
      })
    } catch (e) {
      set({
        conversationMessages: snapshot,
        error: errorMessage(e, translate('error.regenerateFailed')),
        lastFailedSend: precedingUserMessage
          ? {
              conversationId: currentConversationId,
              message: precedingUserMessage.content,
              kbIds: [],
              images: precedingUserMessage.images,
              webSearch: false,
              userMessageId: precedingUserMessage.id,
              retryMode: 'edit'
            }
          : null
      })
    }
  },

  async abortStream(assistantMessageId) {
    try {
      await window.electronAPI.invoke('chat:abort', { assistantMessageId })
    } catch (e) {
      set({ error: errorMessage(e, translate('error.abortFailed')) })
    }
  },

  subscribeProgress() {
    const cleanupDelta = window.electronAPI.on(
      'chat:stream-delta',
      ({ assistantMessageId, delta }) => {
        set((state) => {
          const entry = state.streams[assistantMessageId]
          if (!entry) return state
          const newContent = entry.content + delta
          const updatedMessages = state.conversationMessages.map((m) =>
            m.id === assistantMessageId ? { ...m, content: newContent } : m
          )
          return {
            streams: {
              ...state.streams,
              [assistantMessageId]: { ...entry, content: newContent }
            },
            conversationMessages: updatedMessages
          }
        })
      }
    )

    const cleanupReasoning = window.electronAPI.on(
      'chat:stream-reasoning',
      ({ assistantMessageId, delta }) => {
        set((state) => {
          const entry = state.streams[assistantMessageId]
          if (!entry) return state
          const newReasoning = entry.reasoning + delta
          const updatedMessages = state.conversationMessages.map((m) =>
            m.id === assistantMessageId ? { ...m, reasoning: newReasoning } : m
          )
          return {
            streams: {
              ...state.streams,
              [assistantMessageId]: { ...entry, reasoning: newReasoning }
            },
            conversationMessages: updatedMessages
          }
        })
      }
    )

    const cleanupCitations = window.electronAPI.on(
      'chat:stream-citations',
      ({ assistantMessageId, citations }) => {
        set((state) => ({
          conversationMessages: state.conversationMessages.map((m) =>
            m.id === assistantMessageId ? { ...m, citations } : m
          )
        }))
      }
    )

    const cleanupDone = window.electronAPI.on(
      'chat:stream-done',
      ({ assistantMessageId, content, reasoning, createdAt, citations }) => {
        consumeSendContext(assistantMessageId)
        set((state) => {
          const entry = state.streams[assistantMessageId]
          if (!entry) return state
          const updatedMessages = state.conversationMessages.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content, reasoning: reasoning || m.reasoning, createdAt, citations }
              : m
          )
          const { [assistantMessageId]: _consumed, ...restStreams } = state.streams
          return {
            conversationMessages: updatedMessages,
            streams: restStreams
          }
        })
      }
    )

    const cleanupError = window.electronAPI.on('chat:error', ({ error, assistantMessageId }) => {
      const failedCtx = assistantMessageId ? consumeSendContext(assistantMessageId) : undefined
      set((state) => {
        const entry = assistantMessageId ? state.streams[assistantMessageId] : undefined
        if (entry) {
          // Stream was already registered; remove it and the placeholder message.
          const { [assistantMessageId as string]: _consumed, ...restStreams } = state.streams
          return {
            conversationMessages: state.conversationMessages.filter(
              (message) => message.id !== assistantMessageId
            ),
            conversations: state.conversations.map((conversation) =>
              conversation.id === entry.conversationId
                ? { ...conversation, messageCount: Math.max(conversation.messageCount - 1, 0) }
                : conversation
            ),
            streams: restStreams,
            error,
            lastFailedSend: failedCtx ?? null
          }
        }
        // Race condition: error arrived before the stream entry was registered.
        // Stash it so sendMessage/editMessage/regenerateMessage can consume it
        // when their IPC resolve lands.
        if (assistantMessageId) {
          return {
            pendingStreamErrors: {
              ...state.pendingStreamErrors,
              [assistantMessageId]: error
            }
          }
        }
        // No assistantMessageId attached; just surface the error.
        return { error }
      })
    })

    return () => {
      cleanupDelta()
      cleanupReasoning()
      cleanupCitations()
      cleanupDone()
      cleanupError()
    }
  },

  clearError() {
    set({ error: null, lastFailedSend: null })
  },

  async retryLastFailedSend() {
    const ctx = get().lastFailedSend
    if (!ctx) return
    const {
      conversationId,
      message,
      kbIds,
      images,
      webSearch,
      assistantId,
      userMessageId,
      retryMode
    } = ctx
    set({ error: null, lastFailedSend: null })
    if (conversationId !== get().currentConversationId) {
      await get().selectConversation(conversationId)
    }
    if (retryMode === 'edit' && userMessageId) {
      await get().editMessage(userMessageId, message, images)
    } else {
      await get().sendMessage(message, kbIds, undefined, assistantId, images, webSearch)
    }
  },

  setDraft(conversationId, draft) {
    set((state) => ({ drafts: { ...state.drafts, [conversationId]: draft } }))
  },

  async loadArchivedConversations() {
    try {
      const archivedConversations = await window.electronAPI.invoke('conversation:list-archived')
      set({ archivedConversations })
    } catch (e) {
      set({ error: errorMessage(e, translate('error.loadConversationsFailed')) })
    }
  },

  async archiveConversation(id) {
    const updated = await window.electronAPI.invoke('conversation:set-archived', {
      id,
      archived: true
    })
    const { conversations, currentConversationId, streams } = get()
    const remainingStreams: Record<string, StreamEntry> = {}
    for (const [key, entry] of Object.entries(streams)) {
      if (entry.conversationId !== id) {
        remainingStreams[key] = entry
      }
    }
    clearSendContextsForConversation(id)
    // Drafts are kept so unarchive restores the unsent input (unlike delete).
    set({
      conversations: conversations.filter((c) => c.id !== id),
      archivedConversations: [updated, ...get().archivedConversations.filter((c) => c.id !== id)],
      currentConversationId: currentConversationId === id ? null : currentConversationId,
      conversationMessages: currentConversationId === id ? [] : get().conversationMessages,
      streams: remainingStreams,
      lastFailedSend: get().lastFailedSend?.conversationId === id ? null : get().lastFailedSend
    })
  },

  async unarchiveConversation(id) {
    const updated = await window.electronAPI.invoke('conversation:set-archived', {
      id,
      archived: false
    })
    const { conversations, archivedConversations } = get()
    set({
      conversations: [updated, ...conversations],
      archivedConversations: archivedConversations.filter((c) => c.id !== id)
    })
  }
}))

import type { Conversation, Message, MessageCitation, MessageImage } from '@shared/types'
import { translate } from '../i18n'
import { create } from 'zustand'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

interface StreamEntry {
  conversationId: string
  content: string
  reasoning: string
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
  error: string | null
  initialized: boolean

  loadConversations: () => Promise<void>
  createConversation: (
    kbIds?: string[],
    llmPresetId?: string,
    assistantId?: string
  ) => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, name: string) => Promise<void>
  setConversationLlmPreset: (id: string, llmPresetId: string | null) => Promise<void>
  setConversationAssistant: (id: string, assistantId: string | null) => Promise<void>
  selectConversation: (id: string) => Promise<void>
  clearCurrentConversation: () => void
  sendMessage: (
    message: string,
    kbIds: string[],
    llmPresetId?: string,
    assistantId?: string,
    images?: MessageImage[]
  ) => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>
  editMessage: (messageId: string, content: string, images?: MessageImage[]) => Promise<void>
  updateMessageContent: (messageId: string, content: string) => Promise<void>
  regenerateMessage: (assistantMessageId: string) => Promise<void>
  abortStream: (assistantMessageId: string) => Promise<void>
  subscribeProgress: () => () => void
  clearError: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  conversationMessages: [],
  streams: {},
  pendingStreamErrors: {},
  error: null,
  initialized: false,

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
    const { conversations, currentConversationId, streams } = get()
    // Drop any active stream entries belonging to the deleted conversation.
    const remainingStreams: Record<string, StreamEntry> = {}
    for (const [key, entry] of Object.entries(streams)) {
      if (entry.conversationId !== id) {
        remainingStreams[key] = entry
      }
    }
    set({
      conversations: conversations.filter((c) => c.id !== id),
      currentConversationId: currentConversationId === id ? null : currentConversationId,
      conversationMessages: currentConversationId === id ? [] : get().conversationMessages,
      streams: remainingStreams
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

  async sendMessage(message, kbIds, llmPresetId, assistantId, images) {
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
      conversationMessages: [...get().conversationMessages, optimisticUserMessage]
    })

    try {
      const result = await window.electronAPI.invoke('conversation:send', {
        conversationId: currentConversationId,
        message,
        kbIds,
        rerankEnabled: false,
        topK: 10,
        llmPresetId,
        assistantId,
        images
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
        set({
          conversationMessages: replaceOptimistic(get().conversationMessages),
          conversations: conversations.map((c) =>
            c.id === currentConversationId
              ? { ...c, messageCount: c.messageCount + 1, updatedAt: now }
              : c
          ),
          error: pendingError,
          pendingStreamErrors: restErrors
        })
        return
      }

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
        error: errorMessage(e, translate('error.sendFailed'))
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
      conversationMessages: optimisticMessages
    })

    try {
      const result = await window.electronAPI.invoke('message:edit', {
        messageId,
        content: trimmed,
        images
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

      const pendingError = get().pendingStreamErrors[result.assistantMessageId]
      if (pendingError) {
        const { [result.assistantMessageId]: _consumed, ...restErrors } = get().pendingStreamErrors
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
          pendingStreamErrors: restErrors
        })
        return
      }

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
        error: errorMessage(e, translate('error.editFailed'))
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
    if (target.role !== 'assistant') throw new Error(translate('error.onlyRegenerateAssistantMessages'))

    const snapshot = conversationMessages
    const subsequentCount = conversationMessages.length - targetIndex - 1
    const optimisticMessages = conversationMessages.slice(0, targetIndex)

    set({
      error: null,
      conversationMessages: optimisticMessages
    })

    try {
      const result = await window.electronAPI.invoke('message:regenerate', {
        assistantMessageId
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

      const pendingError = get().pendingStreamErrors[result.assistantMessageId]
      if (pendingError) {
        const { [result.assistantMessageId]: _consumed, ...restErrors } = get().pendingStreamErrors
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
          pendingStreamErrors: restErrors
        })
        return
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
        error: errorMessage(e, translate('error.regenerateFailed'))
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

    const cleanupDone = window.electronAPI.on(
      'chat:stream-done',
      ({ assistantMessageId, content, reasoning, createdAt, citations }) => {
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
            error
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
      cleanupDone()
      cleanupError()
    }
  },

  clearError() {
    set({ error: null })
  }
}))

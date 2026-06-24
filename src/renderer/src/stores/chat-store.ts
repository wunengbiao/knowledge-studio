import type { Conversation, Message, MessageCitation } from '@shared/types'
import { create } from 'zustand'

interface ChatState {
  conversations: Conversation[]
  currentConversationId: string | null
  conversationMessages: Message[]
  sending: boolean
  streamingContent: string | null
  streamingMessageId: string | null
  error: string | null
  initialized: boolean

  loadConversations: () => Promise<void>
  createConversation: (kbIds?: string[], llmPresetId?: string) => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, name: string) => Promise<void>
  setConversationLlmPreset: (id: string, llmPresetId: string | null) => Promise<void>
  selectConversation: (id: string) => Promise<void>
  sendMessage: (message: string, kbIds: string[], llmPresetId?: string) => Promise<void>
  subscribeProgress: () => () => void
  clearError: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  conversationMessages: [],
  sending: false,
  streamingContent: null,
  streamingMessageId: null,
  error: null,
  initialized: false,

  async loadConversations() {
    try {
      const conversations = await window.electronAPI.invoke('conversation:list')
      set({ conversations, initialized: true })
    } catch (e: any) {
      set({ error: e.message || '加载对话列表失败', initialized: true })
    }
  },

  async createConversation(kbIds, llmPresetId) {
    const conversation = await window.electronAPI.invoke('conversation:create', { kbIds, llmPresetId })
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
    const { conversations, currentConversationId } = get()
    set({
      conversations: conversations.filter((c) => c.id !== id),
      currentConversationId: currentConversationId === id ? null : currentConversationId,
      conversationMessages: currentConversationId === id ? [] : get().conversationMessages
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

  async selectConversation(id) {
    const data = await window.electronAPI.invoke('conversation:get', { id })
    if (!data) {
      set({ currentConversationId: null, conversationMessages: [] })
      return
    }
    set({
      currentConversationId: id,
      conversationMessages: data.messages,
      conversations: get().conversations.map((c) => (c.id === id ? data.conversation : c))
    })
  },

  async sendMessage(message, kbIds, llmPresetId) {
    const { currentConversationId } = get()
    if (!currentConversationId) {
      throw new Error('未选择对话')
    }
    set({ sending: true, streamingContent: null, error: null })
    try {
      const result = await window.electronAPI.invoke('conversation:send', {
        conversationId: currentConversationId,
        message,
        kbIds,
        rerankEnabled: false,
        topK: 10,
        llmPresetId
      })

      const { conversations } = get()
      const now = new Date().toISOString()

      const userMessage: Message = {
        ...result.userMessage,
        createdAt: result.userMessage.createdAt
      }

      const assistantPlaceholder: Message = {
        id: result.assistantMessageId,
        conversationId: currentConversationId,
        role: 'assistant',
        content: '',
        createdAt: now,
        citations: result.citations
      }

      set({
        conversationMessages: [
          ...get().conversationMessages,
          userMessage,
          assistantPlaceholder
        ],
        conversations: conversations.map((c) =>
          c.id === currentConversationId
            ? { ...c, messageCount: c.messageCount + 2, updatedAt: now }
            : c
        ),
        streamingContent: '',
        streamingMessageId: result.assistantMessageId
      })
    } catch (e: any) {
      set({ sending: false, error: e.message || '发送失败' })
    }
  },

  subscribeProgress() {
    const cleanupDelta = window.electronAPI.on('chat:stream-delta', ({ assistantMessageId, delta }) => {
      set((state) => {
        if (state.streamingMessageId !== assistantMessageId) return state
        const newContent = (state.streamingContent ?? '') + delta
        const updatedMessages = state.conversationMessages.map((m) =>
          m.id === assistantMessageId ? { ...m, content: newContent } : m
        )
        return { streamingContent: newContent, conversationMessages: updatedMessages }
      })
    })

    const cleanupDone = window.electronAPI.on('chat:stream-done', ({ assistantMessageId, content, createdAt }) => {
      set((state) => {
        if (state.streamingMessageId !== assistantMessageId) return state
        const updatedMessages = state.conversationMessages.map((m) =>
          m.id === assistantMessageId ? { ...m, content, createdAt } : m
        )
        return {
          conversationMessages: updatedMessages,
          sending: false,
          streamingContent: null,
          streamingMessageId: null
        }
      })
    })

    const cleanupError = window.electronAPI.on('chat:error', ({ error, assistantMessageId }) => {
      set((state) => {
        if (assistantMessageId && state.streamingMessageId !== assistantMessageId) return state
        return { sending: false, error, streamingContent: null, streamingMessageId: null }
      })
    })

    return () => {
      cleanupDelta()
      cleanupDone()
      cleanupError()
    }
  },

  clearError() {
    set({ error: null })
  }
}))

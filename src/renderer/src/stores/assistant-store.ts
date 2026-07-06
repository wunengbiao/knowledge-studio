import type { Assistant } from '@shared/types'
import { create } from 'zustand'

type AssistantUpdate = Partial<Omit<Assistant, 'id' | 'createdAt' | 'updatedAt'>>

type AssistantCreate = {
  readonly name?: string
  readonly description?: string
  readonly prompt?: string
  readonly providerId?: string | null
  readonly modelId?: string | null
  readonly modelParams?: Partial<Assistant['modelParams']>
  readonly knowledgeBaseIds?: string[]
}

interface AssistantState {
  assistants: Assistant[]
  loading: boolean
  error: string | null

  loadAssistants: () => Promise<void>
  createAssistant: (params: AssistantCreate) => Promise<Assistant>
  updateAssistant: (id: string, updates: AssistantUpdate) => Promise<Assistant>
  deleteAssistant: (id: string) => Promise<void>
  clearError: () => void
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  assistants: [],
  loading: false,
  error: null,

  async loadAssistants() {
    set({ loading: true, error: null })
    try {
      const assistants = await window.electronAPI.invoke('assistant:list')
      set({ assistants, loading: false })
    } catch (error) {
      set({ error: errorMessage(error, '加载助手失败'), loading: false })
    }
  },

  async createAssistant(params) {
    const assistant = await window.electronAPI.invoke('assistant:create', params)
    set({ assistants: [assistant, ...get().assistants] })
    return assistant
  },

  async updateAssistant(id, updates) {
    const assistant = await window.electronAPI.invoke('assistant:update', { id, updates })
    set({ assistants: get().assistants.map((item) => (item.id === id ? assistant : item)) })
    return assistant
  },

  async deleteAssistant(id) {
    await window.electronAPI.invoke('assistant:delete', { id })
    set({ assistants: get().assistants.filter((assistant) => assistant.id !== id) })
  },

  clearError() {
    set({ error: null })
  }
}))

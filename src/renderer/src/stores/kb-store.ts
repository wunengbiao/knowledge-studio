import { create } from 'zustand'
import type { KnowledgeBase, AppSettings } from '@shared/types'

interface KBState {
  knowledgeBases: KnowledgeBase[]
  selectedKbId: string | null
  settings: AppSettings | null
  loading: boolean
  createModalOpen: boolean

  loadKnowledgeBases: () => Promise<void>
  createKB: (params: {
    name: string
    description: string
    category: KnowledgeBase['category']
    embeddingApiUrl: string
    embeddingApiKey: string
    embeddingModel: string
    chunkSize?: number
    chunkOverlap?: number
  }) => Promise<KnowledgeBase>
  updateKB: (id: string, updates: Partial<KnowledgeBase>) => Promise<KnowledgeBase>
  deleteKB: (id: string) => Promise<void>
  selectKB: (id: string | null) => void
  loadSettings: () => Promise<void>
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>
  openCreateModal: () => void
  closeCreateModal: () => void
}

export const useKBStore = create<KBState>((set, get) => ({
  knowledgeBases: [],
  selectedKbId: null,
  settings: null,
  loading: false,
  createModalOpen: false,

  loadKnowledgeBases: async () => {
    set({ loading: true })
    const kbs = await window.electronAPI.invoke('kb:list')
    set({ knowledgeBases: kbs, loading: false })
  },

  createKB: async (params) => {
    const kb = await window.electronAPI.invoke('kb:create', params)
    set((s) => ({ knowledgeBases: [kb, ...s.knowledgeBases] }))
    return kb
  },

  updateKB: async (id, updates) => {
    const kb = await window.electronAPI.invoke('kb:update', { id, updates })
    set((s) => ({
      knowledgeBases: s.knowledgeBases.map((k) => (k.id === id ? kb : k))
    }))
    return kb
  },

  deleteKB: async (id) => {
    await window.electronAPI.invoke('kb:delete', { id })
    set((s) => ({
      knowledgeBases: s.knowledgeBases.filter((kb) => kb.id !== id),
      selectedKbId: s.selectedKbId === id ? null : s.selectedKbId
    }))
  },

  selectKB: (id) => set({ selectedKbId: id }),

  loadSettings: async () => {
    const settings = await window.electronAPI.invoke('settings:get')
    set({ settings })
  },

  updateSettings: async (updates) => {
    const settings = await window.electronAPI.invoke('settings:update', updates)
    set({ settings })
  },

  openCreateModal: () => set({ createModalOpen: true }),
  closeCreateModal: () => set({ createModalOpen: false })
}))

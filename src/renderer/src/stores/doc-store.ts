import type { Document, SearchResult } from '@shared/types'
import { create } from 'zustand'
import { translate } from '../i18n'
import { useKBStore } from './kb-store'

let uploadSeq = 0

interface ProgressInfo {
  current: number
  total: number
  status: string
}

interface DocState {
  documents: Document[]
  searchResults: SearchResult[]
  searchQuery: string
  searchMode: 'bm25' | 'vector' | 'hybrid' | 'graph'
  uploading: boolean
  uploadProgress: ProgressInfo | null
  embeddingProgress: ProgressInfo | null
  searchError: string | null
  backfillProgress: ProgressInfo | null
  docEmbeddingProgress: Record<string, ProgressInfo>
  currentKbId: string | null

  loadDocuments: (kbId: string) => Promise<void>
  uploadFile: (kbId: string, sourceType: 'docx' | 'pdf' | 'text') => Promise<void>
  importUrl: (kbId: string, url: string) => Promise<void>
  deleteDocument: (docId: string) => Promise<void>
  renameDocument: (docId: string, title: string) => Promise<void>
  retryEmbedding: (docId: string) => Promise<void>
  search: (
    kbId: string,
    query: string,
    mode: 'bm25' | 'vector' | 'hybrid' | 'graph'
  ) => Promise<void>
  setSearchQuery: (query: string) => void
  setSearchMode: (mode: 'bm25' | 'vector' | 'hybrid' | 'graph') => void
  clearSearch: () => void
  subscribeProgress: () => () => void
}

export const useDocStore = create<DocState>((set, get) => ({
  documents: [],
  searchResults: [],
  searchQuery: '',
  searchMode: 'hybrid',
  uploading: false,
  uploadProgress: null,
  embeddingProgress: null,
  searchError: null,
  backfillProgress: null,
  docEmbeddingProgress: {},
  currentKbId: null,

  loadDocuments: async (kbId) => {
    set({ currentKbId: kbId })
    const docs = await window.electronAPI.invoke('doc:list', { kbId })
    set({ documents: docs })
  },

  uploadFile: async (kbId, sourceType) => {
    const filePath = await window.electronAPI.invoke('dialog:open-file', {
      filters: [
        sourceType === 'docx'
          ? { name: 'Word Documents', extensions: ['docx'] }
          : sourceType === 'text'
            ? { name: 'Text / Markdown', extensions: ['txt', 'md', 'markdown'] }
            : { name: 'PDF Documents', extensions: ['pdf'] }
      ]
    })
    if (!filePath) return

    const lowerPath = filePath.toLowerCase()
    const actualSourceType: 'docx' | 'pdf' | 'txt' | 'md' =
      sourceType === 'docx'
        ? 'docx'
        : sourceType === 'pdf'
          ? 'pdf'
          : lowerPath.endsWith('.md') || lowerPath.endsWith('.markdown')
            ? 'md'
            : 'txt'

    const mySeq = ++uploadSeq
    set({ uploading: true, uploadProgress: { current: 0, total: 100, status: 'Starting...' } })

    const cleanup = window.electronAPI.on('progress:indexing', (data) => {
      if (data.kbId !== kbId) return
      set({ uploadProgress: { current: data.current, total: data.total, status: data.status } })
    })

    try {
      const doc = await window.electronAPI.invoke('doc:upload', {
        kbId,
        filePath,
        sourceType: actualSourceType
      })
      set((s) => ({ documents: [doc, ...s.documents], uploading: false }))
      useKBStore.getState().loadKnowledgeBases()
      setTimeout(() => {
        if (mySeq === uploadSeq) set({ uploadProgress: null })
      }, 800)
    } finally {
      cleanup()
    }
  },

  importUrl: async (kbId, url) => {
    const mySeq = ++uploadSeq
    set({ uploading: true, uploadProgress: { current: 0, total: 100, status: 'Fetching...' } })

    const cleanup = window.electronAPI.on('progress:indexing', (data) => {
      if (data.kbId !== kbId) return
      set({ uploadProgress: { current: data.current, total: data.total, status: data.status } })
    })

    try {
      const doc = await window.electronAPI.invoke('doc:import-url', { kbId, url })
      if (doc) {
        set((s) => ({ documents: [doc, ...s.documents], uploading: false }))
        useKBStore.getState().loadKnowledgeBases()
        setTimeout(() => {
          if (mySeq === uploadSeq) set({ uploadProgress: null })
        }, 800)
      } else {
        set({ uploading: false })
      }
    } finally {
      cleanup()
    }
  },

  deleteDocument: async (docId) => {
    await window.electronAPI.invoke('doc:delete', { docId })
    set((s) => ({ documents: s.documents.filter((d) => d.id !== docId) }))
    useKBStore.getState().loadKnowledgeBases()
  },

  renameDocument: async (docId, title) => {
    const doc = await window.electronAPI.invoke('doc:rename', { docId, title })
    set((s) => ({
      documents: s.documents.map((d) => (d.id === docId ? doc : d))
    }))
  },

  retryEmbedding: async (docId) => {
    await window.electronAPI.invoke('embedding:retry', { docId })
  },

  search: async (kbId, query, mode) => {
    if (!query.trim()) {
      set({ searchResults: [], searchError: null, embeddingProgress: null })
      return
    }
    set({ searchError: null, embeddingProgress: null })

    const cleanup = window.electronAPI.on('progress:embedding', (data) => {
      if (data.kbId !== kbId) return
      set({ embeddingProgress: { current: data.current, total: data.total, status: data.status } })
    })

    try {
      const settings = useKBStore.getState().settings
      const results = await window.electronAPI.invoke('search:query', {
        kbId,
        query,
        mode,
        topK: settings?.searchTopK ?? 10,
        embeddingTopK: settings?.embeddingTopK ?? 20
      })
      set({ searchResults: results, searchQuery: query, searchMode: mode })
    } catch (e: any) {
      set({
        searchResults: [],
        searchQuery: query,
        searchMode: mode,
        searchError: e?.message || translate('error.searchFailed')
      })
    } finally {
      cleanup()
      set({ embeddingProgress: null })
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchMode: (mode) => set({ searchMode: mode }),
  clearSearch: () =>
    set({ searchResults: [], searchQuery: '', searchError: null, embeddingProgress: null }),

  subscribeProgress: () => {
    const unsubBackfill = window.electronAPI.on('progress:backfill', (data) => {
      set({ backfillProgress: { current: data.current, total: data.total, status: data.status } })
      if (data.current >= data.total && data.total > 0) {
        setTimeout(() => {
          const cur = get().backfillProgress
          if (cur && cur.current >= cur.total) set({ backfillProgress: null })
        }, 2000)
      }
    })

    const unsubDocEmb = window.electronAPI.on('progress:doc-embedding', (data) => {
      console.log('[progress:doc-embedding]', data)
      set((s) => ({
        docEmbeddingProgress: {
          ...s.docEmbeddingProgress,
          [data.docId]: {
            current: data.current,
            total: data.total,
            status: data.status
          }
        }
      }))
      if (data.current >= data.total && data.total > 0) {
        const { currentKbId } = get()
        if (currentKbId) {
          get().loadDocuments(currentKbId)
        }
        setTimeout(() => {
          const cur = get().docEmbeddingProgress[data.docId]
          if (cur && cur.current >= cur.total) {
            set((s) => {
              const next = { ...s.docEmbeddingProgress }
              delete next[data.docId]
              return { docEmbeddingProgress: next }
            })
          }
        }, 1500)
      }
    })

    return () => {
      unsubBackfill()
      unsubDocEmb()
    }
  }
}))

import { create } from 'zustand'
import type { GraphEntity, GraphRelation, CommunityReport } from '@shared/types'

interface GraphState {
  entities: GraphEntity[]
  relations: GraphRelation[]
  communities: CommunityReport[]
  graphBuilt: boolean
  building: boolean
  buildProgress: { current: number; total: number; status: string } | null

  loadGraph: (kbId: string) => Promise<void>
  buildGraph: (kbId: string) => Promise<void>
}

export const useGraphStore = create<GraphState>((set) => ({
  entities: [],
  relations: [],
  communities: [],
  graphBuilt: false,
  building: false,
  buildProgress: null,

  loadGraph: async (kbId) => {
    const [status, entities, relations, communities] = await Promise.all([
      window.electronAPI.invoke('graph:status', { kbId }),
      window.electronAPI.invoke('graph:entities', { kbId }),
      window.electronAPI.invoke('graph:relations', { kbId }),
      window.electronAPI.invoke('graph:communities', { kbId })
    ])
    set({
      graphBuilt: status.built,
      entities,
      relations,
      communities
    })
  },

  buildGraph: async (kbId) => {
    set({ building: true, buildProgress: null })
    const cleanup = window.electronAPI.on('progress:graph-build', (data) => {
      if (data.kbId !== kbId) return
      set({ buildProgress: { current: data.current, total: data.total, status: data.status } })
    })
    try {
      await window.electronAPI.invoke('graph:build', { kbId })
      const [entities, relations, communities] = await Promise.all([
        window.electronAPI.invoke('graph:entities', { kbId }),
        window.electronAPI.invoke('graph:relations', { kbId }),
        window.electronAPI.invoke('graph:communities', { kbId })
      ])
      set({ graphBuilt: true, entities, relations, communities, building: false, buildProgress: null })
    } catch {
      set({ building: false, buildProgress: null })
    } finally {
      cleanup()
    }
  }
}))

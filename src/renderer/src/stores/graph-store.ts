import { create } from 'zustand'
import type { GraphEntity, GraphRelation, CommunityReport } from '@shared/types'

interface GraphState {
  entities: GraphEntity[]
  relations: GraphRelation[]
  communities: CommunityReport[]
  graphBuilt: boolean
  building: boolean

  loadGraph: (kbId: string) => Promise<void>
  buildGraph: (kbId: string) => Promise<void>
}

export const useGraphStore = create<GraphState>((set) => ({
  entities: [],
  relations: [],
  communities: [],
  graphBuilt: false,
  building: false,

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
    set({ building: true })
    try {
      await window.electronAPI.invoke('graph:build', { kbId })
      const [entities, relations, communities] = await Promise.all([
        window.electronAPI.invoke('graph:entities', { kbId }),
        window.electronAPI.invoke('graph:relations', { kbId }),
        window.electronAPI.invoke('graph:communities', { kbId })
      ])
      set({ graphBuilt: true, entities, relations, communities, building: false })
    } catch {
      set({ building: false })
    }
  }
}))

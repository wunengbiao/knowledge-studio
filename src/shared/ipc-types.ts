import type {
  KnowledgeBase,
  Document,
  SearchResult,
  GraphEntity,
  GraphRelation,
  CommunityReport,
  AppSettings,
  Conversation,
  Message,
  MessageCitation
} from './types'

export interface IpcChannels {
  // Knowledge Base
  'kb:list': { request: void; response: KnowledgeBase[] }
  'kb:create': {
    request: {
      name: string
      description: string
      category: KnowledgeBase['category']
      embeddingApiUrl: string
      embeddingApiKey: string
      embeddingModel: string
      chunkSize?: number
      chunkOverlap?: number
    }
    response: KnowledgeBase
  }
  'kb:update': { request: { id: string; updates: Partial<KnowledgeBase> }; response: KnowledgeBase }
  'kb:delete': { request: { id: string }; response: boolean }
  'kb:get': { request: { id: string }; response: KnowledgeBase | null }

  // Documents
  'doc:list': { request: { kbId: string }; response: Document[] }
  'doc:upload': {
    request: { kbId: string; filePath: string; sourceType: 'docx' | 'pdf' | 'txt' | 'md' }
    response: Document
  }
  'doc:import-url': { request: { kbId: string; url: string }; response: Document }
  'doc:delete': { request: { docId: string }; response: boolean }
  'doc:get': { request: { docId: string }; response: Document | null }

  // Search
  'search:query': {
    request: {
      kbId: string
      query: string
      mode: 'bm25' | 'vector' | 'hybrid' | 'graph'
      topK: number
    }
    response: SearchResult[]
  }

  // GraphRAG
  'graph:build': { request: { kbId: string }; response: { entityCount: number; relationCount: number } }
  'graph:entities': { request: { kbId: string }; response: GraphEntity[] }
  'graph:relations': { request: { kbId: string }; response: GraphRelation[] }
  'graph:communities': { request: { kbId: string }; response: CommunityReport[] }
  'graph:status': { request: { kbId: string }; response: { built: boolean; entityCount: number; relationCount: number } }

  // Settings
  'settings:get': { request: void; response: AppSettings }
  'settings:update': { request: Partial<AppSettings>; response: AppSettings }
  'settings:test-embedding': { request: AppSettings; response: { success: boolean; message: string } }
  'settings:test-rerank': { request: AppSettings; response: { success: boolean; message: string } }

  // Embedding management (KB-level)
  'kb:test-embedding': {
    request: { embeddingApiUrl: string; embeddingApiKey: string; embeddingModel: string }
    response: { success: boolean; message: string }
  }
  'embedding:status': {
    request: { kbId: string }
    response: { docId: string; status: import('./types').EmbeddingStatus; done: number; total: number; error?: string }[]
  }
  'embedding:retry': { request: { docId: string }; response: boolean }

  // File dialog
  'dialog:open-file': {
    request: { filters: { name: string; extensions: string[] }[] }
    response: string | null
  }

  // Chat Conversations
  'conversation:list': { request: void; response: Conversation[] }
  'conversation:create': { request: { kbIds?: string[] }; response: Conversation }
  'conversation:delete': { request: { id: string }; response: boolean }
  'conversation:rename': { request: { id: string; name: string }; response: Conversation }
  'conversation:get': { request: { id: string }; response: { conversation: Conversation; messages: Message[] } | null }
  'conversation:send': {
    request: { conversationId: string; message: string; kbIds: string[]; rerankEnabled: boolean; topK: number }
    response: { userMessage: Message; assistantMessageId: string; citations: MessageCitation[] }
  }
  'conversation:messages': { request: { conversationId: string }; response: Message[] }

  // Progress events (main → renderer)
  'progress:indexing': { request: void; response: { kbId: string; current: number; total: number; status: string } }
  'progress:embedding': { request: void; response: { kbId: string; current: number; total: number; status: string } }
  'progress:doc-embedding': { request: void; response: { docId: string; current: number; total: number; status: string } }
  'progress:backfill': { request: void; response: { current: number; total: number; status: string } }
  'chat:error': { request: void; response: { error: string; assistantMessageId?: string } }
  'chat:stream-delta': { request: void; response: { assistantMessageId: string; delta: string } }
  'chat:stream-done': { request: void; response: { assistantMessageId: string; content: string; createdAt: string } }
}

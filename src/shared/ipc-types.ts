import type {
  ActiveModelRef,
  AppSettings,
  Assistant,
  CommunityReport,
  Conversation,
  Document,
  GraphEntity,
  GraphRelation,
  KnowledgeBase,
  Message,
  MessageCitation,
  MessageImage,
  SearchResult
} from './types'

export interface IpcChannels {
  // Knowledge Base
  'kb:list': { request: undefined; response: KnowledgeBase[] }
  'kb:create': {
    request: {
      name: string
      description: string
      category: KnowledgeBase['category']
      icon?: string | null
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
  'doc:rename': { request: { docId: string; title: string }; response: Document }

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
  'graph:build': {
    request: { kbId: string }
    response: { entityCount: number; relationCount: number }
  }
  'graph:entities': { request: { kbId: string }; response: GraphEntity[] }
  'graph:relations': { request: { kbId: string }; response: GraphRelation[] }
  'graph:communities': { request: { kbId: string }; response: CommunityReport[] }
  'graph:status': {
    request: { kbId: string }
    response: { built: boolean; entityCount: number; relationCount: number }
  }

  // Settings
  'settings:get': { request: undefined; response: AppSettings }
  'settings:update': { request: Partial<AppSettings>; response: AppSettings }
  'settings:test-embedding': {
    request: AppSettings
    response: { success: boolean; message: string }
  }
  'settings:test-rerank': { request: AppSettings; response: { success: boolean; message: string } }
  'settings:test-llm': { request: AppSettings; response: { success: boolean; message: string } }
  'provider:list-models': {
    request: { apiHost: string; apiKey: string; kind: import('./types').ProviderKind }
    response: {
      success: boolean
      message?: string
      models: { id: string; name?: string; ownedBy?: string }[]
    }
  }

  // Embedding management (KB-level)
  'kb:test-embedding': {
    request: { embeddingApiUrl: string; embeddingApiKey: string; embeddingModel: string }
    response: { success: boolean; message: string }
  }
  'embedding:status': {
    request: { kbId: string }
    response: {
      docId: string
      status: import('./types').EmbeddingStatus
      done: number
      total: number
      error?: string
    }[]
  }
  'embedding:retry': { request: { docId: string }; response: boolean }

  // File dialog
  'dialog:open-file': {
    request: { filters: { name: string; extensions: string[] }[] }
    response: string | null
  }

  // Assistants
  'assistant:list': { request: undefined; response: Assistant[] }
  'assistant:get': { request: { id: string }; response: Assistant | null }
  'assistant:create': {
    request: {
      name?: string
      description?: string
      prompt?: string
      providerId?: string | null
      modelId?: string | null
      rerankModelRef?: ActiveModelRef | null
      contextCount?: number
      modelParams?: Partial<Assistant['modelParams']>
      knowledgeBaseIds?: string[]
    }
    response: Assistant
  }
  'assistant:update': {
    request: {
      id: string
      updates: Partial<Omit<Assistant, 'id' | 'createdAt' | 'updatedAt'>>
    }
    response: Assistant
  }
  'assistant:delete': { request: { id: string }; response: boolean }

  // Chat Conversations
  'conversation:list': { request: undefined; response: Conversation[] }
  'conversation:create': {
    request: { kbIds?: string[]; llmPresetId?: string; assistantId?: string }
    response: Conversation
  }
  'conversation:delete': { request: { id: string }; response: boolean }
  'conversation:rename': { request: { id: string; name: string }; response: Conversation }
  'conversation:set-llm-preset': {
    request: { id: string; llmPresetId: string | null }
    response: Conversation
  }
  'conversation:set-assistant': {
    request: { id: string; assistantId: string | null }
    response: Conversation
  }
  'conversation:get': {
    request: { id: string }
    response: { conversation: Conversation; messages: Message[] } | null
  }
  'conversation:send': {
    request: {
      conversationId: string
      message: string
      kbIds: string[]
      rerankEnabled: boolean
      topK: number
      llmPresetId?: string
      assistantId?: string
      images?: MessageImage[]
    }
    response: { userMessage: Message; assistantMessageId: string; citations: MessageCitation[] }
  }
  'conversation:messages': { request: { conversationId: string }; response: Message[] }

  // Message-level actions
  'message:delete': { request: { messageId: string }; response: { deletedIds: string[] } }
  'message:edit': {
    request: { messageId: string; content: string; images?: MessageImage[] }
    response: { userMessage: Message; assistantMessageId: string; citations: MessageCitation[] }
  }
  'message:regenerate': {
    request: { assistantMessageId: string }
    response: { assistantMessageId: string; citations: MessageCitation[] }
  }
  'message:update': {
    request: { messageId: string; content: string }
    response: { message: Message }
  }

  // Progress events (main → renderer)
  'progress:indexing': {
    request: undefined
    response: { kbId: string; current: number; total: number; status: string }
  }
  'progress:embedding': {
    request: undefined
    response: { kbId: string; current: number; total: number; status: string }
  }
  'progress:doc-embedding': {
    request: undefined
    response: { docId: string; current: number; total: number; status: string }
  }
  'progress:backfill': {
    request: undefined
    response: { current: number; total: number; status: string }
  }
  'chat:error': { request: undefined; response: { error: string; assistantMessageId?: string } }
  'chat:stream-delta': {
    request: undefined
    response: { assistantMessageId: string; delta: string }
  }
  'chat:stream-reasoning': {
    request: undefined
    response: { assistantMessageId: string; delta: string }
  }
  'chat:stream-done': {
    request: undefined
    response: {
      assistantMessageId: string
      content: string
      reasoning: string
      createdAt: string
      citations: MessageCitation[]
    }
  }
  'chat:abort': {
    request: { assistantMessageId: string }
    response: { aborted: boolean }
  }
}

export interface KnowledgeBase {
  id: string
  name: string
  description: string
  category: 'general' | 'technical' | 'research' | 'legal' | 'medical' | 'custom'
  embeddingModel: string
  embeddingApiUrl: string
  embeddingApiKey: string
  chunkSize: number
  chunkOverlap: number
  createdAt: string
  updatedAt: string
  documentCount: number
}

export type EmbeddingStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface Document {
  id: string
  kbId: string
  title: string
  source: string
  sourceType: 'docx' | 'pdf' | 'txt' | 'md' | 'url'
  content: string
  chunks: Chunk[]
  metadata: Record<string, string>
  createdAt: string
  embeddingStatus: EmbeddingStatus
}

export interface Chunk {
  id: string
  docId: string
  content: string
  index: number
  metadata: Record<string, string>
  embeddingStatus?: EmbeddingStatus
  embeddingError?: string
}

export interface SearchResult {
  chunkId: string
  docId: string
  docTitle: string
  content: string
  score: number
  source: 'bm25' | 'vector' | 'graph' | 'hybrid'
  highlights: string[]
}

export interface GraphEntity {
  id: string
  name: string
  type: string
  description: string
  communityId: number | null
}

export interface GraphRelation {
  id: string
  source: string
  target: string
  description: string
  weight: number
}

export interface CommunityReport {
  communityId: number
  title: string
  summary: string
  entities: string[]
  relations: string[]
}

export interface Conversation {
  id: string
  name: string
  kbIds: string[]
  createdAt: string
  updatedAt: string
  messageCount: number
  llmPresetId?: string
}

export interface MessageCitation {
  index: number
  chunkId: string
  docId: string
  docTitle: string
  content: string
  score: number
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  citations?: MessageCitation[]
}

export interface EmbeddingPreset {
  id: string
  name: string
  apiUrl: string
  apiKey: string
  model: string
}

export interface RerankPreset {
  id: string
  name: string
  apiUrl: string
  apiKey: string
  model: string
}

export interface LlmPreset {
  id: string
  name: string
  apiUrl: string
  apiKey: string
  model: string
}

export interface AppSettings {
  embeddingApiUrl: string
  embeddingApiKey: string
  embeddingModel: string
  llmApiUrl: string
  llmApiKey: string
  llmModel: string
  rerankApiUrl: string
  rerankApiKey: string
  rerankModel: string
  rerankEnabled: boolean
  proxyEnabled: boolean
  proxyUrl: string
  topK: number
  dataDir: string
  embeddingPresets: EmbeddingPreset[]
  rerankPresets: RerankPreset[]
  llmPresets: LlmPreset[]
  mistralApiKey: string
  mistralApiUrl: string
  mistralOcrModel: string
  userAvatar: string
}

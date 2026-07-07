export interface KnowledgeBase {
  id: string
  name: string
  description: string
  category: 'general' | 'technical' | 'research' | 'legal' | 'medical' | 'custom'
  embeddingModel: string
  embeddingApiUrl: string
  embeddingApiKey: string
  rerankModelRef?: ActiveModelRef | null
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

export type CustomParamType = 'string' | 'number' | 'boolean' | 'json'

export interface CustomParamEntry {
  name: string
  type: CustomParamType
  value: string | number | boolean | unknown
}

export interface AssistantModelParams {
  temperatureEnabled: boolean
  temperature?: number
  topPEnabled: boolean
  topP?: number
  maxTokensEnabled: boolean
  maxTokens?: number
  customParameters: CustomParamEntry[]
}

export interface Assistant {
  id: string
  name: string
  description: string
  prompt: string
  providerId?: string
  modelId?: string
  modelParams: AssistantModelParams
  knowledgeBaseIds: string[]
  createdAt: string
  updatedAt: string
}

export const DEFAULT_ASSISTANT_PROMPT = '你是一个有帮助的助手。请用 Markdown 格式回答用户问题。'

export const DEFAULT_ASSISTANT_MODEL_PARAMS: AssistantModelParams = {
  temperatureEnabled: true,
  temperature: 0.7,
  topPEnabled: false,
  topP: 1,
  maxTokensEnabled: false,
  maxTokens: 2048,
  customParameters: []
}

export interface Conversation {
  id: string
  name: string
  kbIds: string[]
  createdAt: string
  updatedAt: string
  messageCount: number
  llmPresetId?: string
  assistantId?: string
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
  reasoning?: string
}

export type ProviderKind = 'deepseek' | 'nvidia' | 'mistral' | 'gemini' | 'custom'

export interface ProviderModelCapabilities {
  chat: boolean
  embedding: boolean
  rerank: boolean
}

export interface ProviderModel {
  id: string
  name?: string
  capabilities: ProviderModelCapabilities
}

export interface Provider {
  id: string
  name: string
  kind: ProviderKind
  isBuiltIn: boolean
  apiKey: string
  apiHost: string
  models: ProviderModel[]
}

export interface ActiveModelRef {
  providerId: string
  modelId: string
}

/** @deprecated kept only so settings-service can migrate older installs. */
export interface EmbeddingPreset {
  id: string
  name: string
  apiUrl: string
  apiKey: string
  model: string
}

/** @deprecated kept only so settings-service can migrate older installs. */
export interface RerankPreset {
  id: string
  name: string
  apiUrl: string
  apiKey: string
  model: string
}

/** @deprecated kept only so settings-service can migrate older installs. */
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

  providers: Provider[]
  activeChatModel: ActiveModelRef | null
  activeEmbeddingModel: ActiveModelRef | null
  activeRerankModel: ActiveModelRef | null

  rerankEnabled: boolean
  proxyEnabled: boolean
  proxyUrl: string
  topK: number
  dataDir: string
  mistralApiKey: string
  mistralApiUrl: string
  mistralOcrModel: string
  userAvatar: string

  /** @deprecated migrated into `providers` on load; never read by new code. */
  embeddingPresets?: EmbeddingPreset[]
  /** @deprecated migrated into `providers` on load; never read by new code. */
  rerankPresets?: RerankPreset[]
  /** @deprecated migrated into `providers` on load; never read by new code. */
  llmPresets?: LlmPreset[]
}

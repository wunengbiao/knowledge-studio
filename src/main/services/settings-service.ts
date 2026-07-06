import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type {
  ActiveModelRef,
  AppSettings,
  Provider,
  ProviderKind,
  ProviderModel
} from '@shared/types'
import { ProxyService } from './proxy-service'

const BUILTIN_PROVIDERS: Provider[] = [
  {
    id: 'builtin:deepseek',
    name: 'DeepSeek',
    kind: 'deepseek',
    isBuiltIn: true,
    apiKey: '',
    apiHost: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', capabilities: { chat: true, embedding: false, rerank: false } },
      { id: 'deepseek-reasoner', capabilities: { chat: true, embedding: false, rerank: false } }
    ]
  },
  {
    id: 'builtin:nvidia',
    name: 'NVIDIA',
    kind: 'nvidia',
    isBuiltIn: true,
    apiKey: '',
    apiHost: 'https://integrate.api.nvidia.com/v1',
    models: [
      {
        id: 'meta/llama-3.1-70b-instruct',
        capabilities: { chat: true, embedding: false, rerank: false }
      },
      {
        id: 'nvidia/nv-embedqa-e5-v5',
        capabilities: { chat: false, embedding: true, rerank: false }
      },
      {
        id: 'nvidia/nv-rerankqa-mistral-4b-v3',
        capabilities: { chat: false, embedding: false, rerank: true }
      }
    ]
  },
  {
    id: 'builtin:mistral',
    name: 'Mistral',
    kind: 'mistral',
    isBuiltIn: true,
    apiKey: '',
    apiHost: 'https://api.mistral.ai/v1',
    models: [
      { id: 'mistral-small-latest', capabilities: { chat: true, embedding: false, rerank: false } },
      { id: 'mistral-large-latest', capabilities: { chat: true, embedding: false, rerank: false } },
      { id: 'mistral-embed', capabilities: { chat: false, embedding: true, rerank: false } }
    ]
  },
  {
    id: 'builtin:gemini',
    name: 'Gemini',
    kind: 'gemini',
    isBuiltIn: true,
    apiKey: '',
    apiHost: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'gemini-2.0-flash', capabilities: { chat: true, embedding: false, rerank: false } },
      { id: 'gemini-2.5-pro', capabilities: { chat: true, embedding: false, rerank: false } },
      {
        id: 'gemini-embedding-1',
        capabilities: { chat: false, embedding: true, rerank: false }
      }
    ]
  }
]

function makeCustomProvider(): Provider {
  return {
    id: randomUUID(),
    name: '自定义',
    kind: 'custom',
    isBuiltIn: false,
    apiKey: '',
    apiHost: '',
    models: []
  }
}

const DEFAULT_PROVIDERS: Provider[] = [...BUILTIN_PROVIDERS, makeCustomProvider()]

const DEFAULT_SETTINGS: AppSettings = {
  embeddingApiUrl: '',
  embeddingApiKey: '',
  embeddingModel: '',
  llmApiUrl: '',
  llmApiKey: '',
  llmModel: '',
  rerankApiUrl: '',
  rerankApiKey: '',
  rerankModel: '',
  providers: DEFAULT_PROVIDERS,
  activeChatModel: { providerId: 'builtin:deepseek', modelId: 'deepseek-chat' },
  activeEmbeddingModel: { providerId: 'builtin:nvidia', modelId: 'nvidia/nv-embedqa-e5-v5' },
  activeRerankModel: {
    providerId: 'builtin:nvidia',
    modelId: 'nvidia/nv-rerankqa-mistral-4b-v3'
  },
  rerankEnabled: false,
  proxyEnabled: false,
  proxyUrl: '',
  topK: 10,
  dataDir: '',
  mistralApiKey: '',
  mistralApiUrl: 'https://api.mistral.ai/v1/ocr',
  mistralOcrModel: 'mistral-ocr-latest',
  userAvatar: ''
}

export function resolveCapabilityUrl(
  provider: Provider,
  capability: 'chat' | 'embedding' | 'rerank'
): string {
  const host = provider.apiHost.replace(/\/+$/, '')
  if (!host) return ''
  if (capability === 'chat') return `${host}/chat/completions`
  if (capability === 'embedding') return `${host}/embeddings`
  return provider.kind === 'nvidia' ? `${host}/ranking` : `${host}/rerank`
}

function lookupActiveModel(
  s: AppSettings,
  ref: ActiveModelRef | null,
  capability: 'chat' | 'embedding' | 'rerank'
): { provider: Provider; model: ProviderModel } | null {
  if (!ref) return null
  const provider = s.providers.find((p) => p.id === ref.providerId)
  if (!provider) return null
  const model = provider.models.find(
    (m) => m.id === ref.modelId && m.capabilities[capability]
  )
  if (!model) return null
  return { provider, model }
}

function resolveActiveFlatFields(s: AppSettings): AppSettings {
  const chat = lookupActiveModel(s, s.activeChatModel, 'chat')
  const emb = lookupActiveModel(s, s.activeEmbeddingModel, 'embedding')
  const rer = lookupActiveModel(s, s.activeRerankModel, 'rerank')
  return {
    ...s,
    llmApiUrl: chat ? resolveCapabilityUrl(chat.provider, 'chat') : '',
    llmApiKey: chat?.provider.apiKey ?? '',
    llmModel: chat?.model.id ?? '',
    embeddingApiUrl: emb ? resolveCapabilityUrl(emb.provider, 'embedding') : '',
    embeddingApiKey: emb?.provider.apiKey ?? '',
    embeddingModel: emb?.model.id ?? '',
    rerankApiUrl: rer ? resolveCapabilityUrl(rer.provider, 'rerank') : '',
    rerankApiKey: rer?.provider.apiKey ?? '',
    rerankModel: rer?.model.id ?? ''
  }
}

function reshapeOldProvider(p: Provider & Record<string, unknown>): Provider {
  if (Array.isArray(p.models) && typeof p.apiHost === 'string') {
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      isBuiltIn: p.isBuiltIn,
      apiKey: p.apiKey ?? '',
      apiHost: p.apiHost ?? '',
      models: p.models
    }
  }
  const llmApiUrl = String(p.llmApiUrl ?? '')
  const embApiUrl = String(p.embeddingApiUrl ?? '')
  const rerApiUrl = String(p.rerankApiUrl ?? '')
  const apiHost = (llmApiUrl || embApiUrl || rerApiUrl).replace(
    /\/(chat\/completions|embeddings|rerank|ranking|models\/[^/]+:embedContent)$/,
    ''
  )
  const models: ProviderModel[] = []
  const llmModel = String(p.llmModel ?? '')
  const embModel = String(p.embeddingModel ?? '')
  const rerModel = String(p.rerankModel ?? '')
  if (llmModel) {
    models.push({ id: llmModel, capabilities: { chat: true, embedding: false, rerank: false } })
  }
  if (embModel) {
    const existing = models.find((m) => m.id === embModel)
    if (existing) {
      existing.capabilities.embedding = true
    } else {
      models.push({
        id: embModel,
        capabilities: { chat: false, embedding: true, rerank: false }
      })
    }
  }
  if (rerModel) {
    const existing = models.find((m) => m.id === rerModel)
    if (existing) {
      existing.capabilities.rerank = true
    } else {
      models.push({
        id: rerModel,
        capabilities: { chat: false, embedding: false, rerank: true }
      })
    }
  }
  return {
    id: p.id,
    name: p.name,
    kind: p.kind as ProviderKind,
    isBuiltIn: !!p.isBuiltIn,
    apiKey: String(p.apiKey ?? ''),
    apiHost,
    models
  }
}

function migrateProvidersShape(s: AppSettings): AppSettings {
  if (!s.providers || s.providers.length === 0) {
    const providers = [...BUILTIN_PROVIDERS.map((p) => ({ ...p })), makeCustomProvider()]
    return {
      ...s,
      providers,
      activeChatModel: s.activeChatModel ?? DEFAULT_SETTINGS.activeChatModel,
      activeEmbeddingModel: s.activeEmbeddingModel ?? DEFAULT_SETTINGS.activeEmbeddingModel,
      activeRerankModel: s.activeRerankModel ?? DEFAULT_SETTINGS.activeRerankModel,
      embeddingPresets: undefined,
      rerankPresets: undefined,
      llmPresets: undefined
    }
  }
  const reshaped = s.providers.map((p) =>
    reshapeOldProvider(p as Provider & Record<string, unknown>)
  )
  const oldShape = s as AppSettings & {
    activeLlmProviderId?: string
    activeEmbeddingProviderId?: string
    activeRerankProviderId?: string
  }
  const inferRef = (
    existing: ActiveModelRef | null | undefined,
    legacyProviderId: string | undefined,
    capability: 'chat' | 'embedding' | 'rerank'
  ): ActiveModelRef | null => {
    if (existing && existing.providerId && existing.modelId) return existing
    const pid = legacyProviderId
    if (!pid) return null
    const provider = reshaped.find((p) => p.id === pid)
    if (!provider) return null
    const model = provider.models.find((m) => m.capabilities[capability])
    if (!model) return null
    return { providerId: provider.id, modelId: model.id }
  }
  return {
    ...s,
    providers: reshaped,
    activeChatModel:
      inferRef(s.activeChatModel, oldShape.activeLlmProviderId, 'chat') ??
      DEFAULT_SETTINGS.activeChatModel,
    activeEmbeddingModel:
      inferRef(s.activeEmbeddingModel, oldShape.activeEmbeddingProviderId, 'embedding') ??
      DEFAULT_SETTINGS.activeEmbeddingModel,
    activeRerankModel:
      inferRef(s.activeRerankModel, oldShape.activeRerankProviderId, 'rerank') ??
      DEFAULT_SETTINGS.activeRerankModel,
    embeddingPresets: undefined,
    rerankPresets: undefined,
    llmPresets: undefined
  }
}

export class SettingsService {
  private db: Database.Database
  private proxyService: ProxyService

  constructor() {
    const dataDir = join(app.getPath('userData'), 'rag-data')
    this.db = new Database(join(dataDir, 'app.db'))
    this.proxyService = new ProxyService()
    this.init()
    this.applyProxyFromSettings()
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        data TEXT NOT NULL
      )
    `)
    const existing = this.db.prepare('SELECT * FROM settings WHERE id = 1').get()
    if (!existing) {
      this.db
        .prepare('INSERT INTO settings (id, data) VALUES (1, ?)')
        .run(JSON.stringify(resolveActiveFlatFields(DEFAULT_SETTINGS)))
    }
  }

  get(): AppSettings {
    const row = this.db.prepare('SELECT data FROM settings WHERE id = 1').get() as
      | { data: string }
      | undefined
    if (!row) return DEFAULT_SETTINGS
    const stored = { ...DEFAULT_SETTINGS, ...JSON.parse(row.data) } as AppSettings
    const migrated = migrateProvidersShape(stored)
    return resolveActiveFlatFields(migrated)
  }

  update(updates: Partial<AppSettings>): AppSettings {
    const current = this.get()
    const merged = resolveActiveFlatFields({ ...current, ...updates })
    this.db.prepare('UPDATE settings SET data = ? WHERE id = 1').run(JSON.stringify(merged))
    this.applyProxyFromSettings()
    return merged
  }

  private applyProxyFromSettings(): void {
    const settings = this.get()
    if (settings.proxyEnabled && settings.proxyUrl) {
      this.proxyService.configure(settings.proxyUrl)
    } else {
      this.proxyService.configure(null)
    }
  }
}

import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import type { AppSettings } from '@shared/types'
import { ProxyService } from './proxy-service'

const DEFAULT_SETTINGS: AppSettings = {
  embeddingApiUrl: 'https://api.openai.com/v1/embeddings',
  embeddingApiKey: '',
  embeddingModel: 'text-embedding-3-small',
  llmApiUrl: 'https://api.openai.com/v1/chat/completions',
  llmApiKey: '',
  llmModel: 'gpt-4o-mini',
  rerankApiUrl: '',
  rerankApiKey: '',
  rerankModel: '',
  rerankEnabled: false,
  proxyEnabled: false,
  proxyUrl: '',
  topK: 10,
  dataDir: '',
  embeddingPresets: [],
  rerankPresets: [],
  llmPresets: [],
  mistralApiKey: '',
  mistralApiUrl: 'https://api.mistral.ai/v1/ocr',
  mistralOcrModel: 'mistral-ocr-latest',
  userAvatar: ''
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
        .run(JSON.stringify(DEFAULT_SETTINGS))
    }
  }

  get(): AppSettings {
    const row = this.db.prepare('SELECT data FROM settings WHERE id = 1').get() as any
    if (!row) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.data) }
  }

  update(updates: Partial<AppSettings>): AppSettings {
    const current = this.get()
    const merged = { ...current, ...updates }
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

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Assistant, AssistantModelParams, CustomParamEntry } from '@shared/types'
import { DEFAULT_ASSISTANT_MODEL_PARAMS, DEFAULT_ASSISTANT_PROMPT } from '@shared/types'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { v4 as uuid } from 'uuid'

interface AssistantRow {
  id: string
  name: string
  description: string
  prompt: string
  provider_id: string | null
  model_id: string | null
  temperature_enabled: number
  temperature: number | null
  top_p_enabled: number
  top_p: number | null
  max_tokens_enabled: number
  max_tokens: number | null
  kb_ids: string
  custom_params: string
  created_at: string
  updated_at: string
}

interface TableInfoRow {
  name: string
}

export type CreateAssistantParams = {
  readonly name?: string
  readonly description?: string
  readonly prompt?: string
  readonly providerId?: string | null
  readonly modelId?: string | null
  readonly modelParams?: Partial<AssistantModelParams>
  readonly knowledgeBaseIds?: readonly string[]
}

export type UpdateAssistantParams = Partial<{
  readonly name: string
  readonly description: string
  readonly prompt: string
  readonly providerId: string | null
  readonly modelId: string | null
  readonly modelParams: Partial<AssistantModelParams>
  readonly knowledgeBaseIds: readonly string[]
}>

export class AssistantService {
  private db: Database.Database

  constructor() {
    const dataDir = join(app.getPath('userData'), 'rag-data')
    mkdirSync(dataDir, { recursive: true })
    this.db = new Database(join(dataDir, 'app.db'))
    this.db.pragma('journal_mode = WAL')
    this.init()
    this.migrate()
    this.seedDefaultAssistant()
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS assistants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        prompt TEXT NOT NULL DEFAULT '',
        provider_id TEXT,
        model_id TEXT,
        temperature_enabled INTEGER NOT NULL DEFAULT 1,
        temperature REAL,
        top_p_enabled INTEGER NOT NULL DEFAULT 0,
        top_p REAL,
        max_tokens_enabled INTEGER NOT NULL DEFAULT 0,
        max_tokens INTEGER,
        kb_ids TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  }

  private migrate(): void {
    const columns = this.db.prepare("PRAGMA table_info('assistants')").all() as TableInfoRow[]
    if (!columns.some((column) => column.name === 'custom_params')) {
      this.db.exec("ALTER TABLE assistants ADD COLUMN custom_params TEXT NOT NULL DEFAULT '[]'")
    }
  }

  list(): Assistant[] {
    const rows = this.db
      .prepare('SELECT * FROM assistants ORDER BY updated_at DESC')
      .all() as AssistantRow[]
    return rows.map((row) => this.rowToAssistant(row))
  }

  get(id: string): Assistant | null {
    const row = this.db.prepare('SELECT * FROM assistants WHERE id = ?').get(id) as
      | AssistantRow
      | undefined
    return row ? this.rowToAssistant(row) : null
  }

  getDefault(): Assistant {
    const row = this.db.prepare('SELECT * FROM assistants ORDER BY created_at ASC LIMIT 1').get() as
      | AssistantRow
      | undefined
    if (row) return this.rowToAssistant(row)
    return this.create({ name: '默认助手', prompt: DEFAULT_ASSISTANT_PROMPT })
  }

  resolveAssistant(id: string | null | undefined): Assistant {
    if (id) {
      const assistant = this.get(id)
      if (assistant) return assistant
    }
    return this.getDefault()
  }

  create(params: CreateAssistantParams): Assistant {
    const id = uuid()
    const now = new Date().toISOString()
    const modelParams = this.normalizeModelParams(params.modelParams)
    this.db
      .prepare(
        `INSERT INTO assistants (
          id, name, description, prompt, provider_id, model_id,
          temperature_enabled, temperature, top_p_enabled, top_p,
          max_tokens_enabled, max_tokens, kb_ids, custom_params, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        params.name?.trim() || '新助手',
        params.description ?? '',
        params.prompt ?? DEFAULT_ASSISTANT_PROMPT,
        params.providerId ?? null,
        params.modelId ?? null,
        modelParams.temperatureEnabled ? 1 : 0,
        modelParams.temperature ?? null,
        modelParams.topPEnabled ? 1 : 0,
        modelParams.topP ?? null,
        modelParams.maxTokensEnabled ? 1 : 0,
        modelParams.maxTokens ?? null,
        JSON.stringify(params.knowledgeBaseIds ?? []),
        JSON.stringify(modelParams.customParameters),
        now,
        now
      )
    return this.get(id) ?? this.getDefault()
  }

  update(id: string, updates: UpdateAssistantParams): Assistant {
    const current = this.get(id)
    if (!current) throw new Error('助手不存在')

    const nextModelParams = this.normalizeModelParams({
      ...current.modelParams,
      ...updates.modelParams
    })
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE assistants SET
          name = ?, description = ?, prompt = ?, provider_id = ?, model_id = ?,
          temperature_enabled = ?, temperature = ?, top_p_enabled = ?, top_p = ?,
          max_tokens_enabled = ?, max_tokens = ?, kb_ids = ?, custom_params = ?, updated_at = ?
        WHERE id = ?`
      )
      .run(
        updates.name?.trim() || current.name,
        updates.description ?? current.description,
        updates.prompt ?? current.prompt,
        updates.providerId === undefined ? (current.providerId ?? null) : updates.providerId,
        updates.modelId === undefined ? (current.modelId ?? null) : updates.modelId,
        nextModelParams.temperatureEnabled ? 1 : 0,
        nextModelParams.temperature ?? null,
        nextModelParams.topPEnabled ? 1 : 0,
        nextModelParams.topP ?? null,
        nextModelParams.maxTokensEnabled ? 1 : 0,
        nextModelParams.maxTokens ?? null,
        JSON.stringify(updates.knowledgeBaseIds ?? current.knowledgeBaseIds),
        JSON.stringify(nextModelParams.customParameters),
        now,
        id
      )
    return this.get(id) ?? current
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM assistants WHERE id = ?').run(id)
    if (result.changes > 0 && this.hasConversationAssistantColumn()) {
      this.db.prepare('UPDATE conversations SET assistant_id = NULL WHERE assistant_id = ?').run(id)
    }
    if (this.countAssistants() === 0) {
      this.seedDefaultAssistant()
    }
    return result.changes > 0
  }

  private seedDefaultAssistant(): void {
    if (this.countAssistants() > 0) return
    this.create({ name: '默认助手', prompt: DEFAULT_ASSISTANT_PROMPT })
  }

  private countAssistants(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM assistants').get() as
      | { count: number }
      | undefined
    return row?.count ?? 0
  }

  private hasConversationAssistantColumn(): boolean {
    const table = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'conversations'")
      .get() as { name: string } | undefined
    if (!table) return false
    const columns = this.db.prepare("PRAGMA table_info('conversations')").all() as TableInfoRow[]
    return columns.some((column) => column.name === 'assistant_id')
  }

  private normalizeModelParams(
    params: Partial<AssistantModelParams> | undefined
  ): AssistantModelParams {
    return {
      temperatureEnabled:
        params?.temperatureEnabled ?? DEFAULT_ASSISTANT_MODEL_PARAMS.temperatureEnabled,
      temperature: params?.temperature ?? DEFAULT_ASSISTANT_MODEL_PARAMS.temperature,
      topPEnabled: params?.topPEnabled ?? DEFAULT_ASSISTANT_MODEL_PARAMS.topPEnabled,
      topP: params?.topP ?? DEFAULT_ASSISTANT_MODEL_PARAMS.topP,
      maxTokensEnabled: params?.maxTokensEnabled ?? DEFAULT_ASSISTANT_MODEL_PARAMS.maxTokensEnabled,
      maxTokens: params?.maxTokens ?? DEFAULT_ASSISTANT_MODEL_PARAMS.maxTokens,
      customParameters: this.normalizeCustomParameters(params?.customParameters)
    }
  }

  private normalizeCustomParameters(
    entries: readonly CustomParamEntry[] | undefined
  ): CustomParamEntry[] {
    if (!Array.isArray(entries)) return []
    return entries
      .filter((entry) => entry && typeof entry.name === 'string' && entry.name.trim().length > 0)
      .map((entry) => ({
        name: String(entry.name),
        type: entry.type,
        value: entry.value
      }))
  }

  private rowToAssistant(row: AssistantRow): Assistant {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      prompt: row.prompt,
      providerId: row.provider_id ?? undefined,
      modelId: row.model_id ?? undefined,
      modelParams: {
        temperatureEnabled: row.temperature_enabled === 1,
        temperature: row.temperature ?? undefined,
        topPEnabled: row.top_p_enabled === 1,
        topP: row.top_p ?? undefined,
        maxTokensEnabled: row.max_tokens_enabled === 1,
        maxTokens: row.max_tokens ?? undefined,
        customParameters: this.parseCustomParameters(row.custom_params)
      },
      knowledgeBaseIds: this.parseKbIds(row.kb_ids),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private parseCustomParameters(value: string | null | undefined): CustomParamEntry[] {
    if (!value) return []
    try {
      const parsed: unknown = JSON.parse(value)
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter((entry): entry is Record<string, unknown> => {
          return (
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as Record<string, unknown>).name === 'string'
          )
        })
        .map((entry) => ({
          name: String(entry.name),
          type: entry.type as CustomParamEntry['type'],
          value: entry.value as CustomParamEntry['value']
        }))
        .filter((entry) => entry.name.trim().length > 0)
    } catch {
      return []
    }
  }

  private parseKbIds(value: string): string[] {
    try {
      const parsed: unknown = JSON.parse(value)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((item): item is string => typeof item === 'string')
    } catch {
      return []
    }
  }
}

import { join } from 'path'
import type { ActiveModelRef, KnowledgeBase } from '@shared/types'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { v4 as uuid } from 'uuid'

export class KnowledgeBaseService {
  private db: Database.Database

  constructor() {
    const dataDir = join(app.getPath('userData'), 'rag-data')
    const { mkdirSync } = require('fs')
    mkdirSync(dataDir, { recursive: true })
    this.db = new Database(join(dataDir, 'app.db'))
    this.db.pragma('journal_mode = WAL')
    this.init()
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_bases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        category TEXT DEFAULT 'general',
        embedding_model TEXT DEFAULT '',
        embedding_api_url TEXT DEFAULT '',
        embedding_api_key TEXT DEFAULT '',
        chunk_size INTEGER DEFAULT 500,
        chunk_overlap INTEGER DEFAULT 50,
        rerank_model_ref TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        document_count INTEGER DEFAULT 0
      )
    `)

    // Migration: add chunk columns to pre-existing knowledge_bases tables
    const columns = this.db.prepare('PRAGMA table_info(knowledge_bases)').all() as {
      name: string
    }[]
    const colNames = columns.map((c) => c.name)
    if (!colNames.includes('chunk_size')) {
      this.db.exec('ALTER TABLE knowledge_bases ADD COLUMN chunk_size INTEGER DEFAULT 500')
    }
    if (!colNames.includes('chunk_overlap')) {
      this.db.exec('ALTER TABLE knowledge_bases ADD COLUMN chunk_overlap INTEGER DEFAULT 50')
    }
    if (!colNames.includes('rerank_model_ref')) {
      this.db.exec('ALTER TABLE knowledge_bases ADD COLUMN rerank_model_ref TEXT')
    }
    if (!colNames.includes('icon')) {
      this.db.exec('ALTER TABLE knowledge_bases ADD COLUMN icon TEXT')
    }
  }

  list(): KnowledgeBase[] {
    const rows = this.db
      .prepare('SELECT * FROM knowledge_bases ORDER BY updated_at DESC')
      .all() as any[]
    return rows.map(this.rowToKB)
  }

  create(params: {
    name: string
    description: string
    category: KnowledgeBase['category']
    icon?: string | null
    embeddingApiUrl: string
    embeddingApiKey: string
    embeddingModel: string
    chunkSize?: number
    chunkOverlap?: number
    rerankModelRef?: ActiveModelRef | null
  }): KnowledgeBase {
    const now = new Date().toISOString()
    const id = uuid()
    const chunkSize = params.chunkSize ?? 500
    const chunkOverlap = params.chunkOverlap ?? 50
    const rerankRef = params.rerankModelRef ? JSON.stringify(params.rerankModelRef) : null
    const icon = params.icon ?? null
    this.db
      .prepare(
        `INSERT INTO knowledge_bases (id, name, description, category, icon, embedding_model, embedding_api_url, embedding_api_key, chunk_size, chunk_overlap, rerank_model_ref, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        params.name,
        params.description,
        params.category,
        icon,
        params.embeddingModel,
        params.embeddingApiUrl,
        params.embeddingApiKey,
        chunkSize,
        chunkOverlap,
        rerankRef,
        now,
        now
      )
    return this.get(id)!
  }

  update(id: string, updates: Partial<KnowledgeBase>): KnowledgeBase {
    const lockedFields: (keyof KnowledgeBase)[] = [
      'embeddingModel',
      'embeddingApiUrl',
      'embeddingApiKey'
    ]
    for (const locked of lockedFields) {
      if (locked in updates) {
        throw new Error('Embedding 配置在创建后不可修改')
      }
    }

    const fields: string[] = []
    const values: any[] = []
    const { rerankModelRef, ...rest } = updates
    if (rerankModelRef !== undefined) {
      fields.push('rerank_model_ref = ?')
      values.push(rerankModelRef ? JSON.stringify(rerankModelRef) : null)
    }
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) {
        const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
        fields.push(`${col} = ?`)
        values.push(value)
      }
    }
    if (fields.length > 0) {
      fields.push('updated_at = ?')
      values.push(new Date().toISOString())
      values.push(id)
      this.db.prepare(`UPDATE knowledge_bases SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }
    return this.get(id)!
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM knowledge_bases WHERE id = ?').run(id)
    return result.changes > 0
  }

  get(id: string): KnowledgeBase | null {
    const row = this.db.prepare('SELECT * FROM knowledge_bases WHERE id = ?').get(id) as any
    return row ? this.rowToKB(row) : null
  }

  private rowToKB(row: any): KnowledgeBase {
    let rerankModelRef: ActiveModelRef | null = null
    if (row.rerank_model_ref) {
      try {
        const parsed = JSON.parse(row.rerank_model_ref)
        if (parsed && typeof parsed.providerId === 'string' && typeof parsed.modelId === 'string') {
          rerankModelRef = parsed
        }
      } catch {
        rerankModelRef = null
      }
    }
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      icon: row.icon ?? null,
      embeddingModel: row.embedding_model,
      embeddingApiUrl: row.embedding_api_url,
      embeddingApiKey: row.embedding_api_key,
      rerankModelRef,
      chunkSize: row.chunk_size ?? 500,
      chunkOverlap: row.chunk_overlap ?? 50,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      documentCount: row.document_count
    }
  }
}

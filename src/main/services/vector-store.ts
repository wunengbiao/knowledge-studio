import * as lancedb from '@lancedb/lancedb'
import { app } from 'electron'
import { join } from 'path'
import { tokenize } from './tokenizer'

/** jieba tokens joined by spaces for lancedb's whitespace tokenizer (FTS). */
export function segmentText(text: string): string {
  return tokenize(text).join(' ')
}

interface VectorRow {
  id: string
  chunk_id: string
  doc_id: string
  kb_id: string
  vector: number[]
  content: string
  text_segmented: string
  [key: string]: unknown
}

export interface VectorHit {
  chunkId: string
  docId: string
  content: string
  score: number
}

export class VectorStore {
  private db: lancedb.Connection
  private static instance: VectorStore | null = null

  private constructor(db: lancedb.Connection) {
    this.db = db
  }

  static async getInstance(): Promise<VectorStore> {
    if (VectorStore.instance) return VectorStore.instance
    const uri = join(app.getPath('userData'), 'rag-data', 'vectors')
    const db = await lancedb.connect(uri)
    VectorStore.instance = new VectorStore(db)
    return VectorStore.instance
  }

  private tableName(kbId: string): string {
    return `kb_${kbId.replace(/-/g, '_')}`
  }

  private escapeSqlValue(value: string): string {
    return value.replace(/'/g, "''")
  }

  async addVectors(
    kbId: string,
    items: { chunkId: string; docId: string; vector: number[]; content: string }[]
  ): Promise<void> {
    if (items.length === 0) return
    const name = this.tableName(kbId)
    const rows: VectorRow[] = items.map((item) => ({
      id: crypto.randomUUID(),
      chunk_id: item.chunkId,
      doc_id: item.docId,
      kb_id: kbId,
      vector: item.vector,
      content: item.content,
      text_segmented: segmentText(item.content)
    }))

    const tableNames = await this.db.tableNames()
    if (tableNames.includes(name)) {
      const tbl = await this.db.openTable(name)
      const schema = await tbl.schema()
      const hasTextSegmented = schema.fields.some((f) => f.name === 'text_segmented')
      if (!hasTextSegmented) {
        await this.migrateLegacyTable(kbId, tbl, rows)
      } else {
        await tbl.add(rows)
      }
    } else {
      await this.db.createTable(name, rows, { mode: 'create' })
    }
  }

  private async migrateLegacyTable(
    kbId: string,
    tbl: lancedb.Table,
    newRows: VectorRow[]
  ): Promise<void> {
    const name = this.tableName(kbId)
    const oldRows = (await tbl
      .query()
      .select(['chunk_id', 'doc_id', 'kb_id', 'vector', 'content'])
      .toArray()) as {
      chunk_id: string
      doc_id: string
      kb_id: string
      vector: number[] | Float32Array
      content: string
    }[]

    await this.db.dropTable(name)
    const rebuiltRows: VectorRow[] = [
      ...oldRows.map((r) => ({
        id: crypto.randomUUID(),
        chunk_id: r.chunk_id,
        doc_id: r.doc_id,
        kb_id: r.kb_id,
        vector: Array.from(r.vector),
        content: r.content,
        text_segmented: segmentText(r.content)
      })),
      ...newRows
    ]
    await this.db.createTable(name, rebuiltRows, { mode: 'create' })
  }

  async search(kbId: string, queryVector: number[], topK: number): Promise<VectorHit[]> {
    const name = this.tableName(kbId)
    const tableNames = await this.db.tableNames()
    if (!tableNames.includes(name)) return []

    const tbl = await this.db.openTable(name)
    const rows = await tbl.search(queryVector).limit(topK).toArray()
    return rows.map((row: any) => ({
      chunkId: row.chunk_id,
      docId: row.doc_id,
      content: row.content,
      // _distance is L2 distance (lower = more similar). Convert to 0-1 similarity proxy.
      score: 1 / (1 + row._distance)
    }))
  }

  async deleteByDoc(docId: string, kbId: string): Promise<void> {
    const name = this.tableName(kbId)
    const tableNames = await this.db.tableNames()
    if (!tableNames.includes(name)) return
    const tbl = await this.db.openTable(name)
    await tbl.delete(`doc_id = '${this.escapeSqlValue(docId)}'`)
  }

  async deleteByKb(kbId: string): Promise<void> {
    const name = this.tableName(kbId)
    const tableNames = await this.db.tableNames()
    if (!tableNames.includes(name)) return
    await this.db.dropTable(name)
  }

  async countVectors(kbId: string): Promise<number> {
    const name = this.tableName(kbId)
    const tableNames = await this.db.tableNames()
    if (!tableNames.includes(name)) return 0
    const tbl = await this.db.openTable(name)
    return tbl.countRows()
  }

  async ensureFtsReady(kbId: string): Promise<void> {
    const name = this.tableName(kbId)
    const tableNames = await this.db.tableNames()
    if (!tableNames.includes(name)) return
    const tbl = await this.db.openTable(name)
    const schema = await tbl.schema()
    const hasTextSegmented = schema.fields.some((f) => f.name === 'text_segmented')
    if (!hasTextSegmented) {
      await this.migrateLegacyTable(kbId, tbl, [])
    }
    await this.ensureFtsIndex(kbId)
  }

  async ensureFtsIndex(kbId: string): Promise<void> {
    const name = this.tableName(kbId)
    const tableNames = await this.db.tableNames()
    if (!tableNames.includes(name)) return
    const tbl = await this.db.openTable(name)

    let hasFts = false
    try {
      const indexes = await tbl.listIndices()
      hasFts = indexes.some((idx) =>
        String(idx.indexType || '').toLowerCase().includes('fts')
      )
    } catch {
      // listIndexes unavailable on this version - fall through to createIndex
    }

    if (!hasFts) {
      await tbl.createIndex('text_segmented', {
        config: lancedb.Index.fts({
          baseTokenizer: 'whitespace',
          stem: false,
          removeStopWords: false,
          asciiFolding: false
        }),
        replace: true
      })
    }
  }

  async optimize(kbId: string): Promise<void> {
    const name = this.tableName(kbId)
    const tableNames = await this.db.tableNames()
    if (!tableNames.includes(name)) return
    const tbl = await this.db.openTable(name)
    await tbl.optimize()
  }

  async ftsSearch(kbId: string, query: string, topK: number): Promise<VectorHit[]> {
    const name = this.tableName(kbId)
    const tableNames = await this.db.tableNames()
    if (!tableNames.includes(name)) return []

    const tbl = await this.db.openTable(name)
    const segmentedQuery = segmentText(query)
    if (!segmentedQuery.trim()) return []

    const rows = await tbl.search(segmentedQuery, 'fts').limit(topK).toArray()
    return rows.map((row: { chunk_id: string; doc_id: string; content: string; _score?: number }) => ({
      chunkId: row.chunk_id,
      docId: row.doc_id,
      content: row.content,
      score: row._score ?? 0
    }))
  }
}

import * as lancedb from '@lancedb/lancedb'
import { app } from 'electron'
import { join } from 'path'

interface VectorRow {
  id: string
  chunk_id: string
  doc_id: string
  kb_id: string
  vector: number[]
  content: string
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
      content: item.content
    }))

    const tableNames = await this.db.tableNames()
    if (tableNames.includes(name)) {
      const tbl = await this.db.openTable(name)
      await tbl.add(rows)
    } else {
      await this.db.createTable(name, rows, { mode: 'create' })
    }
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
}

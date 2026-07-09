import { readFileSync } from 'fs'
import { join } from 'path'
import type { Chunk, Document, EmbeddingStatus } from '@shared/types'
import Database from 'better-sqlite3'
import { net, app } from 'electron'
import mammoth from 'mammoth'
import { v4 as uuid } from 'uuid'
import { embeddingService } from './embedding-service'
import { type MistralOcrConfig, pdfOcrService } from './pdf-ocr-service'
import { VectorStore } from './vector-store'

const pdfParse = require('pdf-parse')

export interface DocEmbeddingStatus {
  docId: string
  status: EmbeddingStatus
  done: number
  total: number
  error?: string
}

interface JinaReaderResponse {
  code?: number | string
  status?: number | string
  data?: {
    title?: string
    content?: string
    text?: string
    url?: string
  }
  title?: string
  content?: string
  text?: string
  url?: string
}

export class DocumentService {
  private db: Database.Database

  constructor() {
    const dataDir = join(app.getPath('userData'), 'rag-data')
    this.db = new Database(join(dataDir, 'app.db'))
    this.init()
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        kb_id TEXT NOT NULL,
        title TEXT NOT NULL,
        source TEXT NOT NULL,
        source_type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        doc_id TEXT NOT NULL,
        content TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}',
        embedding_status TEXT DEFAULT 'pending',
        embedding_error TEXT DEFAULT '',
        embedding_model TEXT DEFAULT '',
        FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
      );
    `)

    // Migration: add embedding columns to pre-existing chunks tables
    const columns = this.db.prepare('PRAGMA table_info(chunks)').all() as { name: string }[]
    const colNames = columns.map((c) => c.name)
    if (!colNames.includes('embedding_status')) {
      this.db.exec("ALTER TABLE chunks ADD COLUMN embedding_status TEXT DEFAULT 'pending'")
    }
    if (!colNames.includes('embedding_error')) {
      this.db.exec("ALTER TABLE chunks ADD COLUMN embedding_error TEXT DEFAULT ''")
    }
    if (!colNames.includes('embedding_model')) {
      this.db.exec("ALTER TABLE chunks ADD COLUMN embedding_model TEXT DEFAULT ''")
    }
  }

  list(kbId: string): Document[] {
    const rows = this.db
      .prepare('SELECT * FROM documents WHERE kb_id = ? ORDER BY created_at DESC')
      .all(kbId) as any[]
    if (rows.length === 0) return []

    const docIds = rows.map((r) => r.id)
    const placeholders = docIds.map(() => '?').join(',')
    const chunkRows = this.db
      .prepare(
        `SELECT * FROM chunks WHERE doc_id IN (${placeholders}) ORDER BY doc_id, chunk_index`
      )
      .all(...docIds) as any[]
    const chunksByDoc = new Map<string, any[]>()
    for (const cr of chunkRows) {
      if (!chunksByDoc.has(cr.doc_id)) chunksByDoc.set(cr.doc_id, [])
      chunksByDoc.get(cr.doc_id)!.push(cr)
    }
    return rows.map((r) => this.rowToDoc(r, chunksByDoc.get(r.id) || []))
  }

  async upload(
    kbId: string,
    filePath: string,
    sourceType: 'docx' | 'pdf' | 'txt' | 'md',
    onProgress?: (current: number, total: number, status: string) => void,
    options?: { mistralOcr?: MistralOcrConfig }
  ): Promise<Document> {
    onProgress?.(0, 100, 'Reading file...')

    let text: string
    let title: string

    if (sourceType === 'docx') {
      const buffer = readFileSync(filePath)
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
      title =
        filePath
          .split('/')
          .pop()
          ?.replace(/\.docx$/i, '') || 'Untitled'
    } else if (sourceType === 'txt') {
      text = readFileSync(filePath, 'utf-8')
      title =
        filePath
          .split('/')
          .pop()
          ?.replace(/\.txt$/i, '') || 'Untitled'
    } else if (sourceType === 'md') {
      text = readFileSync(filePath, 'utf-8')
      title =
        filePath
          .split('/')
          .pop()
          ?.replace(/\.(md|markdown)$/i, '') || 'Untitled'
    } else {
      const useOcr = !!options?.mistralOcr?.apiKey
      if (useOcr) {
        text = await pdfOcrService.convertPdfToMarkdown(filePath, options!.mistralOcr!, onProgress)
        title =
          filePath
            .split('/')
            .pop()
            ?.replace(/\.pdf$/i, '') || 'Untitled'
      } else {
        const buffer = readFileSync(filePath)
        const data = await pdfParse(buffer)
        text = data.text
        title =
          data.info?.Title ||
          filePath
            .split('/')
            .pop()
            ?.replace(/\.pdf$/i, '') ||
          'Untitled'
      }
    }

    onProgress?.(50, 100, 'Chunking...')
    const { chunkSize, chunkOverlap } = this.getKbChunkConfig(kbId)
    const chunks = this.chunkText(text, chunkSize, chunkOverlap)

    onProgress?.(80, 100, 'Saving...')

    const now = new Date().toISOString()
    const docId = uuid()

    this.db
      .prepare(
        `INSERT INTO documents (id, kb_id, title, source, source_type, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(docId, kbId, title, filePath, sourceType, text, now)

    const insertChunk = this.db.prepare(
      'INSERT INTO chunks (id, doc_id, content, chunk_index) VALUES (?, ?, ?, ?)'
    )
    for (let i = 0; i < chunks.length; i++) {
      insertChunk.run(uuid(), docId, chunks[i], i)
    }

    this.db
      .prepare(
        'UPDATE knowledge_bases SET document_count = document_count + 1, updated_at = ? WHERE id = ?'
      )
      .run(now, kbId)

    onProgress?.(100, 100, 'Done')

    return this.get(docId)!
  }

  async importUrl(
    kbId: string,
    url: string,
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<Document> {
    onProgress?.(0, 100, '正在通过 Jina Reader 获取网页...')

    let title = ''
    let text = ''

    try {
      const jinaResult = await this.fetchViaJinaReader(url)
      if (jinaResult) {
        title = jinaResult.title
        text = jinaResult.content
      }
    } catch {
      // Jina Reader errored (network/timeout/non-200); fall through to direct fetch
    }

    if (!text || text.length < 20) {
      onProgress?.(30, 100, 'Jina Reader 不可用，尝试直接抓取...')
      try {
        const localResult = await this.fetchViaDirectHttp(url)
        if (localResult) {
          title = localResult.title
          text = localResult.content
        }
      } catch {
        // Both paths failed; throw the unified error below
      }
    }

    if (!text || text.length < 20) {
      throw new Error(
        '无法获取网页内容（Jina Reader 与本地直连均失败）。可能原因：网络问题、网站反爬虫机制、或 JavaScript 动态渲染页面。'
      )
    }

    if (!title) {
      title = this.deriveTitleFromUrl(url)
    }

    onProgress?.(50, 100, '正在分片...')
    const { chunkSize, chunkOverlap } = this.getKbChunkConfig(kbId)
    const chunks = this.chunkText(text, chunkSize, chunkOverlap)

    if (chunks.length === 0) {
      throw new Error('网页内容分片失败：未生成有效分片')
    }

    onProgress?.(80, 100, '正在保存...')

    const now = new Date().toISOString()
    const docId = uuid()

    this.db
      .prepare(
        `INSERT INTO documents (id, kb_id, title, source, source_type, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(docId, kbId, title, url, 'url', text, now)

    const insertChunk = this.db.prepare(
      'INSERT INTO chunks (id, doc_id, content, chunk_index) VALUES (?, ?, ?, ?)'
    )
    for (let i = 0; i < chunks.length; i++) {
      insertChunk.run(uuid(), docId, chunks[i], i)
    }

    this.db
      .prepare(
        'UPDATE knowledge_bases SET document_count = document_count + 1, updated_at = ? WHERE id = ?'
      )
      .run(now, kbId)

    onProgress?.(100, 100, 'Done')

    return this.get(docId)!
  }

  private async fetchViaJinaReader(
    url: string
  ): Promise<{ title: string; content: string } | null> {
    const response = await net.fetch(`https://r.jina.ai/${url}`, {
      signal: AbortSignal.timeout(30000),
      headers: {
        Accept: 'application/json',
        'X-Retain-Images': 'none'
      }
    })

    if (!response.ok) {
      return null
    }

    const payload: JinaReaderResponse = await response.json()
    const data = payload.data || payload
    const content = (data.content || data.text || '').trim()
    const jinaTitle = (data.title || '').trim()

    if (!content || content.length < 20) {
      return null
    }

    return { title: jinaTitle, content }
  }

  private async fetchViaDirectHttp(
    url: string
  ): Promise<{ title: string; content: string } | null> {
    const TurndownService = require('turndown')
    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-'
    })

    const response = await net.fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    })

    if (!response.ok) {
      return null
    }

    const html = await response.text()
    const { title, contentHtml } = this.extractWebContent(html, url)
    const localText = turndown.turndown(contentHtml).trim()

    if (!localText || localText.length < 20) {
      return null
    }

    return { title, content: localText }
  }

  private deriveTitleFromUrl(url: string): string {
    try {
      const parsed = new URL(url)
      const lastSegment = parsed.pathname.split('/').filter(Boolean).pop()
      if (lastSegment) {
        return decodeURIComponent(lastSegment).replace(/\.\w+$/, '')
      }
      return parsed.hostname
    } catch {
      return url.split('/').pop()?.replace(/\.\w+$/, '') || url
    }
  }

  private extractWebContent(
    html: string,
    fallbackUrl: string
  ): {
    title: string
    contentHtml: string
  } {
    let title =
      fallbackUrl
        .split('/')
        .pop()
        ?.replace(/\.\w+$/, '') || fallbackUrl
    const ogTitleMatch = html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
    )
    if (ogTitleMatch?.[1]?.trim()) {
      title = ogTitleMatch[1].trim()
    } else {
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
      if (titleMatch?.[1]?.trim()) {
        title = titleMatch[1].trim()
      }
    }

    // Strip non-content elements (scripts, styles, boilerplate nav/header/footer, etc.)
    const cleaned = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<template[\s\S]*?<\/template>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<form[\s\S]*?<\/form>/gi, '')

    // Prefer semantic main/article content; fall back to body, then full cleaned HTML
    const mainMatch =
      cleaned.match(/<main[^>]*>[\s\S]*?<\/main>/i) ||
      cleaned.match(/<article[^>]*>[\s\S]*?<\/article>/i) ||
      cleaned.match(/<body[^>]*>[\s\S]*?<\/body>/i)
    const contentHtml = mainMatch ? mainMatch[0] : cleaned

    return { title, contentHtml }
  }

  async delete(docId: string): Promise<boolean> {
    const doc = this.get(docId)
    if (!doc) return false

    const vectorStore = await VectorStore.getInstance()
    await vectorStore.deleteByDoc(docId, doc.kbId).catch((e) => {
      console.error('[delete] LanceDB 删除失败:', e)
    })

    this.db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(docId)
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(docId)
    this.db
      .prepare(
        'UPDATE knowledge_bases SET document_count = MAX(0, document_count - 1) WHERE id = ?'
      )
      .run(doc.kbId)
    return true
  }

  get(docId: string): Document | null {
    const row = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(docId) as any
    if (!row) return null
    const chunks = this.db
      .prepare('SELECT * FROM chunks WHERE doc_id = ? ORDER BY chunk_index')
      .all(docId) as any[]
    return this.rowToDoc(row, chunks)
  }

  rename(docId: string, title: string): Document {
    const trimmed = title.trim()
    if (!trimmed) {
      throw new Error('文档名称不能为空')
    }
    this.db.prepare('UPDATE documents SET title = ? WHERE id = ?').run(trimmed, docId)
    return this.get(docId)!
  }

  getChunks(docId: string): Chunk[] {
    return (
      this.db
        .prepare('SELECT * FROM chunks WHERE doc_id = ? ORDER BY chunk_index')
        .all(docId) as any[]
    ).map((r) => ({
      id: r.id,
      docId: r.doc_id,
      content: r.content,
      index: r.chunk_index,
      metadata: JSON.parse(r.metadata || '{}'),
      embeddingStatus: r.embedding_status as EmbeddingStatus | undefined,
      embeddingError: r.embedding_error || undefined
    }))
  }

  getAllChunks(kbId: string): Chunk[] {
    return (
      this.db
        .prepare(
          `SELECT c.* FROM chunks c
       JOIN documents d ON c.doc_id = d.id
       WHERE d.kb_id = ?
       ORDER BY d.created_at, c.chunk_index`
        )
        .all(kbId) as any[]
    ).map((r) => ({
      id: r.id,
      docId: r.doc_id,
      content: r.content,
      index: r.chunk_index,
      metadata: JSON.parse(r.metadata || '{}'),
      embeddingStatus: r.embedding_status as EmbeddingStatus | undefined,
      embeddingError: r.embedding_error || undefined
    }))
  }

  getPendingChunkDocIds(): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT doc_id FROM chunks WHERE embedding_status = ?')
      .all('pending') as { doc_id: string }[]
    return rows.map((r) => r.doc_id)
  }

  getEmbeddingStatus(kbId: string): DocEmbeddingStatus[] {
    const docs = this.db
      .prepare('SELECT id FROM documents WHERE kb_id = ? ORDER BY created_at DESC')
      .all(kbId) as { id: string }[]
    return docs.map((doc) => {
      const row = this.db
        .prepare(
          `SELECT
            COUNT(*) as total,
            SUM(CASE WHEN embedding_status = 'done' THEN 1 ELSE 0 END) as done,
            SUM(CASE WHEN embedding_status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN embedding_status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN embedding_status = 'processing' THEN 1 ELSE 0 END) as processing,
            (SELECT embedding_error FROM chunks WHERE doc_id = ? AND embedding_status = 'failed' LIMIT 1) as error
           FROM chunks WHERE doc_id = ?`
        )
        .get(doc.id, doc.id) as any
      let status: EmbeddingStatus = 'pending'
      if (row.total === 0) status = 'done'
      else if (row.failed > 0) status = 'failed'
      else if (row.processing > 0) status = 'processing'
      else if (row.pending > 0) status = 'pending'
      else status = 'done'
      return {
        docId: doc.id,
        status,
        done: row.done || 0,
        total: row.total || 0,
        error: row.error || undefined
      }
    })
  }

  async processEmbeddings(
    docId: string,
    kbId: string,
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<void> {
    const kbRow = this.db
      .prepare(
        'SELECT embedding_model, embedding_api_url, embedding_api_key FROM knowledge_bases WHERE id = ?'
      )
      .get(kbId) as
      | { embedding_model: string; embedding_api_url: string; embedding_api_key: string }
      | undefined
    if (!kbRow || !kbRow.embedding_api_url || !kbRow.embedding_api_key) {
      throw new Error('该知识库未配置 Embedding API')
    }

    const chunks = this.db
      .prepare(
        "SELECT id, content FROM chunks WHERE doc_id = ? AND embedding_status IN ('pending', 'failed')"
      )
      .all(docId) as { id: string; content: string }[]
    if (chunks.length === 0) return

    this.db
      .prepare(
        "UPDATE chunks SET embedding_status = 'processing' WHERE doc_id = ? AND embedding_status IN ('pending', 'failed')"
      )
      .run(docId)

    try {
      const embeddings = await embeddingService.embedBatch(
        chunks.map((c) => c.content),
        {
          embeddingApiUrl: kbRow.embedding_api_url,
          embeddingApiKey: kbRow.embedding_api_key,
          embeddingModel: kbRow.embedding_model
        },
        (cur, total) => onProgress?.(cur, total, `正在向量化分片 ${cur}/${total}`)
      )

      const vectorStore = await VectorStore.getInstance()
      await vectorStore.addVectors(
        kbId,
        chunks.map((c, i) => ({
          chunkId: c.id,
          docId,
          vector: embeddings[i] || [],
          content: c.content
        }))
      )

      const markDone = this.db.prepare(
        "UPDATE chunks SET embedding_status = 'done', embedding_model = ?, embedding_error = '' WHERE id = ?"
      )
      for (const c of chunks) {
        markDone.run(kbRow.embedding_model, c.id)
      }
      onProgress?.(chunks.length, chunks.length, '完成')
    } catch (e: any) {
      const errMsg = e?.message || String(e)
      this.db
        .prepare(
          "UPDATE chunks SET embedding_status = 'failed', embedding_error = ? WHERE doc_id = ? AND embedding_status = 'processing'"
        )
        .run(errMsg, docId)
      throw e
    }
  }

  async retryEmbedding(
    docId: string,
    kbId: string,
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<void> {
    this.db
      .prepare(
        "UPDATE chunks SET embedding_status = 'pending', embedding_error = '' WHERE doc_id = ? AND embedding_status = 'failed'"
      )
      .run(docId)
    await this.processEmbeddings(docId, kbId, onProgress)
  }

  private getKbChunkConfig(kbId: string): { chunkSize: number; chunkOverlap: number } {
    const row = this.db
      .prepare('SELECT chunk_size, chunk_overlap FROM knowledge_bases WHERE id = ?')
      .get(kbId) as { chunk_size?: number; chunk_overlap?: number } | undefined
    return {
      chunkSize: row?.chunk_size ?? 500,
      chunkOverlap: row?.chunk_overlap ?? 50
    }
  }

  private chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
    const chunks: string[] = []
    const paragraphs = text.split(/\n\s*\n/)
    let current = ''

    for (const para of paragraphs) {
      const trimmed = para.trim()
      if (!trimmed) continue

      if (current.length + trimmed.length > chunkSize && current.length > 0) {
        chunks.push(current.trim())
        current = current.slice(-overlap) + '\n\n' + trimmed
      } else {
        current += (current ? '\n\n' : '') + trimmed
      }
    }
    if (current.trim()) chunks.push(current.trim())

    return chunks
  }

  private computeDocStatus(docId: string): EmbeddingStatus {
    const row = this.db
      .prepare(
        `SELECT
          CASE
            WHEN COUNT(*) = 0 THEN 'done'
            WHEN SUM(CASE WHEN embedding_status = 'failed' THEN 1 ELSE 0 END) > 0 THEN 'failed'
            WHEN SUM(CASE WHEN embedding_status = 'processing' THEN 1 ELSE 0 END) > 0 THEN 'processing'
            WHEN SUM(CASE WHEN embedding_status = 'pending' THEN 1 ELSE 0 END) > 0 THEN 'pending'
            ELSE 'done'
          END as status
         FROM chunks WHERE doc_id = ?`
      )
      .get(docId) as { status: string } | undefined
    return (row?.status as EmbeddingStatus) || 'pending'
  }

  private rowToDoc(row: any, chunks?: any[]): Document {
    return {
      id: row.id,
      kbId: row.kb_id,
      title: row.title,
      source: row.source,
      sourceType: row.source_type,
      content: row.content,
      chunks:
        chunks?.map((c) => ({
          id: c.id,
          docId: c.doc_id,
          content: c.content,
          index: c.chunk_index,
          metadata: JSON.parse(c.metadata || '{}'),
          embeddingStatus: c.embedding_status as EmbeddingStatus | undefined,
          embeddingError: c.embedding_error || undefined
        })) || [],
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      embeddingStatus: this.computeDocStatus(row.id)
    }
  }
}

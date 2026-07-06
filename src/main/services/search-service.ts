import { app, net } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import type { SearchResult, AppSettings, KnowledgeBase, ProviderKind } from '@shared/types'
import { embeddingService } from './embedding-service'
import { tokenize } from './tokenizer'
import { VectorStore } from './vector-store'

export type EmbeddingProgress = (current: number, total: number, status: string) => void

interface ChunkRecord {
  id: string
  doc_id: string
  content: string
  doc_title: string
}

export class SearchService {
  private db: Database.Database

  constructor() {
    const dataDir = join(app.getPath('userData'), 'rag-data')
    this.db = new Database(join(dataDir, 'app.db'))
  }

  async search(
    kbId: string,
    query: string,
    mode: 'bm25' | 'vector' | 'hybrid' | 'graph',
    topK: number,
    onProgress?: EmbeddingProgress
  ): Promise<SearchResult[]> {
    if (mode === 'bm25') {
      const chunks = this.getKbChunks(kbId)
      if (chunks.length === 0) return []
      return this.bm25Search(chunks, query, topK)
    }

    if (mode === 'vector') {
      return this.vectorSearch(kbId, query, topK, onProgress)
    }

    if (mode === 'hybrid') {
      const chunks = this.getKbChunks(kbId)
      if (chunks.length === 0) return []
      const bm25Results = this.bm25Search(chunks, query, topK * 2)
      const vectorResults = await this.vectorSearch(kbId, query, topK * 2, onProgress)
      return this.rrfMerge(bm25Results, vectorResults, topK)
    }

    if (mode === 'graph') {
      return this.graphSearch(kbId, query, topK, onProgress)
    }

    return []
  }

  private bm25Search(chunks: ChunkRecord[], query: string, topK: number): SearchResult[] {
    const k1 = 1.5
    const b = 0.75
    const queryTerms = tokenize(query)
    if (queryTerms.length === 0) return []

    const docCount = chunks.length

    const docStats = chunks.map((chunk) => {
      const tokens = tokenize(chunk.content)
      const tokenFreq: Map<string, number> = new Map()
      for (const t of tokens) {
        tokenFreq.set(t, (tokenFreq.get(t) || 0) + 1)
      }
      return { chunk, tokenFreq, docLen: tokens.length }
    })

    const totalLen = docStats.reduce((sum, d) => sum + d.docLen, 0)
    const avgDl = totalLen / docCount

    const termDocFreq: Map<string, number> = new Map()
    for (const term of queryTerms) {
      const df = docStats.filter((d) => d.tokenFreq.has(term)).length
      termDocFreq.set(term, df)
    }

    const scores: { chunk: ChunkRecord; score: number }[] = []

    for (const { chunk, tokenFreq, docLen } of docStats) {
      let score = 0

      for (const term of queryTerms) {
        const df = termDocFreq.get(term) || 0
        if (df === 0) continue

        const tf = tokenFreq.get(term) || 0
        if (tf === 0) continue

        const idf = Math.log((docCount - df + 0.5) / (df + 0.5) + 1)
        const numerator = tf * (k1 + 1)
        const denominator = tf + k1 * (1 - b + b * (docLen / avgDl))
        score += idf * (numerator / denominator)
      }

      if (score > 0) {
        scores.push({ chunk, score })
      }
    }

    scores.sort((a, b) => b.score - a.score)
    return scores.slice(0, topK).map(({ chunk, score }) => ({
      chunkId: chunk.id,
      docId: chunk.doc_id,
      docTitle: chunk.doc_title,
      content: chunk.content.slice(0, 500),
      score,
      source: 'bm25' as const,
      highlights: this.highlightTerms(chunk.content, queryTerms)
    }))
  }

  private async vectorSearch(
    kbId: string,
    query: string,
    topK: number,
    onProgress?: EmbeddingProgress
  ): Promise<SearchResult[]> {
    try {
      const kb = this.getKb(kbId)
      if (!kb) throw new Error('知识库不存在')
      if (!kb.embeddingApiUrl || !kb.embeddingApiKey) {
        throw new Error('该知识库未配置 Embedding API')
      }

      onProgress?.(0, 1, '正在生成查询向量...')
      const queryEmbedding = await embeddingService.embed(query, {
        embeddingApiUrl: kb.embeddingApiUrl,
        embeddingApiKey: kb.embeddingApiKey,
        embeddingModel: kb.embeddingModel
      })
      if (!queryEmbedding) {
        throw new Error('Embedding 服务未返回结果')
      }

      onProgress?.(1, 1, '正在检索向量...')
      const vectorStore = await VectorStore.getInstance()
      const hits = await vectorStore.search(kbId, queryEmbedding, topK)
      if (hits.length === 0) return []

      const chunkIds = hits.map((h) => h.chunkId)
      const placeholders = chunkIds.map(() => '?').join(',')
      const rows = this.db
        .prepare(
          `SELECT c.id, c.doc_id, c.content, d.title as doc_title
           FROM chunks c JOIN documents d ON c.doc_id = d.id
           WHERE c.id IN (${placeholders})`
        )
        .all(...chunkIds) as ChunkRecord[]
      const rowMap = new Map(rows.map((r) => [r.id, r]))

      const validHits = hits.filter((h) => rowMap.has(h.chunkId))
      return validHits.map((h) => {
        const r = rowMap.get(h.chunkId)!
        return {
          chunkId: h.chunkId,
          docId: r.doc_id,
          docTitle: r.doc_title,
          content: r.content.slice(0, 500),
          score: h.score,
          source: 'vector' as const,
          highlights: []
        }
      })
    } catch (e: any) {
      console.error('[vectorSearch] 失败:', e)
      throw new Error(`向量检索失败: ${e?.message || e}`)
    }
  }

  private async graphSearch(
    kbId: string,
    query: string,
    topK: number,
    onProgress?: EmbeddingProgress
  ): Promise<SearchResult[]> {
    const entities = this.db
      .prepare('SELECT * FROM graph_entities WHERE kb_id = ?')
      .all(kbId) as any[]

    if (entities.length === 0) {
      const chunks = this.getKbChunks(kbId)
      return this.bm25Search(chunks, query, topK)
    }

    const kb = this.getKb(kbId)
    if (!kb || !kb.embeddingApiUrl || !kb.embeddingApiKey) {
      const chunks = this.getKbChunks(kbId)
      return this.bm25Search(chunks, query, topK)
    }
    const config = {
      embeddingApiUrl: kb.embeddingApiUrl,
      embeddingApiKey: kb.embeddingApiKey,
      embeddingModel: kb.embeddingModel
    }

    onProgress?.(0, entities.length, '正在生成查询向量...')
    const queryEmbedding = await embeddingService.embed(query, config)
    if (!queryEmbedding) {
      throw new Error('Embedding 服务未返回结果')
    }

    const entityEmbeddings = await embeddingService.embedBatch(
      entities.map((e: any) => `${e.name}: ${e.description}`),
      config,
      (current, total) => onProgress?.(current, total, `正在向量化实体 ${current}/${total}`)
    )

    const entityScores = entities.map((entity: any, i: number) => ({
      entity,
      score: this.cosineSimilarity(queryEmbedding, entityEmbeddings[i] || [])
    }))

    entityScores.sort((a, b) => b.score - a.score)
    const topEntities = entityScores.slice(0, 5)

    const entityIds = new Set(topEntities.map((e) => e.entity.id))
    const relations = this.db
      .prepare('SELECT * FROM graph_relations WHERE kb_id = ?')
      .all(kbId) as any[]

    const relatedEntityIds = new Set<string>()
    for (const rel of relations) {
      if (entityIds.has(rel.source_entity_id)) relatedEntityIds.add(rel.target_entity_id)
      if (entityIds.has(rel.target_entity_id)) relatedEntityIds.add(rel.source_entity_id)
    }

    const allRelevantEntities = [...topEntities]
    for (const entity of entities) {
      if (relatedEntityIds.has(entity.id) && !entityIds.has(entity.id)) {
        allRelevantEntities.push({ entity, score: 0.3 })
      }
    }

    const chunks = this.getKbChunks(kbId)
    const results: SearchResult[] = []

    for (const { entity, score } of allRelevantEntities) {
      const matchingChunks = chunks.filter((c) =>
        c.content.toLowerCase().includes(entity.name.toLowerCase())
      )
      for (const chunk of matchingChunks.slice(0, 3)) {
        results.push({
          chunkId: chunk.id,
          docId: chunk.doc_id,
          docTitle: chunk.doc_title,
          content: chunk.content.slice(0, 500),
          score: score * 0.7,
          source: 'graph' as const,
          highlights: [entity.name]
        })
      }
    }

    const bm25Results = this.bm25Search(chunks, query, topK)
    return this.rrfMerge(results, bm25Results, topK)
  }

  private rrfMerge(
    resultsA: SearchResult[],
    resultsB: SearchResult[],
    topK: number,
    k = 60
  ): SearchResult[] {
    const scoreMap = new Map<string, { result: SearchResult; score: number }>()

    for (let i = 0; i < resultsA.length; i++) {
      const r = resultsA[i]
      scoreMap.set(r.chunkId, { result: r, score: 1 / (k + i + 1) })
    }

    for (let i = 0; i < resultsB.length; i++) {
      const r = resultsB[i]
      const existing = scoreMap.get(r.chunkId)
      if (existing) {
        existing.score += 1 / (k + i + 1)
        existing.result.source = 'hybrid'
      } else {
        scoreMap.set(r.chunkId, { result: r, score: 1 / (k + i + 1) })
      }
    }

    return [...scoreMap.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ result, score }) => ({ ...result, score }))
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0) return 0
    let dot = 0,
      normA = 0,
      normB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * (b[i] || 0)
      normA += a[i] * a[i]
      normB += (b[i] || 0) * (b[i] || 0)
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10)
  }

  private highlightTerms(text: string, terms: string[]): string[] {
    const highlights: string[] = []
    const lower = text.toLowerCase()
    for (const term of terms) {
      const idx = lower.indexOf(term.toLowerCase())
      if (idx >= 0) {
        const start = Math.max(0, idx - 40)
        const end = Math.min(text.length, idx + term.length + 40)
        highlights.push(
          (start > 0 ? '...' : '') +
            text.slice(start, end) +
            (end < text.length ? '...' : '')
        )
      }
    }
    return highlights.slice(0, 3)
  }

  private getKbChunks(kbId: string): ChunkRecord[] {
    return this.db
      .prepare(
        `SELECT c.id, c.doc_id, c.content, d.title as doc_title
       FROM chunks c
       JOIN documents d ON c.doc_id = d.id
       WHERE d.kb_id = ?
       ORDER BY d.created_at, c.chunk_index`
      )
      .all(kbId) as ChunkRecord[]
  }

  private getKb(kbId: string): KnowledgeBase | null {
    const row = this.db.prepare('SELECT * FROM knowledge_bases WHERE id = ?').get(kbId) as any
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      embeddingModel: row.embedding_model,
      embeddingApiUrl: row.embedding_api_url,
      embeddingApiKey: row.embedding_api_key,
      chunkSize: row.chunk_size ?? 500,
      chunkOverlap: row.chunk_overlap ?? 50,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      documentCount: row.document_count
    }
  }

  async testEmbedding(settings: AppSettings): Promise<void> {
    await embeddingService.test({
      embeddingApiUrl: settings.embeddingApiUrl,
      embeddingApiKey: settings.embeddingApiKey,
      embeddingModel: settings.embeddingModel
    })
  }

  async testRerank(settings: AppSettings): Promise<void> {
    if (!settings.rerankApiUrl) {
      throw new Error('未配置 ReRank API 地址')
    }
    const response = await net.fetch(settings.rerankApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.rerankApiKey ? { Authorization: `Bearer ${settings.rerankApiKey}` } : {})
      },
      body: JSON.stringify({
        model: settings.rerankModel || 'bge-reranker-v2-m3',
        query: 'test query',
        documents: ['test document one', 'test document two']
      }),
      signal: AbortSignal.timeout(10000)
    })
    if (!response.ok) {
      throw new Error(`ReRank API 返回错误: HTTP ${response.status}`)
    }
  }

  async testLlm(config: { apiUrl: string; apiKey: string; model: string }): Promise<void> {
    if (!config.apiUrl) {
      throw new Error('未配置 LLM API 地址')
    }
    if (!config.apiKey) {
      throw new Error('未配置 LLM API Key')
    }
    const response = await net.fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false
      }),
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`LLM API 返回错误: HTTP ${response.status} ${text.slice(0, 200)}`)
    }
  }

  async listProviderModels(config: {
    apiHost: string
    apiKey: string
    kind: ProviderKind
  }): Promise<{ id: string; name?: string; ownedBy?: string }[]> {
    const apiHost = (config.apiHost || '').replace(/\/+$/, '')
    if (!apiHost) throw new Error('未配置 API Host')
    if (!config.apiKey) throw new Error('未配置 API Key')

    if (config.kind === 'gemini') {
      const url = `${apiHost}/models`
      const response = await net.fetch(url, {
        method: 'GET',
        headers: { 'x-goog-api-key': config.apiKey },
        signal: AbortSignal.timeout(15000)
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`HTTP ${response.status} ${text.slice(0, 200)}`)
      }
      const data = (await response.json()) as {
        models?: { name?: string; displayName?: string; description?: string }[]
      }
      const list = data.models ?? []
      return list
        .map((m) => {
          const raw = m.name ?? ''
          const id = raw.startsWith('models/') ? raw.slice('models/'.length) : raw
          return { id, name: m.displayName || id }
        })
        .filter((m) => m.id)
    }

    const url = `${apiHost}/models`
    const response = await net.fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status} ${text.slice(0, 200)}`)
    }
    const data = (await response.json()) as {
      data?: { id: string; owned_by?: string }[]
    }
    const list = data.data ?? []
    return list
      .map((m) => ({ id: m.id, ownedBy: m.owned_by }))
      .filter((m) => m.id)
  }
}

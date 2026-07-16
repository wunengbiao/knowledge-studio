import { join } from 'path'
import type {
  ActiveModelRef,
  AppSettings,
  KnowledgeBase,
  ProviderKind,
  SearchResult
} from '@shared/types'
import Database from 'better-sqlite3'
import { net, app } from 'electron'
import { embeddingService } from './embedding-service'
import { GraphService } from './graph-service'
import { SettingsService, resolveCapabilityUrl } from './settings-service'
import { tokenize } from './tokenizer'
import { VectorStore } from './vector-store'

export type EmbeddingProgress = (current: number, total: number, status: string) => void

interface ChunkRecord {
  id: string
  doc_id: string
  content: string
  doc_title: string
  title?: string
}

export class SearchService {
  private db: Database.Database
  private settingsService = new SettingsService()
  private graphService = new GraphService()

  constructor() {
    const dataDir = join(app.getPath('userData'), 'rag-data')
    this.db = new Database(join(dataDir, 'app.db'))
  }

  async search(
    kbId: string,
    query: string,
    mode: 'bm25' | 'vector' | 'hybrid' | 'graph',
    topK: number,
    onProgress?: EmbeddingProgress,
    rerankOverride?: ActiveModelRef | null,
    embeddingTopK?: number
  ): Promise<SearchResult[]> {
    if (mode === 'bm25') {
      const chunks = this.getKbChunks(kbId)
      if (chunks.length === 0) return []
      return this.bm25Search(chunks, query, topK)
    }

    if (mode === 'vector') {
      return this.vectorSearch(kbId, query, embeddingTopK ?? topK, onProgress)
    }

    if (mode === 'hybrid') {
      const chunks = this.getKbChunks(kbId)
      if (chunks.length === 0) return []
      const candidateK = embeddingTopK ?? Math.max(topK * 3, 30)
      const bm25Results = this.bm25Search(chunks, query, candidateK)

      const hydeDoc = await this.generateHydeDocument(query)
      let vectorResults: SearchResult[]
      if (hydeDoc) {
        const kb = this.getKb(kbId)
        const hydeEmbedding =
          kb && kb.embeddingApiUrl && kb.embeddingApiKey
            ? await embeddingService.embed(hydeDoc, {
                embeddingApiUrl: kb.embeddingApiUrl,
                embeddingApiKey: kb.embeddingApiKey,
                embeddingModel: kb.embeddingModel
              }, 'passage')
            : null
        vectorResults = await this.vectorSearch(kbId, query, candidateK, onProgress, hydeEmbedding ?? undefined)
      } else {
        vectorResults = await this.vectorSearch(kbId, query, candidateK, onProgress)
      }

      const merged = this.rrfMerge(bm25Results, vectorResults, candidateK)
      const kb = this.getKb(kbId)
      const effectiveRerank = rerankOverride ?? kb?.rerankModelRef ?? null
      if (effectiveRerank) {
        const reranked = await this.rerankResults(query, merged, effectiveRerank)
        return reranked.slice(0, topK)
      }
      return merged.slice(0, topK)
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
        title: chunk.title ?? '',
        content: chunk.content,
        score,
        source: 'bm25' as const,
        highlights: this.highlightTerms(chunk.content, queryTerms)
      }))
  }

  private async vectorSearch(
    kbId: string,
    query: string,
    topK: number,
    onProgress?: EmbeddingProgress,
    queryEmbedding?: number[]
  ): Promise<SearchResult[]> {
    try {
      const kb = this.getKb(kbId)
      if (!kb) throw new Error('知识库不存在')
      if (!kb.embeddingApiUrl || !kb.embeddingApiKey) {
        throw new Error('该知识库未配置 Embedding API')
      }

      const embedding =
        queryEmbedding ??
        (await embeddingService.embed(
          query,
          {
            embeddingApiUrl: kb.embeddingApiUrl,
            embeddingApiKey: kb.embeddingApiKey,
            embeddingModel: kb.embeddingModel
          },
          'query'
        ))
      if (!embedding) {
        throw new Error('Embedding 服务未返回结果')
      }

      onProgress?.(1, 1, '正在检索向量...')
      const vectorStore = await VectorStore.getInstance()
      const hits = await vectorStore.search(kbId, embedding, topK)
      if (hits.length === 0) return []

      const chunkIds = hits.map((h) => h.chunkId)
      const placeholders = chunkIds.map(() => '?').join(',')
      const rows = this.db
        .prepare(
          `SELECT c.id, c.doc_id, c.content, c.title, d.title as doc_title
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
          title: r.title ?? '',
          content: r.content,
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
    const entityExists = this.db
      .prepare('SELECT 1 AS has FROM graph_entities WHERE kb_id = ? LIMIT 1')
      .get(kbId) as { has: number } | undefined
    if (!entityExists) {
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

    onProgress?.(0, 1, '正在生成查询向量...')
    const queryEmbedding = await embeddingService.embed(query, config, 'query')
    if (!queryEmbedding) {
      throw new Error('Embedding 服务未返回结果')
    }

    const entities = await this.graphService.ensureEntityEmbeddings(
      kbId,
      config,
      queryEmbedding.length,
      onProgress
    )

    const entityScores = entities
      .filter((e) => e.embedding !== null)
      .map((entity) => ({
        entity,
        score: this.cosineSimilarity(queryEmbedding, entity.embedding as number[])
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
          title: chunk.title ?? '',
          content: chunk.content,
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
    const scoreMap = new Map<string, { result: SearchResult; rrfScore: number }>()

    for (let i = 0; i < resultsA.length; i++) {
      const r = resultsA[i]
      scoreMap.set(r.chunkId, { result: r, rrfScore: 1 / (k + i + 1) })
    }

    for (let i = 0; i < resultsB.length; i++) {
      const r = resultsB[i]
      const existing = scoreMap.get(r.chunkId)
      if (existing) {
        existing.rrfScore += 1 / (k + i + 1)
        existing.result.source = 'hybrid'
      } else {
        scoreMap.set(r.chunkId, { result: r, rrfScore: 1 / (k + i + 1) })
      }
    }

    const sorted = [...scoreMap.values()].sort((a, b) => b.rrfScore - a.rrfScore).slice(0, topK)
    if (sorted.length === 0) return []

    // RRF 原始分数落在 0.01-0.03 量级，直接展示会显示为 1-3% 显得过低；
    // min-max 归一化到 [0.4, 0.9] 使相关度百分比落在合理区间，排序保持不变
    const maxScore = sorted[0].rrfScore
    const minScore = sorted[sorted.length - 1].rrfScore
    const FLOOR = 0.4
    const CEILING = 0.9

    return sorted.map(({ result, rrfScore }) => {
      const ratio = maxScore === minScore ? 1 : (rrfScore - minScore) / (maxScore - minScore)
      return { ...result, score: FLOOR + ratio * (CEILING - FLOOR) }
    })
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
          (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '')
        )
      }
    }
    return highlights.slice(0, 3)
  }

  private getKbChunks(kbId: string): ChunkRecord[] {
    return this.db
      .prepare(
        `SELECT c.id, c.doc_id, c.content, c.title, d.title as doc_title
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
      rerankModelRef: row.rerank_model_ref
        ? (() => {
            try {
              const p = JSON.parse(row.rerank_model_ref)
              return p && typeof p.providerId === 'string' && typeof p.modelId === 'string'
                ? p
                : null
            } catch {
              return null
            }
          })()
        : null,
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

  private async rerankResults(
    query: string,
    results: SearchResult[],
    ref: ActiveModelRef
  ): Promise<SearchResult[]> {
    if (results.length === 0) return results
    const settings = this.settingsService.get()
    const provider = settings.providers.find((p) => p.id === ref.providerId)
    const model = provider?.models.find((m) => m.id === ref.modelId && m.capabilities.rerank)
    if (!provider || !model) {
      console.warn('[search] rerank model not found:', ref)
      return results
    }
    const apiUrl = resolveCapabilityUrl(provider, 'rerank')
    // Snippet-only payload preserves the pre-fix rerank request size; full content stays on SearchResult.
    const rerankDocs = results.map((r) => {
      const snippet = r.content.length > 500 ? `${r.content.slice(0, 500)}…` : r.content
      return r.title ? `${r.title}\n${snippet}` : snippet
    })
    const response = await net.fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: ref.modelId,
        query,
        documents: rerankDocs
      }),
      signal: AbortSignal.timeout(30000)
    })
    if (!response.ok) {
      throw new Error(`ReRank API 返回错误: HTTP ${response.status}`)
    }
    const data = await response.json()
    const ranked: { index: number; score: number }[] = Array.isArray(data?.results)
      ? data.results.map((r: { index: number; relevance_score?: number }) => ({
          index: r.index,
          score: r.relevance_score ?? 0
        }))
      : Array.isArray(data?.data)
        ? data.data.map((r: { index: number; relevance_score?: number }) => ({
            index: r.index,
            score: r.relevance_score ?? 0
          }))
        : []
    if (ranked.length === 0) return results
    const scoreMap = new Map<number, number>()
    for (const r of ranked) scoreMap.set(r.index, r.score)
    return results
      .map((r, i) => ({ r, score: scoreMap.get(i) ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .map((x) => ({ ...x.r, score: x.score }))
  }

  /** HyDE (Hypothetical Document Embeddings): ask the app's active chat model to
   *  generate a short hypothetical answer for the query, then embed that answer
   *  instead of the raw query. The hypothetical answer's wording is closer to the
   *  document corpus than the question wording, so vector recall improves.
   *  Returns null on any failure (no chat model configured, LLM error, timeout) -
   *  caller falls back to embedding the raw query. */
  private async generateHydeDocument(query: string): Promise<string | null> {
    const settings = this.settingsService.get()
    const activeChat = settings.activeChatModel
    if (!activeChat) return null
    const provider = settings.providers.find((p) => p.id === activeChat.providerId)
    if (!provider) return null
    const model = provider.models.find((m) => m.id === activeChat.modelId && m.capabilities.chat)
    if (!model) return null

    const apiUrl = resolveCapabilityUrl(provider, 'chat')
    try {
      const response = await net.fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: activeChat.modelId,
          messages: [
            {
              role: 'system',
              content:
                '你是一个文档生成助手。针对用户的问题，生成一段简短的假设性答案（100-200字），直接给出答案正文，不要加任何前缀、注释或元信息。这段文字将用于语义检索。'
            },
            { role: 'user', content: query }
          ],
          temperature: 0.3,
          max_tokens: 300,
          stream: false
        }),
        signal: AbortSignal.timeout(15000)
      })
      if (!response.ok) return null
      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content
      const trimmed = typeof content === 'string' ? content.trim() : ''
      return trimmed.length > 0 ? trimmed : null
    } catch (e) {
      console.warn('[HyDE] 生成失败，回退到原始查询:', e)
      return null
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
    return list.map((m) => ({ id: m.id, ownedBy: m.owned_by })).filter((m) => m.id)
  }
}

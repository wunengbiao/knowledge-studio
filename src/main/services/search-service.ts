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
import { embeddingService, isOllamaUrl } from './embedding-service'
import { GraphService } from './graph-service'
import { SettingsService, resolveCapabilityUrl } from './settings-service'
import { extractEntities, tokenize } from './tokenizer'
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
    mode: 'bm25' | 'vector' | 'hybrid' | 'graph' | 'hybrid-expand',
    topK: number,
    onProgress?: EmbeddingProgress,
    rerankOverride?: ActiveModelRef | null,
    embeddingTopK?: number
  ): Promise<SearchResult[]> {
    if (mode === 'bm25') {
      return this.ftsSearch(kbId, query, topK)
    }

    if (mode === 'vector') {
      return this.vectorSearch(kbId, query, embeddingTopK ?? topK, onProgress)
    }

    if (mode === 'hybrid') {
      const candidateK = embeddingTopK ?? Math.max(topK * 3, 30)
      const bm25Results = await this.ftsSearch(kbId, query, candidateK)

      const hydeDoc = await this.generateHydeDocument(query)
      let vectorResults: SearchResult[]
      if (hydeDoc) {
        const kb = this.getKb(kbId)
        const hydeEmbedding =
          kb && kb.embeddingApiUrl && kb.embeddingApiKey
            ? await embeddingService.embed(
                hydeDoc,
                {
                  embeddingApiUrl: kb.embeddingApiUrl,
                  embeddingApiKey: kb.embeddingApiKey,
                  embeddingModel: kb.embeddingModel
                },
                'passage'
              )
            : null
        vectorResults = await this.vectorSearch(
          kbId,
          query,
          candidateK,
          onProgress,
          hydeEmbedding ?? undefined
        )
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

    if (mode === 'hybrid-expand') {
      return this.hybridExpandSearch(kbId, query, topK, onProgress, rerankOverride, embeddingTopK)
    }

    return []
  }

  private async ftsSearch(kbId: string, query: string, topK: number): Promise<SearchResult[]> {
    const queryTerms = tokenize(query)
    if (queryTerms.length === 0) return []

    const vectorStore = await VectorStore.getInstance()
    await vectorStore.ensureFtsReady(kbId)
    const hits = await vectorStore.ftsSearch(kbId, query, topK)
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

    return hits
      .filter((h) => rowMap.has(h.chunkId))
      .map((h) => {
        const r = rowMap.get(h.chunkId)!
        return {
          chunkId: h.chunkId,
          docId: r.doc_id,
          docTitle: r.doc_title,
          title: r.title ?? '',
          content: r.content,
          score: h.score,
          source: 'bm25' as const,
          highlights: this.highlightTerms(r.content, queryTerms)
        }
      })
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
      const isOllama = !!kb.embeddingApiUrl && isOllamaUrl(kb.embeddingApiUrl)
      if (!kb.embeddingApiUrl || (!isOllama && !kb.embeddingApiKey)) {
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
      return this.ftsSearch(kbId, query, topK)
    }

    const kb = this.getKb(kbId)
    if (!kb || !kb.embeddingApiUrl || !kb.embeddingApiKey) {
      return this.ftsSearch(kbId, query, topK)
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

    const ftsResults = await this.ftsSearch(kbId, query, topK)
    return this.rrfMerge(results, ftsResults, topK)
  }

  /**
   * Chat 专用增强检索：multi-query + entity expansion。
   * 1. BM25 召回
   * 2. 从 query 抽实体（jieba）
   * 3. GraphRAG 找相近实体（embedding top5 + 一度邻居）
   * 4. LLM 一次生成 { hyde, rewrites[3] }
   * 5. 并行 5 路向量检索（query + hyde + 3 rewrites）
   * 6. RRF 合并 BM25 + 5 路向量
   * 7. 可选 rerank
   * 每步打 [expand-search] 日志。
   */
  private async hybridExpandSearch(
    kbId: string,
    query: string,
    topK: number,
    onProgress?: EmbeddingProgress,
    rerankOverride?: ActiveModelRef | null,
    embeddingTopK?: number
  ): Promise<SearchResult[]> {
    const TAG = '[expand-search]'
    const candidateK = embeddingTopK ?? Math.max(topK * 3, 30)
    const startedAt = Date.now()
    console.log(TAG, '▶ start', { kbId, query, topK, candidateK })

    // Step 1: BM25
    const t1 = Date.now()
    const bm25Results = await this.ftsSearch(kbId, query, candidateK)
    console.log(TAG, `step1 BM25 done (${Date.now() - t1}ms)`, { hits: bm25Results.length })

    // Step 2: 从 query 抽实体
    const t2 = Date.now()
    const queryEntities = extractEntities(query, 10)
    console.log(
      TAG,
      `step2 query entities (${Date.now() - t2}ms)`,
      queryEntities.map((e) => `${e.name}/${e.type}`)
    )

    // Step 3: GraphRAG 找相近实体
    const t3 = Date.now()
    const kb = this.getKb(kbId)
    const hasGraph = !!this.db
      .prepare('SELECT 1 AS has FROM graph_entities WHERE kb_id = ? LIMIT 1')
      .get(kbId)
    console.log(TAG, 'step3 graph status', { hasGraph, kbConfigured: !!kb?.embeddingApiUrl })

    let graphContext: { name: string; type: string; description: string; score: number }[] = []
    if (kb && kb.embeddingApiUrl && kb.embeddingApiKey && hasGraph) {
      const config = {
        embeddingApiUrl: kb.embeddingApiUrl,
        embeddingApiKey: kb.embeddingApiKey,
        embeddingModel: kb.embeddingModel
      }
      try {
        onProgress?.(0, 1, '正在生成查询向量...')
        const queryEmbedding = await embeddingService.embed(query, config, 'query')
        if (!queryEmbedding) {
          console.warn(TAG, 'step3 query embedding returned null, skip graph expand')
        } else {
          const entities = await this.graphService.ensureEntityEmbeddings(
            kbId,
            config,
            queryEmbedding.length,
            onProgress
          )
          const scored = entities
            .filter((e) => e.embedding !== null)
            .map((e) => ({
              e,
              score: this.cosineSimilarity(queryEmbedding, e.embedding as number[])
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
          const topIds = new Set(scored.map((s) => s.e.id))
          const relations = this.db
            .prepare('SELECT * FROM graph_relations WHERE kb_id = ?')
            .all(kbId) as any[]
          const neighborIds = new Set<string>()
          for (const rel of relations) {
            if (topIds.has(rel.source_entity_id)) neighborIds.add(rel.target_entity_id)
            if (topIds.has(rel.target_entity_id)) neighborIds.add(rel.source_entity_id)
          }
          const neighbors = entities
            .filter((e) => neighborIds.has(e.id) && !topIds.has(e.id))
            .slice(0, 8)
          graphContext = [
            ...scored.map((s) => ({
              name: s.e.name,
              type: s.e.type,
              description: s.e.description,
              score: s.score
            })),
            ...neighbors.map((e) => ({
              name: e.name,
              type: e.type,
              description: e.description,
              score: 0.3
            }))
          ]
          console.log(TAG, `step3 graph expand done (${Date.now() - t3}ms)`, {
            topEntities: scored.map((s) => `${s.e.name}(${s.score.toFixed(3)})`),
            neighbors: neighbors.map((e) => e.name),
            total: graphContext.length
          })
        }
      } catch (e) {
        console.warn(TAG, 'step3 graph expand failed, continue without graph context', e)
      }
    } else {
      console.log(TAG, 'step3 skip graph expand (no graph data or no embedding config)')
    }

    // Step 4: LLM 一次生成 hyde + 3 rewrites
    const t4 = Date.now()
    const expansion = await this.generateQueryExpansion(query, graphContext)
    if (!expansion) {
      console.warn(
        TAG,
        `step4 LLM expansion failed (${Date.now() - t4}ms), fallback to plain hybrid`
      )
      // 退回：BM25 + 单路向量（原始 query）
      const vectorResults = await this.vectorSearch(kbId, query, candidateK, onProgress)
      const merged = this.rrfMerge(bm25Results, vectorResults, candidateK)
      const effectiveRerank = rerankOverride ?? kb?.rerankModelRef ?? null
      if (effectiveRerank) {
        const reranked = await this.rerankResults(query, merged, effectiveRerank)
        return reranked.slice(0, topK)
      }
      return merged.slice(0, topK)
    }
    console.log(TAG, `step4 LLM expansion done (${Date.now() - t4}ms)`, {
      hyde: `${expansion.hyde.slice(0, 80)}...`,
      rewrites: expansion.rewrites
    })

    // Step 5: 并行 embedding (query + hyde + 3 rewrites) + 多路向量检索
    const t5 = Date.now()
    if (!kb || !kb.embeddingApiUrl || !kb.embeddingApiKey) {
      console.warn(TAG, 'step5 no embedding config, return BM25 only')
      return bm25Results.slice(0, topK)
    }
    const config = {
      embeddingApiUrl: kb.embeddingApiUrl,
      embeddingApiKey: kb.embeddingApiKey,
      embeddingModel: kb.embeddingModel
    }
    const allTexts = [query, expansion.hyde, ...expansion.rewrites]
    const labels = ['query', 'hyde', 'rewrite1', 'rewrite2', 'rewrite3']
    onProgress?.(0, allTexts.length, '正在批量向量化查询扩展...')
    const allEmbeddings = await embeddingService.embedBatch(
      allTexts,
      config,
      (cur, total) => onProgress?.(cur, total, `正在向量化 ${cur}/${total}`),
      'query'
    )
    console.log(
      TAG,
      `step5 embeddings done (${Date.now() - t5}ms)`,
      allEmbeddings.map((e, i) => ({ label: labels[i], dim: e.length }))
    )

    // 多路向量检索（并行）
    const vectorSearchStart = Date.now()
    const vectorResults = await Promise.all(
      allEmbeddings.map((emb, i) =>
        emb && emb.length > 0
          ? this.vectorSearch(kbId, query, candidateK, undefined, emb).then((r) => {
              console.log(TAG, `step5 vector [${labels[i]}] hits=${r.length}`)
              return r
            })
          : Promise.resolve([] as SearchResult[])
      )
    )
    console.log(TAG, `step5 all vector searches done (${Date.now() - vectorSearchStart}ms)`, {
      channels: vectorResults.length
    })

    // Step 6: 多路 RRF 合并
    const t6 = Date.now()
    let merged = bm25Results
    for (let i = 0; i < vectorResults.length; i++) {
      merged = this.rrfMerge(merged, vectorResults[i], candidateK)
    }
    console.log(TAG, `step6 RRF merge done (${Date.now() - t6}ms)`, { total: merged.length })

    // Step 7: 可选 rerank
    const effectiveRerank = rerankOverride ?? kb.rerankModelRef ?? null
    if (effectiveRerank) {
      const t7 = Date.now()
      const reranked = await this.rerankResults(query, merged, effectiveRerank)
      console.log(TAG, `step7 rerank done (${Date.now() - t7}ms)`)
      const final = reranked.slice(0, topK)
      console.log(TAG, `■ done (${Date.now() - startedAt}ms)`, { final: final.length })
      return final
    }
    const final = merged.slice(0, topK)
    console.log(TAG, `■ done (${Date.now() - startedAt}ms, no rerank)`, { final: final.length })
    return final
  }

  /**
   * 调用当前激活的 chat 模型，一次性生成假设答案（hyde）+ 3 个改写查询。
   * prompt 中附带 GraphRAG 找到的相关实体作为背景。
   * 返回 null 表示任何失败（无 chat 模型、LLM 错误、JSON 解析失败）。
   */
  private async generateQueryExpansion(
    query: string,
    graphContext: { name: string; type: string; description: string; score: number }[]
  ): Promise<{ hyde: string; rewrites: string[] } | null> {
    const settings = this.settingsService.get()
    const activeChat = settings.activeChatModel
    if (!activeChat) return null
    const provider = settings.providers.find((p) => p.id === activeChat.providerId)
    if (!provider) return null
    const model = provider.models.find((m) => m.id === activeChat.modelId && m.capabilities.chat)
    if (!model) return null

    const apiUrl = resolveCapabilityUrl(provider, 'chat')
    const entityLines =
      graphContext.length > 0
        ? graphContext
            .slice(0, 10)
            .map((e) => `- ${e.name}（类型：${e.type}）: ${e.description}`)
            .join('\n')
        : '（无可用实体）'

    const systemPrompt = [
      '你是查询扩展助手。根据用户问题和提供的相关实体列表，生成用于语义检索的扩展查询。',
      '输出严格的 JSON，不要加 markdown 代码块标记、不要加任何解释文字。',
      'JSON 格式：',
      '{',
      '  "hyde": "100-200 字的假设性答案文档，直接给答案正文，用于 passage 检索",',
      '  "rewrites": ["改写查询1", "改写查询2", "改写查询3"]',
      '}',
      'rewrites 要求：3 条不同角度的查询改写，可以是同义改写、视角转换、或补全省略上下文；每条不超过 50 字；不要照抄原问题。'
    ].join('\n')

    const userPrompt = `用户问题：${query}\n\n知识库相关实体：\n${entityLines}`

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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.4,
          max_tokens: 600,
          stream: false,
          response_format: { type: 'json_object' }
        }),
        signal: AbortSignal.timeout(20000)
      })
      if (!response.ok) {
        console.warn('[expand-search] LLM response not ok', response.status)
        return null
      }
      const data = await response.json()
      const content: string = data?.choices?.[0]?.message?.content ?? ''
      const cleaned = content
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim()
      const parsed = JSON.parse(cleaned) as { hyde?: unknown; rewrites?: unknown }
      const hyde = typeof parsed.hyde === 'string' ? parsed.hyde.trim() : ''
      const rewrites = Array.isArray(parsed.rewrites)
        ? parsed.rewrites.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
        : []
      if (hyde.length === 0 || rewrites.length === 0) {
        console.warn('[expand-search] LLM output missing hyde or rewrites', {
          hyde: hyde.length,
          rewrites: rewrites.length
        })
        return null
      }
      return { hyde, rewrites: rewrites.slice(0, 3) }
    } catch (e) {
      console.warn('[expand-search] generateQueryExpansion failed:', e)
      return null
    }
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
    const withScores = results
      .map((r, i) => ({ r, score: scoreMap.get(i) ?? 0 }))
      .sort((a, b) => b.score - a.score)
    // rerank 模型返回的 relevance_score 量级不固定（0-1 / 0-10 / logit 等），
    // min-max 归一化到 [0.4, 0.9]，与 rrfMerge 保持一致，避免前端百分比 > 100%
    const maxScore = withScores.length > 0 ? withScores[0].score : 0
    const minScore = withScores.length > 0 ? withScores[withScores.length - 1].score : 0
    const FLOOR = 0.4
    const CEILING = 0.9
    return withScores.map(({ r, score }) => {
      const ratio = maxScore === minScore ? 1 : (score - minScore) / (maxScore - minScore)
      return { ...r, score: FLOOR + ratio * (CEILING - FLOOR) }
    })
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
    const isOllama =
      config.apiUrl.includes('ollama') ||
      config.apiUrl.includes(':11434') ||
      config.apiUrl.includes('/api/chat')
    if (!isOllama && !config.apiKey) {
      throw new Error('未配置 LLM API Key')
    }
    const response = await net.fetch(config.apiUrl, {
      method: 'POST',
      headers: isOllama
        ? { 'Content-Type': 'application/json' }
        : {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`
          },
      body: JSON.stringify(
        isOllama
          ? {
              model: config.model || 'llama3.2',
              messages: [{ role: 'user', content: 'ping' }],
              stream: false
            }
          : {
              model: config.model || 'gpt-4o-mini',
              messages: [{ role: 'user', content: 'ping' }],
              max_tokens: 1,
              stream: false
            }
      ),
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
    if (config.kind !== 'ollama' && !config.apiKey) throw new Error('未配置 API Key')

    if (config.kind === 'ollama') {
      const url = `${apiHost}/api/tags`
      const response = await net.fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(15000)
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`HTTP ${response.status} ${text.slice(0, 200)}`)
      }
      const data = (await response.json()) as { models?: { name?: string }[] }
      const list = data.models ?? []
      return list.map((m) => ({ id: m.name ?? '', name: m.name })).filter((m) => m.id)
    }

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

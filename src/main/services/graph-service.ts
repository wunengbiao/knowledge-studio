import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import { leiden, Graph } from 'leiden-ts'
import type { GraphEntity, GraphRelation, CommunityReport } from '@shared/types'
import { extractEntities } from './tokenizer'
import { embeddingService, type EmbeddingConfig } from './embedding-service'

/**
 * Decode a Float32 BLOB embedding. Returns null on empty/malformed buffer,
 * or when dim !== expectedDim (model change -> caller recomputes).
 */
function parseEmbedding(buf: Buffer | null, expectedDim: number): number[] | null {
  if (!buf || buf.length === 0) return null
  if (buf.length % 4 !== 0) return null
  const dim = buf.length / 4
  if (dim !== expectedDim) return null
  return Array.from(new Float32Array(buf.buffer, buf.byteOffset, dim))
}

export class GraphService {
  private db: Database.Database

  constructor() {
    const dataDir = join(app.getPath('userData'), 'rag-data')
    this.db = new Database(join(dataDir, 'app.db'))
    this.init()
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graph_entities (
        id TEXT PRIMARY KEY,
        kb_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'unknown',
        description TEXT DEFAULT '',
        community_id INTEGER,
        FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS graph_relations (
        id TEXT PRIMARY KEY,
        kb_id TEXT NOT NULL,
        source_entity_id TEXT NOT NULL,
        target_entity_id TEXT NOT NULL,
        description TEXT DEFAULT '',
        weight REAL DEFAULT 1.0,
        FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
        FOREIGN KEY (source_entity_id) REFERENCES graph_entities(id) ON DELETE CASCADE,
        FOREIGN KEY (target_entity_id) REFERENCES graph_entities(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS community_reports (
        id TEXT PRIMARY KEY,
        kb_id TEXT NOT NULL,
        community_id INTEGER NOT NULL,
        title TEXT DEFAULT '',
        summary TEXT DEFAULT '',
        entities TEXT DEFAULT '[]',
        relations TEXT DEFAULT '[]',
        FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_graph_entities_kb ON graph_entities(kb_id);
      CREATE INDEX IF NOT EXISTS idx_graph_relations_kb ON graph_relations(kb_id);
      CREATE INDEX IF NOT EXISTS idx_community_reports_kb ON community_reports(kb_id);
    `)

    const cols = this.db.prepare('PRAGMA table_info(graph_entities)').all() as Array<{ name: string }>
    if (!cols.some((c) => c.name === 'embedding')) {
      this.db.exec('ALTER TABLE graph_entities ADD COLUMN embedding BLOB')
    }
  }

  async build(
    kbId: string,
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<{ entityCount: number; relationCount: number }> {
    // Clear existing graph data for this KB
    this.db.prepare('DELETE FROM community_reports WHERE kb_id = ?').run(kbId)
    this.db.prepare('DELETE FROM graph_relations WHERE kb_id = ?').run(kbId)
    this.db.prepare('DELETE FROM graph_entities WHERE kb_id = ?').run(kbId)

    // Get all chunks for this KB
    const chunks = this.db
      .prepare(
        `SELECT c.id, c.content FROM chunks c
       JOIN documents d ON c.doc_id = d.id
       WHERE d.kb_id = ?`
      )
      .all(kbId) as { id: string; content: string }[]

    if (chunks.length === 0) return { entityCount: 0, relationCount: 0 }

    // Extract entities and relations using rule-based approach
    const { entities, relations } = this.extractEntitiesAndRelations(chunks)

    // Insert entities
    const insertEntity = this.db.prepare(
      'INSERT INTO graph_entities (id, kb_id, name, type, description) VALUES (?, ?, ?, ?, ?)'
    )
    for (const entity of entities) {
      insertEntity.run(entity.id, kbId, entity.name, entity.type, entity.description)
    }

    // Insert relations
    const insertRelation = this.db.prepare(
      'INSERT INTO graph_relations (id, kb_id, source_entity_id, target_entity_id, description, weight) VALUES (?, ?, ?, ?, ?, ?)'
    )
    for (const rel of relations) {
      insertRelation.run(rel.id, kbId, rel.source, rel.target, rel.description, rel.weight)
    }

    // Community detection using Leiden algorithm
    if (entities.length >= 3) {
      this.detectCommunities(kbId, entities, relations)
    }

    await this.embedEntities(kbId, entities, onProgress)

    return { entityCount: entities.length, relationCount: relations.length }
  }

  private extractEntitiesAndRelations(chunks: { id: string; content: string }[]): {
    entities: { id: string; name: string; type: string; description: string }[]
    relations: { id: string; source: string; target: string; description: string; weight: number }[]
  } {
    const entityMap = new Map<string, { id: string; name: string; type: string; description: string }>()
    const relations: { id: string; source: string; target: string; description: string; weight: number }[] = []

    // Structured patterns supplement jieba (which can't capture URLs/versions/dates by shape).
    // Acronym lower-bound is 3 chars to avoid noise like "I", "OK", "AI" polluting the graph.
    const patterns: { regex: RegExp; type: string }[] = [
      { regex: /\b(?:https?:\/\/[^\s]+)\b/g, type: 'url' },
      { regex: /\b[\w.-]+@[\w.-]+\.\w+\b/g, type: 'email' },
      { regex: /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g, type: 'date' },
      { regex: /\bv?\d+\.\d+(?:\.\d+)?\b/g, type: 'version' },
      { regex: /\b[A-Z]{3,8}\b/g, type: 'acronym' }
    ]

    // Higher priority overrides when the same name is detected by multiple sources
    // (e.g. "RAG" appears both as acronym and as jieba 'eng' → keep acronym).
    const typePriority: Record<string, number> = {
      url: 10,
      email: 10,
      person: 9,
      organization: 8,
      location: 8,
      'proper-noun': 7,
      date: 6,
      version: 6,
      acronym: 5,
      term: 4,
      concept: 3,
      unknown: 0
    }
    const prio = (t: string): number => typePriority[t] ?? 1

    const registerEntity = (rawName: string, type: string): string | null => {
      const name = rawName.trim()
      if (name.length < 2) return null
      const key = name.toLowerCase()
      const existing = entityMap.get(key)
      if (existing) {
        if (prio(type) > prio(existing.type)) {
          existing.type = type
        }
        return key
      }
      entityMap.set(key, {
        id: uuid(),
        name,
        type,
        description: `Found in document chunks`
      })
      return key
    }

    for (const chunk of chunks) {
      const foundInChunk: string[] = []

      // Structured patterns first; they own their byte-ranges so jieba doesn't
      // shred a URL/email into garbage tokens like "https", "com", "zhang".
      let residual = chunk.content
      for (const { regex, type } of patterns) {
        const matches = chunk.content.match(regex) || []
        for (const match of matches) {
          const key = registerEntity(match, type)
          if (key) foundInChunk.push(key)
        }
        residual = residual.replace(regex, ' ')
      }

      const extracted = extractEntities(residual, 15)
      for (const { name, type } of extracted) {
        const key = registerEntity(name, type)
        if (key) foundInChunk.push(key)
      }

      // Deduplicate within a chunk so a word appearing 5 times doesn't inflate edge weight 5x.
      const unique = Array.from(new Set(foundInChunk))
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const source = entityMap.get(unique[i])!
          const target = entityMap.get(unique[j])!
          const existingRel = relations.find(
            (r) =>
              (r.source === source.id && r.target === target.id) ||
              (r.source === target.id && r.target === source.id)
          )
          if (existingRel) {
            existingRel.weight += 0.5
          } else {
            relations.push({
              id: uuid(),
              source: source.id,
              target: target.id,
              description: 'co-occurrence',
              weight: 1.0
            })
          }
        }
      }
    }

    return { entities: [...entityMap.values()], relations }
  }

  private detectCommunities(
    kbId: string,
    entities: { id: string; name: string }[],
    relations: { source: string; target: string; weight: number }[]
  ): void {
    // Build graph for leiden-ts
    const entityIds = entities.map((e) => e.id)
    const idToIndex = new Map(entityIds.map((id, i) => [id, i]))

    const edges: [number, number, number][] = []
    for (const rel of relations) {
      const si = idToIndex.get(rel.source)
      const ti = idToIndex.get(rel.target)
      if (si !== undefined && ti !== undefined) {
        edges.push([si, ti, rel.weight])
      }
    }

    if (edges.length === 0) return

    const graph = Graph.fromEdgeList(entityIds.length, edges)
    const result = leiden(graph, { seed: 42, resolution: 1.0 })

    // Update entity community assignments
    const updateStmt = this.db.prepare(
      'UPDATE graph_entities SET community_id = ? WHERE id = ?'
    )
    for (let i = 0; i < entityIds.length; i++) {
      updateStmt.run(result.partition.assignments[i], entityIds[i])
    }

    // Generate community reports
    const communities = new Map<number, string[]>()
    for (let i = 0; i < entityIds.length; i++) {
      const cid = result.partition.assignments[i]
      if (!communities.has(cid)) communities.set(cid, [])
      communities.get(cid)!.push(entityIds[i])
    }

    const insertReport = this.db.prepare(
      'INSERT INTO community_reports (id, kb_id, community_id, title, summary, entities, relations) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )

    for (const [cid, memberIds] of communities) {
      if (memberIds.length < 2) continue
      const memberNames = memberIds
        .map((id) => entities.find((e) => e.id === id)?.name || '')
        .filter(Boolean)

      insertReport.run(
        uuid(),
        kbId,
        cid,
        `Community ${cid}: ${memberNames.slice(0, 3).join(', ')}${memberNames.length > 3 ? '...' : ''}`,
        `A group of ${memberNames.length} related concepts: ${memberNames.slice(0, 5).join(', ')}`,
        JSON.stringify(memberIds),
        JSON.stringify([])
      )
    }
  }

  private async embedEntities(
    kbId: string,
    entities: { id: string; name: string; description: string }[],
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<void> {
    if (entities.length === 0) return
    const config = this.getKbEmbeddingConfig(kbId)
    if (!config) return
    await this.embedAndPersistEntities(entities, config, onProgress)
  }

  /**
   * Incremental batched embedding: persist after EACH batch of 64, not
   * all-at-once at the end. A single embedBatch call on 3000+ entities
   * discards all progress if the user cancels or the API errors mid-way.
   */
  private async embedAndPersistEntities(
    items: Array<{ id: string; name: string; description: string }>,
    config: EmbeddingConfig,
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>()
    if (items.length === 0) return result

    const BATCH = 64
    const updateStmt = this.db.prepare('UPDATE graph_entities SET embedding = ? WHERE id = ?')
    const total = items.length
    onProgress?.(0, total, '正在向量化实体...')

    for (let start = 0; start < total; start += BATCH) {
      const slice = items.slice(start, start + BATCH)
      const texts = slice.map((e) => `${e.name}: ${e.description}`)
      const embeddings = await embeddingService.embedBatch(texts, config, undefined, 'passage')
      const persistBatch = this.db.transaction(() => {
        for (let i = 0; i < slice.length; i++) {
          const emb = embeddings[i]
          if (emb && emb.length > 0) {
            updateStmt.run(Buffer.from(new Float32Array(emb).buffer), slice[i].id)
            result.set(slice[i].id, emb)
          }
        }
      })
      persistBatch()
      const done = Math.min(start + BATCH, total)
      onProgress?.(done, total, `正在向量化实体 ${done}/${total}`)
    }
    return result
  }

  private getKbEmbeddingConfig(kbId: string): EmbeddingConfig | null {
    const row = this.db
      .prepare('SELECT embedding_api_url, embedding_api_key, embedding_model FROM knowledge_bases WHERE id = ?')
      .get(kbId) as
      | { embedding_api_url: string; embedding_api_key: string; embedding_model: string }
      | undefined
    if (!row) return null
    return {
      embeddingApiUrl: row.embedding_api_url,
      embeddingApiKey: row.embedding_api_key,
      embeddingModel: row.embedding_model
    }
  }

  async ensureEntityEmbeddings(
    kbId: string,
    config: EmbeddingConfig,
    expectedDim: number,
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<
    Array<{
      id: string
      name: string
      type: string
      description: string
      communityId: number | null
      embedding: number[] | null
    }>
  > {
    const rows = this.db
      .prepare(
        'SELECT id, name, type, description, community_id, embedding FROM graph_entities WHERE kb_id = ?'
      )
      .all(kbId) as Array<{
      id: string
      name: string
      type: string
      description: string
      community_id: number | null
      embedding: Buffer | null
    }>

    const parsed = rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      description: r.description,
      communityId: r.community_id,
      embedding: parseEmbedding(r.embedding, expectedDim)
    }))

    const missing = parsed.filter((e) => e.embedding === null)
    if (missing.length === 0) return parsed

    const embedded = await this.embedAndPersistEntities(missing, config, onProgress)
    for (const e of parsed) {
      const emb = embedded.get(e.id)
      if (emb) e.embedding = emb
    }
    return parsed
  }

  getEntities(kbId: string): GraphEntity[] {
    return (this.db
      .prepare('SELECT * FROM graph_entities WHERE kb_id = ?')
      .all(kbId) as any[]).map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      description: r.description,
      communityId: r.community_id
    }))
  }

  getRelations(kbId: string): GraphRelation[] {
    return (this.db
      .prepare('SELECT * FROM graph_relations WHERE kb_id = ?')
      .all(kbId) as any[]).map((r) => ({
      id: r.id,
      source: r.source_entity_id,
      target: r.target_entity_id,
      description: r.description,
      weight: r.weight
    }))
  }

  getCommunities(kbId: string): CommunityReport[] {
    return (this.db
      .prepare('SELECT * FROM community_reports WHERE kb_id = ?')
      .all(kbId) as any[]).map((r) => ({
      communityId: r.community_id,
      title: r.title,
      summary: r.summary,
      entities: JSON.parse(r.entities),
      relations: JSON.parse(r.relations)
    }))
  }

  getStatus(kbId: string): { built: boolean; entityCount: number; relationCount: number } {
    const entityCount = (
      this.db.prepare('SELECT COUNT(*) as count FROM graph_entities WHERE kb_id = ?').get(kbId) as any
    ).count
    const relationCount = (
      this.db.prepare('SELECT COUNT(*) as count FROM graph_relations WHERE kb_id = ?').get(kbId) as any
    ).count
    return {
      built: entityCount > 0,
      entityCount,
      relationCount
    }
  }
}

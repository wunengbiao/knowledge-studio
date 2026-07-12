import { net } from 'electron'

export interface EmbeddingConfig {
  embeddingApiUrl: string
  embeddingApiKey: string
  embeddingModel: string
}

interface EmbeddingResponse {
  data: { embedding: number[] }[]
}

const DEFAULT_MODEL = 'text-embedding-3-small'
const BATCH_SIZE = 64

/** Models that require an instruction prefix ("query: " / "passage: ") to perform
 *  optimally. OpenAI text-embedding-3, Mistral-embed, and Cohere embed-v3 do NOT.
 *  BGE / E5 / GTE / Jina-v3 / Qwen-embed families all require the prefix. */
const PREFIX_REQUIRED = /(?:^|[-_/.])(bge|e5|gte|jina-embeddings-v3|qwen)|(?:multilingual-e5)/i

function getInstructionPrefix(model: string, kind: 'query' | 'passage'): string {
  if (!model) return ''
  return PREFIX_REQUIRED.test(model) ? (kind === 'query' ? 'query: ' : 'passage: ') : ''
}

function applyPrefix(text: string, model: string, kind: 'query' | 'passage'): string {
  const prefix = getInstructionPrefix(model, kind)
  return prefix ? `${prefix}${text}` : text
}

/** Normalize a vector to unit length so L2 distance ranks equivalently to cosine
 *  distance. Most modern embedding models already return near-unit vectors, but
 *  normalizing guarantees cosine-correct ranking regardless of model output. */
function normalize(vec: number[]): number[] {
  let norm = 0
  for (const v of vec) norm += v * v
  norm = Math.sqrt(norm)
  if (norm < 1e-12) return vec
  const inv = 1 / norm
  const out = new Array<number>(vec.length)
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] * inv
  return out
}

export class EmbeddingService {
  async embed(
    text: string,
    config: EmbeddingConfig,
    kind: 'query' | 'passage' = 'passage'
  ): Promise<number[] | null> {
    if (!config.embeddingApiUrl || !config.embeddingApiKey) return null

    const url = config.embeddingApiUrl
    const model = config.embeddingModel || DEFAULT_MODEL
    const input = applyPrefix(text, model, kind)

    if (url.includes('generativelanguage.googleapis.com')) {
      const response = await net.fetch(`${url}?key=${config.embeddingApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text: input }] } })
      })
      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Gemini API 错误 (${response.status}): ${errText}`)
      }
      const data = await response.json()
      const emb = data?.embedding?.values || null
      return emb ? normalize(emb) : null
    }

    if (url.includes('ollama') || url.includes(':11434')) {
      const response = await net.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input })
      })
      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Ollama API 错误 (${response.status}): ${errText}`)
      }
      const data = await response.json()
      // Newer Ollama returns { embeddings: [[...]] }; older returns { embedding: [...] }
      const emb = data?.embeddings?.[0] || data?.embedding || null
      return emb ? normalize(emb) : null
    }

    const response = await net.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.embeddingApiKey}`
      },
      body: JSON.stringify({ model, input })
    })
    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Embedding API 错误 (${response.status}): ${errText}`)
    }
    const data = (await response.json()) as EmbeddingResponse
    const emb = data.data?.[0]?.embedding || null
    return emb ? normalize(emb) : null
  }

  async embedBatch(
    texts: string[],
    config: EmbeddingConfig,
    onProgress?: (current: number, total: number) => void,
    kind: 'query' | 'passage' = 'passage'
  ): Promise<number[][]> {
    if (!config.embeddingApiUrl || !config.embeddingApiKey) return []

    const url = config.embeddingApiUrl
    const model = config.embeddingModel || DEFAULT_MODEL
    const total = texts.length
    onProgress?.(0, total)

    if (url.includes('generativelanguage.googleapis.com')) {
      const results: number[][] = []
      for (let i = 0; i < texts.length; i++) {
        const emb = await this.embed(texts[i], config, kind)
        results.push(emb || [])
        onProgress?.(i + 1, total)
      }
      return results
    }

    if (url.includes('ollama') || url.includes(':11434')) {
      const results: number[][] = []
      for (let i = 0; i < texts.length; i++) {
        const input = applyPrefix(texts[i], model, kind)
        const response = await net.fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, input })
        })
        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`Ollama API 错误 (${response.status}): ${errText}`)
        }
        const data = await response.json()
        const emb = data?.embeddings?.[0] || data?.embedding || []
        results.push(emb ? normalize(emb) : emb)
        onProgress?.(i + 1, total)
      }
      return results
    }

    const results: number[][] = []
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const batch = texts.slice(start, start + BATCH_SIZE).map((t) => applyPrefix(t, model, kind))
      const response = await net.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.embeddingApiKey}`
        },
        body: JSON.stringify({ model, input: batch })
      })
      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Embedding API 错误 (${response.status}): ${errText}`)
      }
      const data = (await response.json()) as EmbeddingResponse
      const embeddings = (data.data?.map((d) => d.embedding) || []).map((e) => normalize(e))
      results.push(...embeddings)
      onProgress?.(Math.min(start + batch.length, total), total)
    }
    return results
  }

  async test(config: EmbeddingConfig): Promise<void> {
    const result = await this.embed('Hello, this is a test.', config, 'passage')
    if (!result || result.length === 0) {
      throw new Error('Embedding API 返回空结果')
    }
  }
}

export const embeddingService = new EmbeddingService()

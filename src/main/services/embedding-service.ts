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

export class EmbeddingService {
  async embed(text: string, config: EmbeddingConfig): Promise<number[] | null> {
    if (!config.embeddingApiUrl || !config.embeddingApiKey) return null

    const url = config.embeddingApiUrl
    const model = config.embeddingModel || DEFAULT_MODEL

    if (url.includes('generativelanguage.googleapis.com')) {
      const response = await net.fetch(`${url}?key=${config.embeddingApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text }] } })
      })
      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Gemini API 错误 (${response.status}): ${errText}`)
      }
      const data = await response.json()
      return data?.embedding?.values || null
    }

    if (url.includes('ollama') || url.includes(':11434')) {
      const response = await net.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: text })
      })
      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Ollama API 错误 (${response.status}): ${errText}`)
      }
      const data = await response.json()
      // Newer Ollama returns { embeddings: [[...]] }; older returns { embedding: [...] }
      return data?.embeddings?.[0] || data?.embedding || null
    }

    const response = await net.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.embeddingApiKey}`
      },
      body: JSON.stringify({ model, input: text })
    })
    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Embedding API 错误 (${response.status}): ${errText}`)
    }
    const data = (await response.json()) as EmbeddingResponse
    return data.data?.[0]?.embedding || null
  }

  async embedBatch(
    texts: string[],
    config: EmbeddingConfig,
    onProgress?: (current: number, total: number) => void
  ): Promise<number[][]> {
    if (!config.embeddingApiUrl || !config.embeddingApiKey) return []

    const url = config.embeddingApiUrl
    const model = config.embeddingModel || DEFAULT_MODEL
    const total = texts.length
    onProgress?.(0, total)

    if (url.includes('generativelanguage.googleapis.com')) {
      const results: number[][] = []
      for (let i = 0; i < texts.length; i++) {
        const emb = await this.embed(texts[i], config)
        results.push(emb || [])
        onProgress?.(i + 1, total)
      }
      return results
    }

    if (url.includes('ollama') || url.includes(':11434')) {
      const results: number[][] = []
      for (let i = 0; i < texts.length; i++) {
        const response = await net.fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, input: texts[i] })
        })
        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`Ollama API 错误 (${response.status}): ${errText}`)
        }
        const data = await response.json()
        results.push(data?.embeddings?.[0] || data?.embedding || [])
        onProgress?.(i + 1, total)
      }
      return results
    }

    const results: number[][] = []
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const batch = texts.slice(start, start + BATCH_SIZE)
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
      const embeddings = data.data?.map((d) => d.embedding) || []
      results.push(...embeddings)
      onProgress?.(Math.min(start + batch.length, total), total)
    }
    return results
  }

  async test(config: EmbeddingConfig): Promise<void> {
    const result = await this.embed('Hello, this is a test.', config)
    if (!result || result.length === 0) {
      throw new Error('Embedding API 返回空结果')
    }
  }
}

export const embeddingService = new EmbeddingService()

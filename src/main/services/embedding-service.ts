import { net } from 'electron'
import { ollamaPost } from './ollama-fetch'

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

/** Returns true if the given URL points to an Ollama instance. Ollama needs no
 *  API key (auth-free), so guards along the embedding path use this to bypass
 *  the apiKey-required check. Heuristic: matches "ollama" in the host or the
 *  default ":11434" port. Same pattern as `testLlm` in search-service.ts. */
export function isOllamaUrl(url: string): boolean {
  return url.includes('ollama') || url.includes(':11434')
}

/** Rewrites an Ollama URL's path to the correct native endpoint (`/api/embed`
 *  for embedding, `/api/chat` for chat). KBs created with a *custom* provider
 *  whose host happens to point at Ollama (e.g. `http://192.168.1.2:11434`)
 *  get the OpenAI-style path `/embeddings` from `resolveCapabilityUrl`,
 *  which is not a valid Ollama endpoint. Normalizing at runtime fixes those
 *  existing KBs without requiring the user to re-save their settings. */
export function normalizeOllamaUrl(url: string, capability: 'chat' | 'embedding'): string {
  try {
    const u = new URL(url)
    const path = capability === 'chat' ? '/api/chat' : '/api/embed'
    return `${u.origin}${path}`
  } catch {
    return url
  }
}

/** True if `url` points at a LAN/private host subject to macOS Local Network
 *  Privacy (RFC1918 ranges, link-local, .local). Loopback (127.0.0.1/::1) is
 *  excluded - it is exempt from LNP, so failures there mean the service is not
 *  running, not a privacy block. */
function isLanAddress(url: string): boolean {
  try {
    const host = new URL(url).hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false
    return (
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host) ||
      host.endsWith('.local')
    )
  } catch {
    return false
  }
}

/** Formats a network error with a helpful Chinese message. Detects common errno
 *  codes (EHOSTUNREACH, ECONNREFUSED, etc.) from the error's `cause` field
 *  (undici wraps the actual socket error in `cause`) and returns actionable
 *  guidance. Without this, users see opaque "fetch failed" messages. */
export function formatNetworkError(error: unknown, url: string): string {
  const cause = (error as { cause?: { code?: string; address?: string; port?: number } })?.cause
  const code = cause?.code
  const target = cause?.address ? `${cause.address}:${cause.port ?? ''}` : url
  if (code === 'EHOSTUNREACH') {
    return `无法连接到主机 (EHOSTUNREACH): ${target}\n可能原因：\n1) 目标地址不可达 - 在终端验证: curl ${url}\n2) macOS 本地网络隐私限制 - 系统设置 > 隐私与安全性 > 本地网络，允许本应用访问\n3) 网络路由问题 - 检查两台机器是否在同一网络`
  }
  if (code === 'ECONNREFUSED') {
    return `连接被拒绝 (ECONNREFUSED): ${target}\n请检查 Ollama 服务是否正在运行`
  }
  if (code === 'ENOTFOUND') {
    return `无法解析主机名 (ENOTFOUND): ${url}\n请检查 URL 是否正确`
  }
  if (code === 'ETIMEDOUT') {
    return `连接超时 (ETIMEDOUT): ${target}\n请检查网络连接或防火墙设置`
  }
  // Raw net.fetch failure on a LAN address with no errno: Electron's net.fetch
  // surfaces macOS Local Network Privacy blocks as a plain TypeError ("Failed
  // to fetch") without an errno cause, so the branches above don't catch it.
  // Surface the same Local Network guidance - the first net.fetch attempt has
  // already triggered the system permission prompt, so point the user there.
  if (error instanceof TypeError && isLanAddress(url)) {
    return `无法连接到局域网主机: ${url}\n可能原因：\n1) macOS 本地网络隐私限制 - 系统设置 > 隐私与安全性 > 本地网络，允许本应用访问（首次连接会弹授权框，点"允许"后重试）\n2) 目标主机未运行或不可达 - 在终端验证: curl ${url}\n3) 网络路由问题 - 检查两台机器是否在同一网络`
  }
  return `网络请求失败: ${error instanceof Error ? error.message : String(error)}`
}

export class EmbeddingService {
  async embed(
    text: string,
    config: EmbeddingConfig,
    kind: 'query' | 'passage' = 'passage'
  ): Promise<number[] | null> {
    const url = config.embeddingApiUrl
    if (!url || (!isOllamaUrl(url) && !config.embeddingApiKey)) return null

    const model = config.embeddingModel || DEFAULT_MODEL
    const input = applyPrefix(text, model, kind)

    console.log('[embed:debug] request', {
      url,
      model,
      inputLength: input.length,
      isOllama: isOllamaUrl(url),
      isGemini: url.includes('generativelanguage.googleapis.com'),
      bodyPreview: { model, input: input.slice(0, 80) }
    })

    try {
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

      if (isOllamaUrl(url)) {
        const ollamaUrl = normalizeOllamaUrl(url, 'embedding')
        // ollamaPost prefers net.fetch (triggers the macOS Local Network Privacy
        // prompt on first use) and falls back to curl; see ollama-fetch.ts.
        const data = await ollamaPost<{ embeddings?: number[][]; embedding?: number[] }>(
          ollamaUrl,
          { model, input }
        )
        // Newer Ollama returns { embeddings: [[...]] }; older returns { embedding: [...] }
        const emb = data.embeddings?.[0] || data.embedding || null
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
    } catch (e) {
      console.error('[embed:debug] error', {
        url,
        fetchUrl: isOllamaUrl(url) ? normalizeOllamaUrl(url, 'embedding') : url,
        model,
        errorName: e instanceof Error ? e.name : typeof e,
        errorMessage: e instanceof Error ? e.message : String(e),
        errorStack: e instanceof Error ? e.stack : undefined
      })
      throw new Error(formatNetworkError(e, url))
    }
  }

  async embedBatch(
    texts: string[],
    config: EmbeddingConfig,
    onProgress?: (current: number, total: number) => void,
    kind: 'query' | 'passage' = 'passage'
  ): Promise<number[][]> {
    const url = config.embeddingApiUrl
    if (!url || (!isOllamaUrl(url) && !config.embeddingApiKey)) return []

    const model = config.embeddingModel || DEFAULT_MODEL
    const total = texts.length
    onProgress?.(0, total)

    console.log('[embedBatch:debug] request', {
      url,
      model,
      total,
      isOllama: isOllamaUrl(url),
      isGemini: url.includes('generativelanguage.googleapis.com'),
      bodyFormat: isOllamaUrl(url)
        ? '{model, input} (per-item, string)'
        : url.includes('generativelanguage.googleapis.com')
          ? 'delegates to embed()'
          : '{model, input: batch} (array)'
    })

    try {
      if (url.includes('generativelanguage.googleapis.com')) {
        const results: number[][] = []
        for (let i = 0; i < texts.length; i++) {
          const emb = await this.embed(texts[i], config, kind)
          results.push(emb || [])
          onProgress?.(i + 1, total)
        }
        return results
      }

      if (isOllamaUrl(url)) {
        const ollamaUrl = normalizeOllamaUrl(url, 'embedding')
        const results: number[][] = []
        for (let i = 0; i < texts.length; i++) {
          const input = applyPrefix(texts[i], model, kind)
          // ollamaPost prefers net.fetch (triggers the LNP prompt), curl fallback.
          const data = await ollamaPost<{ embeddings?: number[][]; embedding?: number[] }>(
            ollamaUrl,
            { model, input }
          )
          const emb = data.embeddings?.[0] || data.embedding || []
          results.push(emb.length ? normalize(emb) : emb)
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
    } catch (e) {
      console.error('[embedBatch:debug] error', {
        url,
        fetchUrl: isOllamaUrl(url) ? normalizeOllamaUrl(url, 'embedding') : url,
        model,
        total,
        errorName: e instanceof Error ? e.name : typeof e,
        errorMessage: e instanceof Error ? e.message : String(e),
        errorStack: e instanceof Error ? e.stack : undefined
      })
      throw new Error(formatNetworkError(e, url))
    }
  }

  async test(config: EmbeddingConfig): Promise<void> {
    const result = await this.embed('Hello, this is a test.', config, 'passage')
    if (!result || result.length === 0) {
      throw new Error('Embedding API 返回空结果')
    }
  }
}

export const embeddingService = new EmbeddingService()

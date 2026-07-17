import { execFile, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'
import { net } from 'electron'

const execFileAsync = promisify(execFile)

/** Ollama (LAN) request helpers.
 *
 *  macOS Local Network Privacy (LNP) blocks apps from reaching LAN hosts
 *  (e.g. 192.168.x.x) until the user grants access in System Settings >
 *  Privacy & Security > Local Network. On macOS 26+ the restriction also
 *  applies to child processes the app spawns, so routing Ollama through
 *  `curl` does NOT bypass it - and unlike net.fetch, curl does not trigger
 *  the permission prompt, so a curl-only path can leave the user unable to
 *  ever grant access (the connection just fails with no dialog).
 *
 *  Strategy: prefer Electron's `net.fetch` (Chromium network stack). It
 *  triggers the native LNP prompt on first use; once the user clicks Allow,
 *  net.fetch works and curl is unnecessary. curl is kept only as a fallback
 *  for raw connection failures - on macOS 26+ without permission curl fails
 *  too (same restriction), but the net.fetch attempt has already surfaced
 *  the prompt so the user can grant access and retry.
 *
 *  Cloud providers (DeepSeek, NVIDIA, etc.) are NOT LAN-affected and use
 *  net.fetch directly in their respective services. */

export interface OllamaStreamChunk {
  model?: string
  created_at?: string
  message?: {
    role?: string
    content?: string
    thinking?: string
    tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>
  }
  done?: boolean
  done_reason?: string
}

/** Make a non-streaming POST to an Ollama endpoint, preferring net.fetch and
 *  falling back to curl for raw connection failures. Returns parsed JSON.
 *  Used for embedding requests (POST /api/embed). See the module header for
 *  why net.fetch is preferred (it triggers the macOS Local Network Privacy
 *  prompt) and curl is only a fallback. */
export async function ollamaPost<T = unknown>(
  url: string,
  body: unknown,
  timeoutMs = 120000
): Promise<T> {
  let fetchError: unknown
  try {
    return await ollamaNetFetchPost<T>(url, body, timeoutMs)
  } catch (e) {
    // Propagate HTTP errors, non-JSON responses, and timeouts directly - curl
    // would hit the same server state and only double the wait. Only raw
    // connection failures (TypeError from net.fetch) fall back to curl.
    if (!(e instanceof TypeError)) throw e
    fetchError = e
  }
  // Raw net.fetch failure (e.g. LNP block before permission granted, or host
  // down). Try curl; if curl also fails, throw the ORIGINAL net.fetch error -
  // it carries the errno (EHOSTUNREACH etc.) that formatNetworkError maps to
  // actionable Local Network guidance, whereas curl's "Failed to connect after
  // 2ms" is opaque.
  try {
    return await ollamaCurlPost<T>(url, body, timeoutMs)
  } catch {
    throw fetchError
  }
}

/** net.fetch implementation of the Ollama POST. Throws TypeError on raw
 *  connection failures (caught by ollamaPost for the curl fallback); throws
 *  Error for HTTP non-ok and non-JSON responses (propagated directly). */
async function ollamaNetFetchPost<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await net.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Ollama API 错误 (${response.status}): ${text.slice(0, 200)}`)
    }
    const text = await response.text()
    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error(`Ollama 返回非 JSON 响应: ${text.slice(0, 200)}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

/** curl-based fallback for ollamaPost. Kept for environments where net.fetch
 *  is blocked for non-LNP reasons; on macOS 26+ without Local Network
 *  permission this also fails (same restriction), but ollamaPost has already
 *  surfaced the permission prompt via the net.fetch attempt. */
export async function ollamaCurlPost<T = unknown>(
  url: string,
  body: unknown,
  timeoutMs = 120000
): Promise<T> {
  const { stdout, stderr } = await execFileAsync(
    'curl',
    [
      '-s',
      '-S',
      '-X',
      'POST',
      url,
      '-H',
      'Content-Type: application/json',
      '-d',
      JSON.stringify(body),
      '--max-time',
      String(Math.ceil(timeoutMs / 1000)),
      '--connect-timeout',
      '15'
    ],
    { maxBuffer: 200 * 1024 * 1024 }
  )

  if (!stdout && stderr) {
    throw new Error(`curl 请求失败: ${stderr.trim()}`)
  }

  try {
    return JSON.parse(stdout) as T
  } catch {
    throw new Error(`Ollama 返回非 JSON 响应: ${stdout.slice(0, 200)}`)
  }
}

/** Make a streaming POST request to Ollama via curl. Yields parsed NDJSON
 *  chunks one at a time. Used for chat streaming (POST /api/chat with
 *  stream:true). The final chunk has `done:true`. */
export async function* ollamaCurlStream(
  url: string,
  body: unknown,
  signal?: AbortSignal
): AsyncGenerator<OllamaStreamChunk> {
  const child = spawn(
    'curl',
    [
      '-s',
      '-N',
      '-X',
      'POST',
      url,
      '-H',
      'Content-Type: application/json',
      '-d',
      JSON.stringify(body),
      '--connect-timeout',
      '15',
      '--max-time',
      '600'
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )

  const errChunks: Buffer[] = []
  child.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk))

  let aborted = false
  const onAbort = () => {
    aborted = true
    child.kill('SIGTERM')
  }
  if (signal) {
    if (signal.aborted) {
      child.kill('SIGTERM')
      return
    }
    signal.addEventListener('abort', onAbort)
  }

  let exitCode: number | null = null
  child.on('close', (code) => {
    exitCode = code
  })

  try {
    if (!child.stdout) {
      throw new Error('curl stdout 为 null')
    }
    const rl = createInterface({ input: child.stdout })
    for await (const line of rl) {
      if (aborted) break
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        yield JSON.parse(trimmed) as OllamaStreamChunk
      } catch {
        // Skip malformed lines (partial NDJSON)
      }
    }

    // Wait for curl to fully exit so we can check the exit code
    if (exitCode === null) {
      await new Promise<void>((resolve) => {
        child.once('close', () => resolve())
      })
    }

    if (exitCode !== 0 && exitCode !== null && !aborted) {
      const errText = Buffer.concat(errChunks).toString('utf8').trim()
      throw new Error(`curl 退出码 ${exitCode}: ${errText || '未知错误'}`)
    }
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onAbort)
    }
    child.kill('SIGTERM')
  }
}

import type { Message } from '@shared/types'

const MAX_HISTORY_TURNS = 6
const MAX_HISTORY_CHARS = 2000

/**
 * Parses the LLM judge response into a boolean. Defaults to `true` when the
 * response cannot be confidently interpreted as `false`, so the safe fallback
 * preserves the existing "always retrieve" behavior.
 */
export function parseNeedsKb(content: string): boolean {
  if (!content) return true

  const match = content.match(/\{[^}]*\}/)
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { needs_kb?: unknown }
      if (typeof parsed.needs_kb === 'boolean') return parsed.needs_kb
      if (typeof parsed.needs_kb === 'string') {
        const lower = parsed.needs_kb.trim().toLowerCase()
        if (lower === 'true') return true
        if (lower === 'false') return false
      }
    } catch {
      // fall through to keyword fallback
    }
  }

  const lower = content.toLowerCase()
  if (lower.includes('"needs_kb": false') || lower.includes('needs_kb=false')) {
    return false
  }
  if (lower.includes('"needs_kb": true') || lower.includes('needs_kb=true')) {
    return true
  }

  // Lenient match for malformed JSON like `{needs_kb: false}` (unquoted keys).
  const valueMatch = content.match(/needs_kb["']?\s*[:=]\s*["']?(true|false)/i)
  if (valueMatch) {
    return valueMatch[1].toLowerCase() === 'true'
  }

  // Ambiguous response → safe default
  return true
}

/**
 * Returns the most recent non-empty history turns, trimmed to keep the judge
 * prompt small. Pure function (no I/O) so it can be unit-tested.
 */
export function trimHistory(history: readonly Message[]): Message[] {
  const recent = history.slice(-MAX_HISTORY_TURNS)
  let total = 0
  const result: Message[] = []
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i]
    if (!msg.content.trim()) continue
    total += msg.content.length
    if (total > MAX_HISTORY_CHARS) break
    result.unshift(msg)
  }
  return result
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}...`
}

export function formatHistory(history: readonly Message[]): string {
  return history
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${truncate(m.content, 400)}`)
    .join('\n\n')
}

import type { Message } from '@shared/types'

// Conservative follow-up instruction keywords (zh/en/ja).
// Hit any one + short message + has assistant history → skip retrieval.
// Intentionally narrow: false negatives fall through to the LLM judge;
// false positives would silently skip needed retrieval.
const FOLLOW_UP_KEYWORDS = [
  // 可视化 / 格式化
  'mermaid',
  '流程图',
  '画图',
  '画个图',
  '画一下',
  '画出来',
  '图示',
  '用图表示',
  'draw',
  'diagram',
  'flowchart',
  '用表格',
  '表格展示',
  'as a table',
  'in a table',
  // 改写
  '翻译',
  'translate',
  '重写',
  'rewrite',
  'rephrase',
  '换种说法',
  '换个说法',
  '换个方式',
  '总结',
  '概括',
  'summarize',
  'summary',
  '要約',
  'まとめ',
  // 上文引用（带操作词，避免"上面的文件"这种歧义）
  '把上面',
  '把上文',
  '把前面',
  '把刚才',
  '对上面',
  '对上文',
  // 扩展 / 简化
  '再详细',
  '更详细',
  '再具体',
  '简化',
  '精简',
  'simplify',
  '继续',
  '接着',
  'elaborate'
] as const

const MAX_FOLLOWUP_MESSAGE_LENGTH = 50

// Anchored ^...$ so "你好，请问X是什么" does NOT match (would wrongly skip retrieval)
const CHITCHAT_GREETING_REGEX =
  /^(你好|您好|hi|hello|hey|早上好|下午好|晚上好|谢谢|感谢|多谢|thanks|thank you|再见|拜拜|bye|goodbye)[!！.。?？~～]*$/i
const CHITCHAT_META_REGEX =
  /^(你是谁|你叫什么|你叫什么名字|你能做什么|你是什么|你会什么|who are you|what are you|what can you do)/i
const MAX_CHITCHAT_LENGTH = 20

/**
 * Quick rule-based pre-filter. Returns `true` only when the message is a
 * high-confidence follow-up instruction (short + keyword hit + has assistant
 * history). Returning `false` here means "not sure, defer to the LLM judge".
 */
export function isFollowUpInstruction(message: string, history: readonly Message[]): boolean {
  const trimmed = message.trim()
  if (!trimmed) return false
  if (trimmed.length > MAX_FOLLOWUP_MESSAGE_LENGTH) return false

  const hasAssistantHistory = history.some(
    (m) => m.role === 'assistant' && m.content.trim().length > 0
  )
  if (!hasAssistantHistory) return false

  const lower = trimmed.toLowerCase()
  return FOLLOW_UP_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))
}

export function looksLikeChitchat(message: string): boolean {
  const trimmed = message.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_CHITCHAT_LENGTH) return false
  if (CHITCHAT_GREETING_REGEX.test(trimmed)) return true
  if (CHITCHAT_META_REGEX.test(trimmed)) return true
  return false
}

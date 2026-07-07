import type { Message } from '@shared/types'
import { net } from 'electron'
import { formatHistory, parseNeedsKb, trimHistory } from './retrieval-judge-parser'
import { isFollowUpInstruction, looksLikeChitchat } from './retrieval-judge-rules'

export interface RetrievalJudgeEndpoint {
  apiUrl: string
  apiKey: string
  model: string
}

export interface KbSummary {
  name: string
  description: string
}

export interface RetrievalJudgeContext {
  endpoint: RetrievalJudgeEndpoint
  history: readonly Message[]
  userMessage: string
  kbSummaries: readonly KbSummary[]
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[]
}

const JUDGE_SYSTEM_PROMPT = `你是一个检索判断器，决定是否需要从知识库检索资料来回答用户最新的消息。

判断规则：
- 用户消息是新的事实性问题、需要查阅资料、或明确要求"查询/检索/搜索知识库" → 需要
- 用户消息是对上一轮回答的后续指令（例如：换种格式展示、画图、翻译、总结上文、继续、再详细一点、用 mermaid 画出来、重写）→ 不需要
- 用户消息是闲聊、问候、或与知识库无关的通用问题（例如：你是谁、你好、谢谢）→ 不需要
- 如果不确定，返回 需要

只返回严格 JSON：{"needs_kb": true} 或 {"needs_kb": false}，不要输出任何其它内容。`

const REQUEST_TIMEOUT_MS = 15000

/**
 * Decides whether the latest user message requires knowledge-base retrieval.
 *
 * Returns `true` on any error or when the endpoint is not configured, so that
 * the safe fallback preserves the existing "always retrieve" behavior.
 */
export async function shouldRetrieveKnowledge(ctx: RetrievalJudgeContext): Promise<boolean> {
  const { endpoint, history, userMessage, kbSummaries } = ctx

  if (!endpoint.apiUrl || !endpoint.apiKey || !userMessage.trim()) return true

  if (isFollowUpInstruction(userMessage, history)) {
    console.log('[retrieval-judge] 规则预筛命中后续指令，跳过检索')
    return false
  }

  const historyText = formatHistory(trimHistory(history))

  const kbList =
    kbSummaries.length > 0
      ? kbSummaries
          .map((kb) => `- ${kb.name}${kb.description ? `：${kb.description}` : ''}`)
          .join('\n')
      : '（未指定知识库）'

  const userContent = `## 知识库
${kbList}

## 对话历史
${historyText || '（无）'}

## 用户最新消息
${userMessage}

请返回 JSON：{"needs_kb": true} 或 {"needs_kb": false}`

  try {
    const response = await net.fetch(endpoint.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${endpoint.apiKey}`
      },
      body: JSON.stringify({
        model: endpoint.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: JUDGE_SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ],
        temperature: 0,
        max_tokens: 50,
        stream: false
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.warn(
        `[retrieval-judge] LLM 返回 HTTP ${response.status}: ${text.slice(0, 200)}，默认检索`
      )
      return true
    }

    const data = (await response.json()) as ChatCompletionResponse
    const content = data.choices?.[0]?.message?.content ?? ''
    const needsKb = parseNeedsKb(content)
    if (!needsKb && !looksLikeChitchat(userMessage)) {
      console.log('[retrieval-judge] LLM 判断不需要但消息非闲聊，保守检索')
      return true
    }
    return needsKb
  } catch (e) {
    console.warn('[retrieval-judge] 判断失败，默认检索:', e)
    return true
  }
}

import type { ActiveModelRef, SearchResult } from '@shared/types'
import type { SearchService } from './search-service'

export const KNOWLEDGE_SEARCH_TOOL_NAME = 'knowledge_search'

export const knowledgeSearchToolSchema = {
  type: 'function' as const,
  function: {
    name: KNOWLEDGE_SEARCH_TOOL_NAME,
    description: [
      '在当前对话绑定的知识库中检索相关资料。',
      '调用时机：用户提出事实性问题、需要查阅资料、或明确要求"查询/检索/搜索知识库"时调用。',
      '不调用：闲聊、问候、格式化指令（翻译、总结、换种方式展示、画图）、对上文的操作指令、与知识库无关的通用问题。'
    ].join(''),
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '检索查询词，应为能体现用户信息需求的关键词或自然语言问句。不要直接复制用户原话，必要时提炼核心概念。'
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  }
}

export interface KnowledgeSearchHit {
  results: SearchResult[]
  formattedContext: string
}

export async function executeKnowledgeSearch(params: {
  searchService: SearchService
  kbIds: readonly string[]
  query: string
  topK: number
  rerankModelRef?: ActiveModelRef | null
}): Promise<KnowledgeSearchHit> {
  const { searchService, kbIds, query, topK, rerankModelRef } = params
  if (kbIds.length === 0 || !query.trim()) {
    return { results: [], formattedContext: '未检索到相关资料。' }
  }

  const perKb = Math.max(2, Math.ceil(topK / kbIds.length))
  const collected: SearchResult[] = []
  for (const kbId of kbIds) {
    try {
      const results = await searchService.search(kbId, query, 'hybrid', perKb, undefined, rerankModelRef)
      collected.push(...results)
    } catch (e) {
      console.error('[builtin-tools:knowledge_search] 检索失败 kbId=', kbId, e)
    }
  }
  collected.sort((a, b) => b.score - a.score)
  const results = collected.slice(0, topK)

  if (results.length === 0) {
    return { results: [], formattedContext: '未检索到相关资料。' }
  }

  const formattedContext = results
    .map((hit, index) => {
      const source = hit.docTitle || hit.docId
      return `[${index + 1}] 来源：${source}\n${hit.content}`
    })
    .join('\n\n---\n\n')

  return { results, formattedContext }
}

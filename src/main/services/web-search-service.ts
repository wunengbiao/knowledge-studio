import { net } from 'electron'

/**
 * Web search service (built-in, no API key required).
 *
 * Uses Bing's HTML search endpoint (`cn.bing.com`), which returns a static
 * HTML page with organic results that can be parsed without an API key.
 * Bing is used instead of DuckDuckGo because `html.duckduckgo.com` is
 * unreachable in mainland China (connection reset), whereas `cn.bing.com`
 * works in both mainland China and internationally.
 *
 * For production-grade search, consider adding a keyed provider
 * (Tavily / Exa / SearXNG) similar to cherry-studio's WebSearchService.
 */

export interface WebSearchResult {
  title: string
  url: string
  content: string
}

export interface WebSearchHit {
  results: WebSearchResult[]
  formattedContext: string
}

const BING_ENDPOINT = 'https://cn.bing.com/search'
const MAX_RESULTS = 5
const REQUEST_TIMEOUT_MS = 15000

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
} as const

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

/**
 * Parse Bing HTML result page. Each organic result is a `<li class="b_algo">`
 * block containing:
 *   <h2><a href="URL">Title</a></h2>
 *   <p class="b_lineclamp...">Snippet…</p>   (inside a .b_caption wrapper)
 * We extract title/url from the h2 anchor and the first paragraph as snippet.
 */
function parseBingResults(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = []

  const blockRegex = /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi
  const titleRegex = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
  const snippetRegex = /<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i
  const fallbackSnippetRegex =
    /<div[^>]*class="[^"]*b_caption[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i

  let block: RegExpExecArray | null = blockRegex.exec(html)
  while (block !== null && results.length < MAX_RESULTS) {
    const body = block[1]
    const tm = titleRegex.exec(body)
    if (!tm) {
      block = blockRegex.exec(html)
      continue
    }
    const url = tm[1]
    const title = stripHtml(tm[2])
    if (!title || !url) {
      block = blockRegex.exec(html)
      continue
    }
    const sm = snippetRegex.exec(body) || fallbackSnippetRegex.exec(body)
    const content = sm ? stripHtml(sm[1]) : ''
    results.push({ title, url, content })
    block = blockRegex.exec(html)
  }

  return results
}

/**
 * Search the web for the given query. Returns up to {@link MAX_RESULTS} results.
 * Never throws - on any failure (network, parse, timeout) returns an empty array
 * so the chat flow degrades gracefully to "no web results".
 */
export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const url = `${BING_ENDPOINT}?q=${encodeURIComponent(trimmed)}&setlang=zh-CN`

  try {
    const response = await net.fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: BROWSER_HEADERS,
      redirect: 'follow'
    })

    if (!response.ok) {
      console.error('[web-search-service] Bing HTTP', response.status)
      return []
    }

    const html = await response.text()
    return parseBingResults(html)
  } catch (e) {
    console.error('[web-search-service] search failed:', e)
    return []
  }
}

/**
 * Format web search results as a numbered context block for injection as a tool
 * response message. Mirrors the knowledge_search formatting convention so the
 * model can cite sources by [n] in its answer.
 */
export function formatWebSearchContext(results: WebSearchResult[], startIndex = 1): string {
  if (results.length === 0) return '未检索到相关网络资料。'
  return results
    .map((r, i) => `[${startIndex + i}] ${r.title}\n来源：${r.url}\n${r.content}`)
    .join('\n\n---\n\n')
}

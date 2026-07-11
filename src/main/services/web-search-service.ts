import { net } from 'electron'

/**
 * Web search service (built-in, no API key required).
 *
 * Uses DuckDuckGo's HTML endpoint, which returns a static HTML page with
 * search results that can be parsed without an API key. This provides an
 * out-of-the-box web search experience; for production-grade search, consider
 * adding a keyed provider (Tavily / Exa / SearXNG) similar to cherry-studio's
 * WebSearchService.
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

const DDG_HTML_ENDPOINT = 'https://html.duckduckgo.com/html/'
const MAX_RESULTS = 5
const REQUEST_TIMEOUT_MS = 15000

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
} as const

/**
 * DuckDuckGo wraps result URLs in a redirect: `//duckduckgo.com/l/?uddg=ENCODED_URL&...`.
 * Decode the actual target URL from the `uddg` query parameter.
 */
function decodeDdgRedirect(href: string): string | null {
  try {
    const absolute = href.startsWith('//') ? `https:${href}` : href
    const parsed = new URL(absolute)
    const uddg = parsed.searchParams.get('uddg')
    if (uddg) return decodeURIComponent(uddg)
    // Some results (e.g. instant answers) link directly to external sites.
    if (parsed.hostname !== 'duckduckgo.com') return absolute
    return null
  } catch {
    return null
  }
}

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
 * Parse DuckDuckGo HTML result page. DDG renders each organic result as:
 *   <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=...">Title</a>
 *   <a class="result__snippet" href="...">Snippet text…</a>
 * We extract title/url pairs and snippets separately, then zip by index.
 */
function parseDdgResults(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = []

  const linkRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetRegex = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi

  const links: { url: string; title: string }[] = []
  let m: RegExpExecArray | null = linkRegex.exec(html)
  while (m !== null) {
    const url = decodeDdgRedirect(m[1])
    if (!url) {
      m = linkRegex.exec(html)
      continue
    }
    const title = stripHtml(m[2])
    if (!title) {
      m = linkRegex.exec(html)
      continue
    }
    links.push({ url, title })
    m = linkRegex.exec(html)
  }

  const snippets: string[] = []
  m = snippetRegex.exec(html)
  while (m !== null) {
    snippets.push(stripHtml(m[1]))
    m = snippetRegex.exec(html)
  }

  for (let i = 0; i < links.length && results.length < MAX_RESULTS; i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      content: snippets[i] || ''
    })
  }

  return results
}

/**
 * Search the web for the given query. Returns up to {@link MAX_RESULTS} results.
 * Never throws — on any failure (network, parse, timeout) returns an empty array
 * so the chat flow degrades gracefully to "no web results".
 */
export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const url = `${DDG_HTML_ENDPOINT}?q=${encodeURIComponent(trimmed)}`

  try {
    const response = await net.fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: BROWSER_HEADERS
    })

    if (!response.ok) {
      console.error('[web-search-service] DuckDuckGo HTTP', response.status)
      return []
    }

    const html = await response.text()
    return parseDdgResults(html)
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

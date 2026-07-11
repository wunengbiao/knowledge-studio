import { type ReactNode, memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { MarkdownStreamingContext, type MarkdownStreamingValue } from './MarkdownStreamingContext'
import { useChatMarkdownComponents } from './useChatMarkdownComponents'

interface MessageMarkdownProps {
  content: string
  /**
   * Visual variant: `assistant` (default) renders for dark-on-light
   * assistant bubbles; `user` renders for the light-on-blue user bubble,
   * remapping hardcoded gray text / borders to white-tinted equivalents.
   */
  variant?: 'user' | 'assistant'
  /** Optional inline transform applied to paragraph & list children (e.g. citation [n] injection). */
  transformChildren?: (children: ReactNode) => ReactNode
  className?: string
  /**
   * When true, a black circle cursor is injected at the next-character
   * position to indicate active streaming. If content stops arriving for
   * longer than `PAUSE_THRESHOLD_MS`, the cursor begins breathing (size
   * pulsation). When streaming ends, the cursor disappears.
   */
  streaming?: boolean
}

/** Pause interval (ms) after which the streaming cursor starts breathing. */
const PAUSE_THRESHOLD_MS = 600

const CURSOR_CLASS = 'stream-cursor'
const CURSOR_BREATHE_CLASS = 'stream-cursor-breathe'
const CURSOR_SELECTOR = `.${CURSOR_CLASS}`

/**
 * Find the last meaningful (non-whitespace) text node within `root`.
 * Returns the text node, or null if none exists.
 */
function findLastTextNode(root: Node): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const text = node.nodeValue ?? ''
      return text.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    }
  })
  let last: Text | null = null
  while (walker.nextNode()) {
    last = walker.currentNode as Text
  }
  return last
}

/**
 * Inject (or refresh) the streaming cursor span inside `container`.
 * - Removes any existing cursor first (idempotent for StrictMode + re-renders).
 * - Appends a new `<span class="stream-cursor">` to the parent of the last
 *   non-whitespace text node so it sits inline at the next-character position.
 * - Falls back to appending directly to `container` when no text node exists.
 * - Adds the breathe class when `breathe` is true.
 */
function injectStreamCursor(container: HTMLElement, breathe: boolean): void {
  // Remove any previously injected cursor (idempotent re-injection).
  for (const el of container.querySelectorAll(CURSOR_SELECTOR)) {
    el.remove()
  }

  const cursor = document.createElement('span')
  cursor.className = breathe ? `${CURSOR_CLASS} ${CURSOR_BREATHE_CLASS}` : CURSOR_CLASS
  cursor.setAttribute('aria-hidden', 'true')

  const lastText = findLastTextNode(container)
  const host = lastText?.parentElement ?? container
  host.appendChild(cursor)
}

/**
 * Chat-message markdown renderer.
 *
 * Mirrors cherry-studio's `ChatMarkdown` architecture: a thin component that
 * composes `remark-gfm` + `rehype-highlight` with the chat-flavored
 * `useChatMarkdownComponents` map (CodeBlock / Table / Link / heading
 * scaling / citation hook). Project-local: no streamdown / @cherrystudio/ui
 * dependency - uses the existing `react-markdown` stack.
 */
function MessageMarkdownImpl({
  content,
  variant = 'assistant',
  transformChildren,
  className,
  streaming = false
}: MessageMarkdownProps) {
  const components = useChatMarkdownComponents({ transformChildren, variant })
  const baseText = variant === 'user' ? 'text-white' : 'text-gray-900'
  const containerRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const streamingValue = useMemo<MarkdownStreamingValue>(
    () => ({ streaming, content }),
    [streaming, content]
  )

  // Pause detection: while streaming, schedule a timer that flips `paused`
  // to true when no content change arrives within PAUSE_THRESHOLD_MS. Fast
  // deltas keep cancelling the timer so paused stays false; when content
  // stops, the timer fires and the cursor begins breathing. The next delta
  // resets paused=false and the cycle repeats. When streaming ends, the
  // effect early-returns and clears any pending timer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: content is intentionally a re-trigger (reset timer on each delta); not read in body
  useLayoutEffect(() => {
    if (!streaming) {
      setPaused(false)
      return
    }
    setPaused(false)
    const timer = window.setTimeout(() => setPaused(true), PAUSE_THRESHOLD_MS)
    return () => window.clearTimeout(timer)
  }, [content, streaming])

  // Cursor injection: react-markdown re-renders its DOM tree on every content
  // change, wiping the imperatively-injected cursor. Re-inject on every render
  // (no dep array) so the cursor always sits at the latest next-character
  // position. When streaming ends, explicitly remove any lingering cursor -
  // otherwise it would persist in the DOM on every completed assistant message
  // (react-markdown doesn't re-render when only the `streaming` prop changes,
  // so the imperative span is never cleaned up by React reconciliation).
  useLayoutEffect(() => {
    if (!containerRef.current) return
    if (!streaming) {
      for (const el of containerRef.current.querySelectorAll(CURSOR_SELECTOR)) {
        el.remove()
      }
      return
    }
    injectStreamCursor(containerRef.current, paused)
  })

  return (
    <MarkdownStreamingContext.Provider value={streamingValue}>
      <div
        ref={containerRef}
        className={`chat-markdown overflow-hidden text-sm leading-relaxed ${baseText} ${className ?? ''}`}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
    </MarkdownStreamingContext.Provider>
  )
}

export const MessageMarkdown = memo(MessageMarkdownImpl)

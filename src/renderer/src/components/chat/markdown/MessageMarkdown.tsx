import { type ReactNode, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import 'highlight.js/styles/github.css'
import { useChatMarkdownComponents } from './useChatMarkdownComponents'

interface MessageMarkdownProps {
  content: string
  /** Optional inline transform applied to paragraph & list children (e.g. citation [n] injection). */
  transformChildren?: (children: ReactNode) => ReactNode
  className?: string
}

/**
 * Chat-message markdown renderer.
 *
 * Mirrors cherry-studio's `ChatMarkdown` architecture: a thin component that
 * composes `remark-gfm` + `rehype-highlight` with the chat-flavored
 * `useChatMarkdownComponents` map (CodeBlock / Table / Link / heading
 * scaling / citation hook). Project-local: no streamdown / @cherrystudio/ui
 * dependency — uses the existing `react-markdown` stack.
 */
function MessageMarkdownImpl({ content, transformChildren, className }: MessageMarkdownProps) {
  const components = useChatMarkdownComponents({ transformChildren })

  return (
    <div className={`chat-markdown text-sm text-gray-900 ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export const MessageMarkdown = memo(MessageMarkdownImpl)

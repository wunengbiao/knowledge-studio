import { type ReactNode, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
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
function MessageMarkdownImpl({
  content,
  variant = 'assistant',
  transformChildren,
  className
}: MessageMarkdownProps) {
  const components = useChatMarkdownComponents({ transformChildren, variant })
  const baseText = variant === 'user' ? 'text-white' : 'text-gray-900'

  return (
    <div
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
  )
}

export const MessageMarkdown = memo(MessageMarkdownImpl)

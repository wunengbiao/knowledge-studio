import { Check, Copy } from 'lucide-react'
import { type ReactNode, memo, useCallback, useState } from 'react'
import { MermaidBlock } from './MermaidBlock'

interface CodeBlockProps {
  className?: string
  children?: ReactNode
  inline?: boolean
  // react-markdown will pass through other HTMLAttributes
  [key: string]: unknown
}

/**
 * Fancy code block: language label + copy button + highlight.js styling.
 * Inline code falls through to a simple <code> tag.
 *
 * Mirrors cherry-studio's CodeBlock split (inline vs fenced) but stays on
 * react-markdown + rehype-highlight (the deps already in this project),
 * instead of pulling in @cherrystudio/ui / streamdown.
 */
function CodeBlockImpl({ className = '', children, inline, ...rest }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const match = /language-([\w-+]+)/.exec(className)
  const language = match?.[1] ?? null
  const codeText = childrenToString(children)
  const isMultiline = codeText.includes('\n')
  const isFenced = !inline && (language !== null || isMultiline)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeText.replace(/\n$/, ''))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // swallow — clipboard may be unavailable
    }
  }, [codeText])

  if (!isFenced) {
    return (
      <code
        className={`${className} text-[12.5px] text-pink-600 bg-pink-50 px-1 py-0.5 rounded`}
        {...rest}
      >
        {children}
      </code>
    )
  }

  if (language === 'mermaid') {
    return <MermaidBlock code={codeText} />
  }

  return (
    <div className="group relative my-3 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gray-100/70">
        <span className="text-[11px] font-mono uppercase tracking-wide text-gray-500">
          {language ?? 'text'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-200/60"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-green-600" />
              已复制
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              复制
            </>
          )}
        </button>
      </div>
      <pre className="!my-0 !bg-transparent overflow-x-auto px-3 py-2.5 text-[12.5px] leading-relaxed">
        <code className={className} {...rest}>
          {children}
        </code>
      </pre>
    </div>
  )
}

function childrenToString(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(childrenToString).join('')
  if (typeof node === 'object' && 'props' in node) {
    // biome-ignore lint/suspicious/noExplicitAny: ReactElement children
    return childrenToString((node as any).props?.children)
  }
  return ''
}

export const CodeBlock = memo(CodeBlockImpl)

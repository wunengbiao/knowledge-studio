import { Check, Copy } from 'lucide-react'
import {
  type ReactElement,
  type ReactNode,
  cloneElement,
  isValidElement,
  memo,
  useCallback,
  useState
} from 'react'
import { useTranslation } from '../../../i18n'
import { useKBStore } from '../../../stores/kb-store'
import { MermaidBlock } from './MermaidBlock'
import { SvgBlock } from './SvgBlock'

interface CodeBlockProps {
  className?: string
  children?: ReactNode
  inline?: boolean
  variant?: 'user' | 'assistant'
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
function CodeBlockImpl({
  className = '',
  children,
  inline,
  variant = 'assistant',
  ...rest
}: CodeBlockProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const wrap = !!useKBStore((s) => s.settings?.codeBlockWordWrap)
  const showLineNumbers = !!useKBStore((s) => s.settings?.codeBlockShowLineNumbers)
  const match = /language-([\w-+]+)/.exec(className)
  const language = match?.[1] ?? null
  const codeText = childrenToString(children)
  const isMultiline = codeText.includes('\n')
  const isFenced = !inline && (language !== null || isMultiline)
  const inlineClass =
    variant === 'user'
      ? `${className} text-[var(--code-font-size)] font-[family-name:var(--code-font-family)] text-white bg-white/15 px-1 py-0.5 rounded`
      : `${className} text-[var(--code-font-size)] font-[family-name:var(--code-font-family)] text-slate-700 bg-slate-100 dark:text-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded`

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
      <code className={inlineClass} {...rest}>
        {children}
      </code>
    )
  }

  if (language === 'mermaid') {
    return <MermaidBlock code={codeText} />
  }

  // SVG: explicit ```svg fence, or xml/plain fence whose content is an <svg>…</svg> doc.
  const trimmedCode = codeText.trim()
  const isSvgByContent =
    (language === null || language === 'xml') &&
    /^<svg[\s>]/i.test(trimmedCode) &&
    /<\/svg>\s*$/i.test(trimmedCode)
  if (language === 'svg' || isSvgByContent) {
    return <SvgBlock code={codeText} />
  }

  const lines = codeText.replace(/\n$/, '').split('\n')
  const lineCount = lines.length
  const gutterWidth = String(lineCount).length

  const body = wrap ? (
    <div>
      {splitNodeByLine(children)
        .slice(0, lineCount)
        .map((nodes, i) => {
          const isFirst = i === 0
          const isLast = i === lineCount - 1
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: line numbers are static and never reorder
            <div key={i + 1} className="flex">
              {showLineNumbers && (
                <span
                  aria-hidden="true"
                  className={`shrink-0 select-none text-right pl-3 pr-2 text-[var(--code-font-size)] leading-relaxed text-gray-400 bg-gray-100/40 border-r border-gray-200 ${
                    isFirst ? 'pt-2.5' : ''
                  } ${isLast ? 'pb-2.5' : ''}`}
                  style={{
                    width: `${gutterWidth + 0.5}ch`,
                    boxSizing: 'content-box',
                    fontFamily: 'var(--code-font-family)',
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {i + 1}
                </span>
              )}
              <code
                className={`${className} flex-1 !p-0 !px-3 text-[var(--code-font-size)] leading-relaxed whitespace-pre-wrap break-words font-[family-name:var(--code-font-family)] text-[var(--code-text)] ${
                  isFirst ? '!pt-2.5' : ''
                } ${isLast ? '!pb-2.5' : ''}`}
                {...rest}
              >
                {nodes.length > 0 ? nodes : '\u200B'}
              </code>
            </div>
          )
        })}
    </div>
  ) : (
    <div className="flex">
      {showLineNumbers && (
        <div
          aria-hidden="true"
          className="shrink-0 select-none text-right py-2.5 pl-3 pr-2 text-[var(--code-font-size)] leading-relaxed text-gray-400 bg-gray-100/40 border-r border-gray-200"
          style={{
            width: `${gutterWidth + 0.5}ch`,
            boxSizing: 'content-box',
            fontFamily: 'var(--code-font-family)',
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => {
            // biome-ignore lint/suspicious/noArrayIndexKey: line numbers are static and never reorder
            return <div key={i + 1}>{i + 1}</div>
          })}
        </div>
      )}
      <pre className="!my-0 !bg-transparent flex-1 px-3 py-2.5 text-[var(--code-font-size)] leading-relaxed overflow-x-auto font-[family-name:var(--code-font-family)] text-[var(--code-text)]">
        <code className={`${className} !p-0`} {...rest}>
          {children}
        </code>
      </pre>
    </div>
  )

  return (
    <div className="group relative my-3 rounded-lg overflow-hidden border border-[var(--code-border)] bg-[var(--code-bg)]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--code-border)] bg-[var(--code-header-bg)]">
        <span className="text-[11px] font-mono uppercase tracking-wide text-[var(--code-header-text)]">
          {language ?? 'text'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-[11px] text-[var(--code-header-text)] hover:text-[var(--code-header-hover-text)] px-1.5 py-0.5 rounded hover:bg-[var(--code-header-hover-bg)]"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-[var(--code-copied-icon)]" />
              {t('markdown.codeCopied')}
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              {t('markdown.copy')}
            </>
          )}
        </button>
      </div>
      {body}
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

/**
 * Split a highlighted React node tree (from rehype-highlight) into per-line
 * arrays, preserving span nesting so syntax-highlight colors survive across
 * wrapped lines. Each returned array is one logical line's content.
 */
function splitNodeByLine(node: ReactNode): ReactNode[][] {
  const lines: ReactNode[][] = [[]]
  let keyInLine = 0

  function walk(n: ReactNode, stack: ReactElement[]) {
    if (n == null || typeof n === 'boolean') return
    if (typeof n === 'string' || typeof n === 'number') {
      const parts = String(n).split('\n')
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          lines.push([])
          keyInLine = 0
        }
        const part = parts[i]
        if (part) {
          let wrapped: ReactNode = part
          for (let j = stack.length - 1; j >= 0; j--) {
            wrapped = cloneElement(stack[j], { key: `ln${keyInLine}-${j}` }, wrapped)
          }
          lines[lines.length - 1].push(wrapped)
          keyInLine++
        }
      }
      return
    }
    if (Array.isArray(n)) {
      for (const child of n) walk(child, stack)
      return
    }
    if (isValidElement(n)) {
      walk((n.props as { children?: ReactNode })?.children, [...stack, n])
    }
  }

  walk(node, [])
  return lines
}

export const CodeBlock = memo(CodeBlockImpl)

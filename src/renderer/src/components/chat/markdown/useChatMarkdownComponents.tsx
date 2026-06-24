import { type ReactNode, useMemo } from 'react'
import type { Components } from 'react-markdown'
import { CodeBlock } from './CodeBlock'
import { Link } from './Link'
import { Table, Td, Th } from './Table'

interface Options {
  /** Optional override / extension for the inline transform of paragraph & list children.
   * Used by ChatPage to inject clickable [n] citation buttons. */
  transformChildren?: (children: ReactNode) => ReactNode
}

/**
 * Composition hook returning the chat-flavored ReactMarkdown `components` map.
 *
 * Mirrors cherry-studio's `useChatMarkdownComponents` pattern:
 *   - `<a>`     → Link (safe external link)
 *   - `<code>`  → CodeBlock (language label + copy button)
 *   - `<table>` → Table + Th/Td (horizontal scroll, bordered)
 *   - `<p>`/`<li>` → optional citation-injection wrapper (via transformChildren)
 *   - `<pre>`   → pass-through (CodeBlock owns the outer chrome)
 *
 * Returned map identity is memoized on `transformChildren`, so passing a
 * memoized callback keeps `<ReactMarkdown components={...}>` stable across
 * re-renders (matches the streaming-friendly philosophy in cherry-studio).
 */
export function useChatMarkdownComponents({
  transformChildren
}: Options = {}): Partial<Components> {
  return useMemo<Partial<Components>>(
    () => ({
      // biome-ignore lint/suspicious/noExplicitAny: react-markdown component props are loose
      a: (props: any) => <Link {...props} />,
      // biome-ignore lint/suspicious/noExplicitAny: react-markdown component props are loose
      code: (props: any) => <CodeBlock {...props} />,
      pre: ({ children }) => <>{children}</>,
      table: ({ children }) => <Table>{children}</Table>,
      thead: ({ children }) => <thead>{children}</thead>,
      tbody: ({ children }) => <tbody>{children}</tbody>,
      tr: ({ children }) => <tr>{children}</tr>,
      th: ({ children }) => <Th>{transformChildren ? transformChildren(children) : children}</Th>,
      td: ({ children }) => <Td>{transformChildren ? transformChildren(children) : children}</Td>,
      p: ({ children }) => (
        <p className="my-2 leading-relaxed">
          {transformChildren ? transformChildren(children) : children}
        </p>
      ),
      li: ({ children }) => (
        <li className="my-0.5">{transformChildren ? transformChildren(children) : children}</li>
      ),
      ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-0.5">{children}</ul>,
      ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-0.5">{children}</ol>,
      h1: ({ children }) => (
        <h1 className="mt-4 mb-2 text-xl font-semibold text-gray-900">
          {transformChildren ? transformChildren(children) : children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2 className="mt-4 mb-2 text-lg font-semibold text-gray-900">
          {transformChildren ? transformChildren(children) : children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 className="mt-3 mb-1.5 text-base font-semibold text-gray-900">
          {transformChildren ? transformChildren(children) : children}
        </h3>
      ),
      h4: ({ children }) => (
        <h4 className="mt-3 mb-1.5 text-sm font-semibold text-gray-900">
          {transformChildren ? transformChildren(children) : children}
        </h4>
      ),
      blockquote: ({ children }) => (
        <blockquote className="my-3 border-l-4 border-gray-200 pl-3 text-gray-600 italic">
          {transformChildren ? transformChildren(children) : children}
        </blockquote>
      ),
      hr: () => <hr className="my-4 border-t border-gray-200" />,
      strong: ({ children }) => (
        <strong className="font-semibold text-gray-900">
          {transformChildren ? transformChildren(children) : children}
        </strong>
      ),
      em: ({ children }) => (
        <em className="italic">{transformChildren ? transformChildren(children) : children}</em>
      )
    }),
    [transformChildren]
  )
}

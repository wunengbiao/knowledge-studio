import type { AnchorHTMLAttributes } from 'react'

type Variant = 'user' | 'assistant'

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  node?: unknown
  variant?: Variant
}

/**
 * Safe external link: opens in new tab, strips `node` prop from react-markdown,
 * preserves in-page anchors (e.g. footnote backrefs) as plain spans/links.
 *
 * Mirrors cherry-studio's Link component intent, minus the CitationTooltip
 * branch - citations in this project are rendered separately by
 * ChatPage's `renderCitationsInChildren`.
 */
export function Link({ href, children, variant = 'assistant', ...rest }: LinkProps) {
  // strip `node` injected by react-markdown to avoid React warning
  ;(rest as Record<string, unknown>).node = undefined

  const colorClass =
    variant === 'user'
      ? 'text-blue-100 hover:text-white underline'
      : 'text-blue-600 hover:underline break-words'

  if (href?.startsWith('#')) {
    return (
      <a href={href} className={colorClass} {...rest}>
        {children}
      </a>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={colorClass}
      onClick={(e) => e.stopPropagation()}
      {...rest}
    >
      {children}
    </a>
  )
}

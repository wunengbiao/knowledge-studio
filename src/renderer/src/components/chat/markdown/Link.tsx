import type { AnchorHTMLAttributes } from 'react'

/**
 * Safe external link: opens in new tab, strips `node` prop from react-markdown,
 * preserves in-page anchors (e.g. footnote backrefs) as plain spans/links.
 *
 * Mirrors cherry-studio's Link component intent, minus the CitationTooltip
 * branch — citations in this project are rendered separately by
 * ChatPage's `renderCitationsInChildren`.
 */
export function Link({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) {
  // strip `node` injected by react-markdown to avoid React warning
  ;(rest as Record<string, unknown>).node = undefined

  if (href?.startsWith('#')) {
    return (
      <a href={href} className="text-blue-600 hover:underline" {...rest}>
        {children}
      </a>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-blue-600 hover:underline break-words"
      onClick={(e) => e.stopPropagation()}
      {...rest}
    >
      {children}
    </a>
  )
}

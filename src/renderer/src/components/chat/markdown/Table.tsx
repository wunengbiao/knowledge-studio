import { type ReactNode, memo } from 'react'

type Variant = 'user' | 'assistant'

interface TableProps {
  children?: ReactNode
  variant?: Variant
}

/**
 * Table wrapper: adds horizontal scroll + bordered styling.
 *
 * Mirrors cherry-studio's Table component pattern (wrapping <table> in a
 * scrollable container), without the styled-components / Excel-export
 * dependencies - this project doesn't ship those.
 */
function TableImpl({ children, variant = 'assistant' }: TableProps) {
  const isUser = variant === 'user'
  const wrapperClass = isUser
    ? 'my-3 overflow-x-auto rounded-lg border border-white/30'
    : 'my-3 overflow-x-auto rounded-lg border border-gray-200'
  return (
    <div className={wrapperClass}>
      <table className="min-w-full text-sm border-collapse">{children}</table>
    </div>
  )
}

function ThImpl({ children, variant = 'assistant' }: { children?: ReactNode; variant?: Variant }) {
  const isUser = variant === 'user'
  const cls = isUser
    ? 'px-3 py-2 text-left font-medium text-white bg-white/10 border-b border-white/30'
    : 'px-3 py-2 text-left font-medium text-gray-700 bg-gray-50 border-b border-gray-200'
  return <th className={cls}>{children}</th>
}

function TdImpl({ children, variant = 'assistant' }: { children?: ReactNode; variant?: Variant }) {
  const isUser = variant === 'user'
  const cls = isUser
    ? 'px-3 py-2 text-white border-b border-white/15 align-top'
    : 'px-3 py-2 text-gray-700 border-b border-gray-100 align-top'
  return <td className={cls}>{children}</td>
}

export const Table = memo(TableImpl)
export const Th = memo(ThImpl)
export const Td = memo(TdImpl)

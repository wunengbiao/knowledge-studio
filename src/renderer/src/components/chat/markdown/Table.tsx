import { type ReactNode, memo } from 'react'

interface TableProps {
  children?: ReactNode
}

/**
 * Table wrapper: adds horizontal scroll + bordered styling.
 *
 * Mirrors cherry-studio's Table component pattern (wrapping <table> in a
 * scrollable container), without the styled-components / Excel-export
 * dependencies — this project doesn't ship those.
 */
function TableImpl({ children }: TableProps) {
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm border-collapse">{children}</table>
    </div>
  )
}

function ThImpl({ children }: { children?: ReactNode }) {
  return (
    <th className="px-3 py-2 text-left font-medium text-gray-700 bg-gray-50 border-b border-gray-200">
      {children}
    </th>
  )
}

function TdImpl({ children }: { children?: ReactNode }) {
  return <td className="px-3 py-2 text-gray-700 border-b border-gray-100 align-top">{children}</td>
}

export const Table = memo(TableImpl)
export const Th = memo(ThImpl)
export const Td = memo(TdImpl)

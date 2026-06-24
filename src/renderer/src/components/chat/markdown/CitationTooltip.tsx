import type { MessageCitation } from '@shared/types'
import { FileText } from 'lucide-react'
import { type ReactNode, memo, useEffect, useRef, useState } from 'react'

interface CitationTooltipProps {
  citation: MessageCitation
  children: ReactNode
}

/**
 * Hover tooltip card for a citation reference.
 *
 * Mirrors cherry-studio's `CitationTooltip`:
 *   - header (icon + title)
 *   - body (3-line content preview, line-clamped)
 *   - footer (metadata — here: relevance score)
 *
 * Adapted to this project's `MessageCitation` shape (chunk-backed, not web URL).
 * Pure CSS positioning + a portal-less fixed layer so it floats above
 * neighboring bubble overflow.
 */
function CitationTooltipImpl({ citation, children }: CitationTooltipProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; placement: 'top' | 'bottom' }>({
    left: 0,
    top: 0,
    placement: 'top'
  })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    if (!trigger) return

    const updatePosition = () => {
      const rect = trigger.getBoundingClientRect()
      const cardW = 340
      const cardH = cardRef.current?.offsetHeight ?? 160
      const margin = 8
      const spaceAbove = rect.top
      const placement: 'top' | 'bottom' = spaceAbove >= cardH + margin ? 'top' : 'bottom'
      let left = rect.left + rect.width / 2 - cardW / 2
      left = Math.max(margin, Math.min(left, window.innerWidth - cardW - margin))
      const top = placement === 'top' ? rect.top - cardH - margin : rect.bottom + margin
      setPos({ left, top, placement })
    }

    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open])

  const scheduleClose = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 120)
  }
  const cancelClose = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={() => {
          cancelClose()
          setOpen(true)
        }}
        onMouseLeave={scheduleClose}
        onFocus={() => {
          cancelClose()
          setOpen(true)
        }}
        onBlur={scheduleClose}
        className="inline-flex align-baseline"
      >
        {children}
      </span>
      {open && (
        <div
          ref={cardRef}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="fixed z-50 w-[340px] rounded-xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5 overflow-hidden pointer-events-auto"
          style={{ left: pos.left, top: pos.top }}
          role="tooltip"
        >
          <div className="flex items-start gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/60">
            <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 text-[11px] font-semibold">
              [{citation.index}]
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-[13px] font-medium text-gray-900 truncate"
                title={citation.docTitle}
              >
                {citation.docTitle}
              </div>
              <div className="flex items-center gap-1 mt-0.5 text-[10.5px] text-gray-400">
                <FileText className="w-3 h-3" />
                <span>相关度 {(citation.score * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
          <div
            className="px-3 py-2.5 text-[12.5px] leading-relaxed text-gray-600 overflow-hidden"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical' as const
            }}
          >
            {citation.content}
          </div>
          <div className="px-3 py-1.5 border-t border-gray-100 bg-gray-50/60 text-[10.5px] text-gray-400">
            点击查看完整内容
          </div>
        </div>
      )}
    </>
  )
}

export const CitationTooltip = memo(CitationTooltipImpl)

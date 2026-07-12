import type { MessageCitation } from '@shared/types'
import { ExternalLink, FileText, Globe, Hash } from 'lucide-react'
import { type ReactNode, memo, useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../../i18n'

interface CitationTooltipProps {
  citation: MessageCitation
  children: ReactNode
}

function CitationTooltipImpl({ citation, children }: CitationTooltipProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; placement: 'top' | 'bottom' }>({
    left: 0,
    top: 0,
    placement: 'top'
  })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<number | null>(null)

  const isWeb = citation.kind === 'web'
  const displayTitle = isWeb ? citation.title || citation.url || '' : citation.docTitle || ''
  const sectionPath = !isWeb ? citation.chunkTitle?.trim() || '' : ''

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

  const badgeClass = isWeb
    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300'
    : 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300'

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
          className="fixed z-50 w-[340px] rounded-xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5 overflow-hidden pointer-events-auto dark:border-gray-700 dark:bg-gray-800"
          style={{ left: pos.left, top: pos.top }}
          role="tooltip"
        >
          <div className="flex items-start gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[11px] font-semibold ${badgeClass}`}
            >
              [{citation.index}]
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-[13px] font-medium text-gray-900 truncate dark:text-gray-100"
                title={displayTitle}
              >
                {displayTitle}
              </div>
              {isWeb ? (
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 mt-0.5 text-[10.5px] text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  <Globe className="w-3 h-3 shrink-0" />
                  <span className="truncate">{citation.url}</span>
                </a>
              ) : (
                <>
                  {sectionPath && (
                    <div
                      className="flex items-center gap-1 mt-0.5 text-[10.5px] text-gray-500 dark:text-gray-400"
                      title={sectionPath}
                    >
                      <Hash className="w-3 h-3 shrink-0 text-blue-400 dark:text-blue-400" />
                      <span className="truncate">{sectionPath}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-0.5 text-[10.5px] text-gray-400 dark:text-gray-500">
                    <FileText className="w-3 h-3" />
                    <span>
                      {t('chat.relevance', { n: ((citation.score ?? 0) * 100).toFixed(1) })}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div
            className="px-3 py-2.5 text-[12.5px] leading-relaxed text-gray-600 overflow-hidden dark:text-gray-300"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical' as const
            }}
          >
            {citation.content}
          </div>
          <div className="px-3 py-1.5 border-t border-gray-100 bg-gray-50 text-[10.5px] text-gray-400 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-500">
            {isWeb ? (
              <span className="flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                {t('citation.visitSite')}
              </span>
            ) : (
              t('citation.clickToViewFull')
            )}
          </div>
        </div>
      )}
    </>
  )
}

export const CitationTooltip = memo(CitationTooltipImpl)

import { Brain, ChevronDown, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from '../../i18n'
import { MessageMarkdown } from './markdown'

interface ThinkingBlockProps {
  reasoning: string | undefined
  streaming: boolean
}

export function ThinkingBlock({ reasoning, streaming }: ThinkingBlockProps) {
  const { t } = useTranslation()
  const hasReasoning = !!reasoning && reasoning.trim().length > 0
  const [expanded, setExpanded] = useState(streaming)

  useEffect(() => {
    setExpanded(streaming)
  }, [streaming])

  if (!hasReasoning && !streaming) return null

  return (
    <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        {streaming ? (
          <Loader2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300 animate-spin shrink-0" />
        ) : (
          <Brain className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300 shrink-0" />
        )}
        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
          {streaming ? t('thinking.thinking') : t('thinking.deepThought')}
        </span>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">·</span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {t('thinking.process')}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 ml-auto transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      {expanded && hasReasoning && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mb-1.5">
            {t('thinking.process')}
          </div>
          <div className="text-gray-600 dark:text-gray-300">
            <MessageMarkdown content={reasoning ?? ''} />
          </div>
        </div>
      )}
      {expanded && streaming && !hasReasoning && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
          <div className="text-xs text-slate-400 dark:text-slate-500 italic">
            {t('thinking.waiting')}
          </div>
        </div>
      )}
    </div>
  )
}

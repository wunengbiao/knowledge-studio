import { Brain, ChevronDown, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { MessageMarkdown } from './markdown'

interface ThinkingBlockProps {
  reasoning: string | undefined
  streaming: boolean
}

export function ThinkingBlock({ reasoning, streaming }: ThinkingBlockProps) {
  const hasReasoning = !!reasoning && reasoning.trim().length > 0
  const [expanded, setExpanded] = useState(streaming)

  useEffect(() => {
    setExpanded(streaming)
  }, [streaming])

  if (!hasReasoning && !streaming) return null

  return (
    <div className="mb-2 rounded-xl border border-purple-100 bg-purple-50/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-purple-50"
      >
        {streaming ? (
          <Loader2 className="w-3.5 h-3.5 text-purple-600 animate-spin shrink-0" />
        ) : (
          <Brain className="w-3.5 h-3.5 text-purple-600 shrink-0" />
        )}
        <span className="text-xs font-medium text-purple-700">
          {streaming ? '思考中...' : '已深度思考'}
        </span>
        <span className="text-[11px] text-purple-400">·</span>
        <span className="text-[11px] text-purple-500">思考过程</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-purple-400 ml-auto transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      {expanded && hasReasoning && (
        <div className="px-3 pb-3 pt-1 border-t border-purple-100/60">
          <div className="text-[11px] text-purple-400 mb-1.5">思考过程</div>
          <div className="text-gray-600">
            <MessageMarkdown content={reasoning ?? ''} />
          </div>
        </div>
      )}
      {expanded && streaming && !hasReasoning && (
        <div className="px-3 pb-3 pt-1 border-t border-purple-100/60">
          <div className="text-xs text-purple-400 italic">等待模型输出思考内容...</div>
        </div>
      )}
    </div>
  )
}

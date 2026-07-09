import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation, type TranslationKey } from '../i18n'
import { Search, ArrowLeft, FileText, FileType, Globe, Loader2, Sparkles, AlertCircle } from 'lucide-react'
import { useDocStore } from '../stores/doc-store'
import { useKBStore } from '../stores/kb-store'

const modes: Array<{ value: 'hybrid' | 'bm25' | 'vector' | 'graph'; labelKey: TranslationKey; descKey: TranslationKey }> = [
  { value: 'hybrid' as const, labelKey: 'searchPage.modeHybrid', descKey: 'searchPage.descHybrid' },
  { value: 'bm25' as const, labelKey: 'searchPage.modeBm25', descKey: 'searchPage.descBm25' },
  { value: 'vector' as const, labelKey: 'searchPage.modeVector', descKey: 'searchPage.descVector' },
  { value: 'graph' as const, labelKey: 'searchPage.modeGraph', descKey: 'searchPage.descGraph' }
]

export function SearchPage() {
  const { kbId } = useParams<{ kbId: string }>()
  const navigate = useNavigate()
  const { knowledgeBases } = useKBStore()
  const {
    searchResults,
    searchQuery,
    searchMode,
    embeddingProgress,
    searchError,
    search,
    setSearchQuery,
    setSearchMode
  } = useDocStore()
  const [query, setQuery] = useState(searchQuery)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { t } = useTranslation()
  const kb = knowledgeBases.find((k) => k.id === kbId)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSearch = async () => {
    if (!query.trim() || !kbId) return
    setSearching(true)
    await search(kbId, query, searchMode)
    setSearching(false)
  }

  const sourceIcon = (type: string) => {
    switch (type) {
      case 'docx':
        return <FileText className="w-3.5 h-3.5 text-blue-500" />
      case 'pdf':
        return <FileType className="w-3.5 h-3.5 text-red-500" />
      case 'url':
        return <Globe className="w-3.5 h-3.5 text-emerald-500" />
      default:
        return null
    }
  }

  const sourceBadge = (source: string, t: (key: TranslationKey) => string) => {
    const colors: Record<string, string> = {
      bm25: 'bg-amber-50 text-amber-600',
      vector: 'bg-blue-50 text-blue-600',
      hybrid: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
      graph: 'bg-emerald-50 text-emerald-600'
    }
    const labels: Record<string, string> = {
      bm25: t('searchPage.sourceBm25'),
      vector: t('searchPage.sourceVector'),
      hybrid: t('searchPage.sourceHybrid'),
      graph: t('searchPage.sourceGraph')
    }
    return (
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors[source] || 'bg-gray-50 text-gray-500'}`}
      >
        {labels[source] || source}
      </span>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(`/kb/${kbId}`)}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{t('searchPage.title', { name: kb?.name ?? '' })}</h1>
      </div>

      {/* Search Input */}
      <div className="mb-4">
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t('searchPage.placeholder')}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={!query.trim() || searching}
            className="px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 transition-all shadow-sm flex items-center gap-2"
          >
            {searching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
             {t('common.search')}
          </button>
        </div>

        {/* Mode Selector */}
        <div className="flex gap-1.5">
          {modes.map((mode) => (
            <button
              key={mode.value}
              onClick={() => setSearchMode(mode.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                searchMode === mode.value
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
              }`}
              title={t(mode.descKey)}
            >
              {mode.value === 'graph' && <Sparkles className="w-3 h-3 inline mr-1" />}
              {t(mode.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Embedding progress */}
      {searching && embeddingProgress && embeddingProgress.total > 0 && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
            <span className="text-sm text-blue-700">
              {embeddingProgress.status} ({embeddingProgress.current}/{embeddingProgress.total})
            </span>
          </div>
          <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{
                width: `${(embeddingProgress.current / Math.max(embeddingProgress.total, 1)) * 100}%`
              }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {searchError && !searching && (
        <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div className="text-sm text-red-700 leading-relaxed">{searchError}</div>
        </div>
      )}

      {/* Results */}
      <div className="space-y-3">
        {searchResults.length === 0 && searchQuery && !searching && !searchError && (
          <div className="text-center py-16">
            <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 text-sm">{t('searchPage.noResults')}</p>
            <p className="text-gray-300 text-xs mt-1">{t('searchPage.tryDifferent')}</p>
          </div>
        )}

        {searchResults.length === 0 && !searchQuery && (
          <div className="text-center py-16">
            <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 text-sm">{t('searchPage.enterToSearch')}</p>
            <p className="text-gray-300 text-xs mt-1">
              {t('searchPage.supportModes')}
            </p>
          </div>
        )}

        {searchResults.map((result, i) => (
          <div
            key={`${result.chunkId}-${i}`}
            className="p-4 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-gray-900 truncate">
                {result.docTitle}
              </span>
              {sourceBadge(result.source, t)}
              <span className="text-[10px] text-gray-400">
                {t('searchPage.relevance', { n: ((result.score / (searchResults[0]?.score || 1)) * 100).toFixed(1) })}
              </span>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed line-clamp-4">
              {result.content}
            </p>
            {result.highlights.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-50">
                {result.highlights.map((h, j) => (
                  <p
                    key={j}
                    className="text-xs text-gray-500 mb-1"
                    dangerouslySetInnerHTML={{
                      __html: h.replace(
                        new RegExp(`(${searchQuery})`, 'gi'),
                        '<mark class="bg-yellow-100 text-yellow-800 px-0.5 rounded">$1</mark>'
                      )
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      </div>
    </div>
  )
}

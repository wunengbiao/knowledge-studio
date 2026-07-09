import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Share2, BrainCircuit, Loader2, Network } from 'lucide-react'
import { useTranslation } from '../i18n'
import { useKBStore } from '../stores/kb-store'
import { useGraphStore } from '../stores/graph-store'

export function GraphPage() {
  const { kbId } = useParams<{ kbId: string }>()
  const navigate = useNavigate()
  const { knowledgeBases } = useKBStore()
  const { entities, relations, communities, graphBuilt, building, loadGraph, buildGraph } =
    useGraphStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null)
  const [view, setView] = useState<'graph' | 'communities'>('graph')

  const { t } = useTranslation()
  const kb = knowledgeBases.find((k) => k.id === kbId)

  useEffect(() => {
    if (kbId) loadGraph(kbId)
  }, [kbId])

  // Simple canvas graph visualization
  useEffect(() => {
    if (view !== 'graph' || entities.length === 0) return
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const cx = w / 2
    const cy = h / 2
    const radius = Math.min(w, h) * 0.35

    ctx.clearRect(0, 0, w, h)

    // Layout entities in a circle
    const entityPositions = new Map<string, { x: number; y: number }>()
    const maxDisplay = Math.min(entities.length, 60)
    const displayEntities = entities.slice(0, maxDisplay)

    displayEntities.forEach((entity, i) => {
      const angle = (2 * Math.PI * i) / maxDisplay - Math.PI / 2
      const x = cx + radius * Math.cos(angle)
      const y = cy + radius * Math.sin(angle)
      entityPositions.set(entity.id, { x, y })
    })

    // Draw relations
    const entityIdSet = new Set(displayEntities.map((e) => e.id))
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 0.5
    relations.forEach((rel) => {
      const s = entityPositions.get(rel.source)
      const t = entityPositions.get(rel.target)
      if (s && t) {
        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(t.x, t.y)
        ctx.stroke()
      }
    })

    // Draw entities
    displayEntities.forEach((entity) => {
      const pos = entityPositions.get(entity.id)
      if (!pos) return

      const isSelected = selectedEntity === entity.id
      const r = isSelected ? 6 : 4

      const colors: Record<string, string> = {
        person: '#3b82f6',
        url: '#10b981',
        acronym: '#f59e0b',
        date: '#8b5cf6',
        version: '#ec4899',
        email: '#06b6d4',
        concept: '#6b7280'
      }
      const color = colors[entity.type] || '#6b7280'

      ctx.beginPath()
      ctx.arc(pos.x, pos.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()

      if (isSelected) {
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Label
      if (isSelected || displayEntities.length < 20) {
        ctx.fillStyle = '#374151'
        ctx.font = `${isSelected ? 'bold ' : ''}10px -apple-system, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(entity.name.slice(0, 15), pos.x, pos.y - 10)
      }
    })
  }, [entities, relations, selectedEntity, view])

  if (!kb) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">{t('graphPage.notFound')}</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(`/kb/${kbId}`)}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{t('graphPage.title', { name: kb.name })}</h1>
        <div className="flex-1" />
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setView('graph')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              view === 'graph' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            <Network className="w-3.5 h-3.5 inline mr-1" />
            {t('graphPage.viewGraph')}
          </button>
          <button
            onClick={() => setView('communities')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              view === 'communities' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            <Share2 className="w-3.5 h-3.5 inline mr-1" />
            {t('graphPage.viewCommunities')}
          </button>
        </div>
      </div>

      {!graphBuilt ? (
        <div className="text-center py-20 bg-white border border-dashed border-gray-200 rounded-xl">
          <BrainCircuit className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">{t('graphPage.notBuilt')}</h3>
          <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto">
            {t('graphPage.notBuiltDesc')}
          </p>
          <button
            onClick={() => kbId && buildGraph(kbId)}
            disabled={building}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {building ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('graphPage.building')}
              </>
            ) : (
              <>
                <BrainCircuit className="w-4 h-4" />
                {t('graphPage.buildGraph')}
              </>
            )}
          </button>
        </div>
      ) : view === 'graph' ? (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 bg-white border border-gray-100 rounded-xl">
              <div className="text-2xl font-bold text-gray-900">{entities.length}</div>
              <div className="text-xs text-gray-400 mt-1">{t('graphPage.entities')}</div>
            </div>
            <div className="p-4 bg-white border border-gray-100 rounded-xl">
              <div className="text-2xl font-bold text-gray-900">{relations.length}</div>
              <div className="text-xs text-gray-400 mt-1">{t('graphPage.relations')}</div>
            </div>
            <div className="p-4 bg-white border border-gray-100 rounded-xl">
              <div className="text-2xl font-bold text-gray-900">{communities.length}</div>
              <div className="text-xs text-gray-400 mt-1">{t('graphPage.communities')}</div>
            </div>
          </div>

          {/* Canvas */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <canvas
              ref={canvasRef}
              className="w-full"
              style={{ height: '400px' }}
              onClick={(e) => {
                const rect = canvasRef.current?.getBoundingClientRect()
                if (!rect) return
                const x = e.clientX - rect.left
                const y = e.clientY - rect.top
                // Simple hit detection
                const maxDisplay = Math.min(entities.length, 60)
                const displayEntities = entities.slice(0, maxDisplay)
                const w = rect.width
                const h = rect.height
                const cx = w / 2
                const cy = h / 2
                const radius = Math.min(w, h) * 0.35

                let closest: string | null = null
                let minDist = 30
                displayEntities.forEach((entity, i) => {
                  const angle = (2 * Math.PI * i) / maxDisplay - Math.PI / 2
                  const ex = cx + radius * Math.cos(angle)
                  const ey = cy + radius * Math.sin(angle)
                  const dist = Math.sqrt((x - ex) ** 2 + (y - ey) ** 2)
                  if (dist < minDist) {
                    minDist = dist
                    closest = entity.id
                  }
                })
                setSelectedEntity(closest === selectedEntity ? null : closest)
              }}
            />
          </div>

          {/* Entity List */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('graphPage.entityList')}</h3>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
              {entities.slice(0, 100).map((entity) => (
                <button
                  key={entity.id}
                  onClick={() =>
                    setSelectedEntity(
                      selectedEntity === entity.id ? null : entity.id
                    )
                  }
                  className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
                    selectedEntity === entity.id
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {entity.name}
                  <span className="ml-1 text-[10px] opacity-50">({entity.type})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Communities View */
        <div className="space-y-3">
          {communities.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              {t('graphPage.notEnoughForCommunities')}
            </div>
          ) : (
            communities.map((community) => (
              <div
                key={community.communityId}
                className="p-4 bg-white border border-gray-100 rounded-xl"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      {community.communityId}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    {community.title}
                  </h3>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed mb-3">
                  {community.summary}
                </p>
                <div className="flex flex-wrap gap-1">
                  {community.entities.slice(0, 10).map((eid) => {
                    const entity = entities.find((e) => e.id === eid)
                    return entity ? (
                      <span
                        key={eid}
                        className="px-2 py-0.5 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 rounded text-xs"
                      >
                        {entity.name}
                      </span>
                    ) : null
                  })}
                  {community.entities.length > 10 && (
                    <span className="text-xs text-gray-400">
                      {t('graphPage.more', { n: community.entities.length - 10 })}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

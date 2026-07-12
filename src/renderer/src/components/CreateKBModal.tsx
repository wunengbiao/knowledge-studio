import type { KnowledgeBase } from '@shared/types'
import {
  BookOpen,
  BrainCircuit,
  FolderOpen,
  Globe,
  Loader2,
  Plus,
  Scale,
  Stethoscope
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type TranslationKey, useTranslation } from '../i18n'
import { useKBStore } from '../stores/kb-store'
import { KB_ICONS, KB_ICON_NAMES } from './kb-icon'

const categoryConfig: Record<
  KnowledgeBase['category'],
  { icon: typeof BookOpen; labelKey: TranslationKey }
> = {
  general: { icon: BookOpen, labelKey: 'category.general' },
  technical: { icon: BrainCircuit, labelKey: 'category.technical' },
  research: { icon: Globe, labelKey: 'category.research' },
  legal: { icon: Scale, labelKey: 'category.legal' },
  medical: { icon: Stethoscope, labelKey: 'category.medical' },
  custom: { icon: FolderOpen, labelKey: 'category.custom' }
}

const DEFAULT_CHUNK_SIZE = 1000
const DEFAULT_CHUNK_OVERLAP = 2

export function CreateKBModal() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { createModalOpen, closeCreateModal, createKB, settings } = useKBStore()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<KnowledgeBase['category']>('general')
  const [embeddingRef, setEmbeddingRef] = useState('')
  const [chunkSize, setChunkSize] = useState(DEFAULT_CHUNK_SIZE)
  const [chunkOverlap, setChunkOverlap] = useState(DEFAULT_CHUNK_OVERLAP)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [icon, setIcon] = useState<string | null>(null)

  // Pre-fill embedding fields from global settings when the modal opens.
  // Embedding config is locked after creation, so we want the user's
  // already-configured defaults to flow in automatically.
  useEffect(() => {
    if (createModalOpen) {
      const ref = settings?.activeEmbeddingModel
      setEmbeddingRef(ref ? `${ref.providerId}::${ref.modelId}` : '')
      setError(null)
    }
  }, [createModalOpen, settings])

  // Reset form on close so the next open starts clean.
  useEffect(() => {
    if (!createModalOpen) {
      setName('')
      setDescription('')
      setCategory('general')
      setEmbeddingRef('')
      setChunkSize(DEFAULT_CHUNK_SIZE)
      setChunkOverlap(DEFAULT_CHUNK_OVERLAP)
      setError(null)
      setIcon(null)
    }
  }, [createModalOpen])

  if (!createModalOpen) return null

  const canSubmit = name.trim().length > 0 && embeddingRef.trim().length > 0 && !creating

  const handleSubmit = async () => {
    if (!canSubmit) return
    setCreating(true)
    setError(null)
    try {
      const [providerId, ...rest] = embeddingRef.split('::')
      const modelId = rest.join('::')
      const provider = settings?.providers.find((p) => p.id === providerId)
      if (!provider) {
        setError(t('createKb.embeddingProviderNotFound'))
        return
      }
      const apiUrl = `${provider.apiHost.replace(/\/+$/, '')}/embeddings`
      const kb = await createKB({
        name: name.trim(),
        description: description.trim(),
        category,
        icon: icon ?? undefined,
        embeddingApiUrl: apiUrl,
        embeddingApiKey: provider.apiKey,
        embeddingModel: modelId,
        chunkSize,
        chunkOverlap
      })
      closeCreateModal()
      navigate(`/kb/${kb.id}`)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t('createKb.createFailed')
      setError(message)
    } finally {
      setCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !creating) {
      closeCreateModal()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 no-drag"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Plus className="w-4 h-4 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">{t('createKb.title')}</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('createKb.name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('createKb.enterKbName')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) handleSubmit()
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('createKb.description')}{' '}
              <span className="text-gray-400 font-normal">{t('common.optional')}</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('createKb.shortDesc')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('createKb.category')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(categoryConfig) as KnowledgeBase['category'][]).map((cat) => {
                const cfg = categoryConfig[cat]
                const Icon = cfg.icon
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs transition-all ${
                      category === cat
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {t(cfg.labelKey)}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('createKb.icon')}{' '}
              <span className="text-gray-400 font-normal">{t('createKb.iconDesc')}</span>
            </label>
            <div className="grid grid-cols-10 gap-1.5">
              {KB_ICON_NAMES.map((iconName) => {
                const IconComp = KB_ICONS[iconName]
                const selected = icon === iconName
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setIcon(selected ? null : iconName)}
                    title={iconName}
                    className={`flex items-center justify-center p-2 rounded-lg border transition-all ${
                      selected
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <IconComp className="w-4 h-4" />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="text-sm font-medium text-gray-700 mb-1">{t('createKb.chunking')}</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {t('createKb.chunkSize')}
                </label>
                <input
                  type="number"
                  min={50}
                  value={chunkSize}
                  onChange={(e) =>
                    setChunkSize(Number.parseInt(e.target.value) || DEFAULT_CHUNK_SIZE)
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {t('createKb.chunkOverlap')}
                </label>
                <input
                  type="number"
                  min={0}
                  value={chunkOverlap}
                  onChange={(e) => setChunkOverlap(Number.parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-gray-700">
                {t('createKb.embeddingModel')}
              </span>
              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                {t('createKb.lockedAfterCreate')}
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-3">{t('createKb.embeddingDesc')}</p>
            {(() => {
              const options: {
                providerName: string
                models: { value: string; label: string }[]
              }[] = []
              for (const p of settings?.providers ?? []) {
                const models = p.models.filter((m) => m.capabilities.embedding && m.id.trim())
                if (models.length === 0) continue
                options.push({
                  providerName: p.name,
                  models: models.map((m) => ({
                    value: `${p.id}::${m.id}`,
                    label: m.name ? `${m.id} · ${m.name}` : m.id
                  }))
                })
              }
              return options.length > 0 ? (
                <select
                  value={embeddingRef}
                  onChange={(e) => setEmbeddingRef(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{t('createKb.notSelected')}</option>
                  {options.map((g) => (
                    <optgroup key={g.providerName} label={g.providerName}>
                      {g.models.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-gray-400 px-1">
                  {t('createKb.noEmbeddingCapability')}
                </div>
              )
            })()}
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={() => closeCreateModal()}
            disabled={creating}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('common.create')}
          </button>
        </div>
      </div>
    </div>
  )
}

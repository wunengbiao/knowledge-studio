import type { Document, KnowledgeBase } from '@shared/types'
import {
  ArrowLeft,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  FileType,
  FolderOpen,
  Globe,
  Layers,
  Link,
  ListOrdered,
  Loader2,
  Pencil,
  RefreshCw,
  Scale,
  Search,
  Share2,
  Stethoscope,
  Trash2,
  Upload,
  XCircle
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation, type TranslationKey } from '../i18n'
import { useDocStore } from '../stores/doc-store'
import { useGraphStore } from '../stores/graph-store'
import { useKBStore } from '../stores/kb-store'

const categoryIcons: Record<KnowledgeBase['category'], typeof BookOpen> = {
  general: BookOpen,
  technical: BrainCircuit,
  research: Globe,
  legal: Scale,
  medical: Stethoscope,
  custom: FolderOpen
}

const categoryLabels: Record<KnowledgeBase['category'], TranslationKey> = {
  general: 'category.general',
  technical: 'category.technical',
  research: 'category.research',
  legal: 'category.legal',
  medical: 'category.medical',
  custom: 'category.custom'
}

const embeddingStatusBadge: Record<
  Document['embeddingStatus'],
  { labelKey: TranslationKey; className: string; icon: typeof CheckCircle2 }
> = {
  pending: { labelKey: 'kbPage.statusPending', className: 'bg-gray-100 text-gray-500', icon: Clock },
  processing: { labelKey: 'kbPage.statusProcessing', className: 'bg-blue-100 text-blue-600', icon: Loader2 },
  done: { labelKey: 'kbPage.statusDone', className: 'bg-emerald-100 text-emerald-600', icon: CheckCircle2 },
  failed: { labelKey: 'kbPage.statusFailed', className: 'bg-red-100 text-red-600', icon: XCircle }
}

export function KnowledgeBasePage() {
  const { kbId } = useParams<{ kbId: string }>()
  const navigate = useNavigate()
  const { knowledgeBases, updateKB, settings } = useKBStore()
  const {
    documents,
    uploading,
    uploadProgress,
    docEmbeddingProgress,
    loadDocuments,
    uploadFile,
    importUrl,
    deleteDocument,
    retryEmbedding
  } = useDocStore()
  const { graphBuilt, building, buildProgress, loadGraph, buildGraph } = useGraphStore()
  const [urlInput, setUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCategory, setEditCategory] = useState<KnowledgeBase['category']>('general')
  const [editChunkSize, setEditChunkSize] = useState(500)
  const [editChunkOverlap, setEditChunkOverlap] = useState(50)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editRerankRef, setEditRerankRef] = useState('')

  const { t } = useTranslation()
  const kb = knowledgeBases.find((k) => k.id === kbId)

  useEffect(() => {
    if (kbId) {
      loadDocuments(kbId)
      loadGraph(kbId)
    }
  }, [kbId])

  const openEdit = () => {
    if (!kb) return
    setEditName(kb.name)
    setEditDesc(kb.description)
    setEditCategory(kb.category)
    setEditChunkSize(kb.chunkSize)
    setEditChunkOverlap(kb.chunkOverlap)
    setEditRerankRef(
      kb.rerankModelRef ? `${kb.rerankModelRef.providerId}::${kb.rerankModelRef.modelId}` : ''
    )
    setEditError(null)
    setEditOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!kb || !editName.trim()) return
    setSaving(true)
    setEditError(null)
    try {
      const rerankModelRef = editRerankRef
        ? (() => {
            const [providerId, ...rest] = editRerankRef.split('::')
            return { providerId, modelId: rest.join('::') }
          })()
        : null
      await updateKB(kb.id, {
        name: editName.trim(),
        description: editDesc.trim(),
        category: editCategory,
        chunkSize: editChunkSize,
        chunkOverlap: editChunkOverlap,
        rerankModelRef
      })
      setEditOpen(false)
    } catch (e: any) {
      setEditError(e?.message || t('kbPage.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleImportUrl = async () => {
    if (!urlInput.trim() || !kbId) return
    await importUrl(kbId, urlInput.trim())
    setUrlInput('')
    setShowUrlInput(false)
  }

  if (!kb) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">{t('kbPage.notFound')}</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate('/')}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{kb.name}</h1>
          {kb.description && <p className="text-sm text-gray-400 mt-0.5">{kb.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openEdit}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
          >
            <Pencil className="w-4 h-4" />
            {t('kbPage.edit')}
          </button>
          <button
            onClick={() => navigate(`/kb/${kbId}/search`)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-sm"
          >
            <Search className="w-4 h-4" />
            {t('kbPage.search')}
          </button>
          <button
            onClick={() => navigate(`/kb/${kbId}/graph`)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
          >
            <Share2 className="w-4 h-4" />
            {t('kbPage.knowledgeGraph')}
          </button>
        </div>
      </div>

      {/* Upload Area */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => kbId && uploadFile(kbId, 'docx')}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-white border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 transition-all disabled:opacity-50"
          >
            <FileText className="w-4 h-4 text-blue-500" />
            {t('kbPage.uploadDocx')}
          </button>
          <button
            onClick={() => kbId && uploadFile(kbId, 'pdf')}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-white border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 transition-all disabled:opacity-50"
          >
            <FileType className="w-4 h-4 text-red-500" />
            {t('kbPage.uploadPdf')}
          </button>
          <button
            onClick={() => kbId && uploadFile(kbId, 'text')}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-white border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 transition-all disabled:opacity-50"
          >
            <FileText className="w-4 h-4 text-gray-500" />
            {t('kbPage.uploadTxt')}
          </button>
          <button
            onClick={() => setShowUrlInput(!showUrlInput)}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-white border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 transition-all disabled:opacity-50"
          >
            <Globe className="w-4 h-4 text-emerald-500" />
            {t('kbPage.importWeb')}
          </button>
          <button
            onClick={() => kbId && buildGraph(kbId)}
            disabled={building || documents.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-white dark:bg-gray-900 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-all disabled:opacity-50"
          >
            <BrainCircuit className="w-4 h-4 text-blue-500" />
            {building ? t('kbPage.building') : graphBuilt ? t('kbPage.rebuildGraph') : t('kbPage.buildGraph')}
          </button>
        </div>

        {building && buildProgress && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              <span className="text-sm text-blue-700 dark:text-blue-300">{buildProgress.status}</span>
            </div>
            <div className="h-1.5 bg-blue-100 dark:bg-blue-900/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{
                  width: `${buildProgress.total > 0 ? (buildProgress.current / buildProgress.total) * 100 : 0}%`
                }}
              />
            </div>
          </div>
        )}

        {/* URL Input */}
        {showUrlInput && (
          <div className="flex gap-2 mb-4">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={t('kbPage.enterUrl')}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && handleImportUrl()}
              autoFocus
            />
            <button
              onClick={handleImportUrl}
              disabled={!urlInput.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              {t('common.import')}
            </button>
          </div>
        )}

        {/* Upload Progress */}
        {uploading && uploadProgress && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              <span className="text-sm text-blue-700">{uploadProgress.status}</span>
            </div>
            <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{
                  width: `${(uploadProgress.current / uploadProgress.total) * 100}%`
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Document List */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          {t('kbPage.documentList', { n: documents.length })}
        </h2>
        {documents.length === 0 ? (
          <div className="text-center py-12 bg-white border border-dashed border-gray-200 rounded-xl">
            <Upload className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 text-sm">{t('kbPage.uploadToStart')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3.5 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-all group"
              >
                {doc.sourceType === 'docx' ? (
                  <FileText className="w-5 h-5 text-blue-500 shrink-0" />
                ) : doc.sourceType === 'pdf' ? (
                  <FileType className="w-5 h-5 text-red-500 shrink-0" />
                ) : doc.sourceType === 'txt' || doc.sourceType === 'md' ? (
                  <FileText className="w-5 h-5 text-gray-500 shrink-0" />
                ) : (
                  <Globe className="w-5 h-5 text-emerald-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{doc.title}</div>
                  <div className="text-xs text-gray-400 truncate">
                    {doc.sourceType.toUpperCase()} · {t('kbPage.chunkCount', { n: doc.chunks.length })} ·{' '}
                    {new Date(doc.createdAt).toLocaleDateString('zh-CN')}
                  </div>
                  {docEmbeddingProgress[doc.id] && docEmbeddingProgress[doc.id].total > 0 && (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-blue-100 rounded-full overflow-hidden max-w-[160px]">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-300"
                          style={{
                            width: `${(docEmbeddingProgress[doc.id].current / docEmbeddingProgress[doc.id].total) * 100}%`
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-blue-500">
                        {docEmbeddingProgress[doc.id].current}/{docEmbeddingProgress[doc.id].total}
                      </span>
                    </div>
                  )}
                </div>
                {(() => {
                  const badge = embeddingStatusBadge[doc.embeddingStatus]
                  const Icon = badge.icon
                  const isProcessing = doc.embeddingStatus === 'processing'
                  return doc.embeddingStatus === 'failed' ? (
                    <button
                      onClick={() => retryEmbedding(doc.id)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      {t('common.retry')}
                    </button>
                  ) : (
                    <span
                      className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${badge.className}`}
                    >
                      <Icon className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} />
                      {t(badge.labelKey)}
                    </span>
                  )
                })()}
                <button
                  onClick={() => deleteDocument(doc.id)}
                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 no-drag">
          <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('kbPage.editKb')}</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('kbPage.name')}</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={t('kbPage.enterKbName')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('kbPage.description')}</label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder={t('kbPage.shortDescOptional')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('kbPage.category')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(categoryLabels) as KnowledgeBase['category'][]).map((cat) => {
                    const Icon = categoryIcons[cat]
                    return (
                      <button
                        key={cat}
                        onClick={() => setEditCategory(cat)}
                        className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs transition-all ${
                          editCategory === cat
                            ? 'border-blue-300 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {t(categoryLabels[cat])}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div className="text-sm font-medium text-gray-700 mb-1">{t('kbPage.chunking')}</div>
                <p className="text-xs text-gray-400 mb-3">
                  {t('kbPage.chunkingNote')}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                       {t('kbPage.chunkSize')}
                    </label>
                    <input
                      type="number"
                      min={50}
                      value={editChunkSize}
                      onChange={(e) => setEditChunkSize(Number.parseInt(e.target.value) || 500)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                       {t('kbPage.chunkOverlap')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editChunkOverlap}
                      onChange={(e) => setEditChunkOverlap(Number.parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Cpu className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">{t('kbPage.embeddingModel')}</span>
                  <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                    {t('kbPage.notEditable')}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  {t('kbPage.embeddingLocked')}
                </p>
                <select
                  disabled
                  value=""
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
                >
                  <option value="">{kb.embeddingModel || '-'}</option>
                </select>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <ListOrdered className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">{t('kbPage.rerankModel')}</span>
                  <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                    {t('kbPage.optionalRerank')}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  {t('kbPage.rerankDesc')}
                </p>
                {(() => {
                  const options: {
                    providerName: string
                    models: { value: string; label: string }[]
                  }[] = []
                  for (const p of settings?.providers ?? []) {
                    const models = p.models.filter((m) => m.capabilities.rerank && m.id.trim())
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
                      value={editRerankRef}
                      onChange={(e) => setEditRerankRef(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">{t('kbPage.notSpecifiedNoRerank')}</option>
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
                      {t('kbPage.noRerankCapability')}
                    </div>
                  )
                })()}
              </div>

              {editError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                  {editError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setEditOpen(false)}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editName.trim() || saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

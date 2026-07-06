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
import { useKBStore } from '../stores/kb-store'

const categoryConfig: Record<KnowledgeBase['category'], { icon: typeof BookOpen; label: string }> =
  {
    general: { icon: BookOpen, label: '通用' },
    technical: { icon: BrainCircuit, label: '技术' },
    research: { icon: Globe, label: '研究' },
    legal: { icon: Scale, label: '法律' },
    medical: { icon: Stethoscope, label: '医学' },
    custom: { icon: FolderOpen, label: '自定义' }
  }

const DEFAULT_CHUNK_SIZE = 500
const DEFAULT_CHUNK_OVERLAP = 50

export function CreateKBModal() {
  const navigate = useNavigate()
  const { createModalOpen, closeCreateModal, createKB, settings } = useKBStore()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<KnowledgeBase['category']>('general')
  const [embeddingApiUrl, setEmbeddingApiUrl] = useState('')
  const [embeddingApiKey, setEmbeddingApiKey] = useState('')
  const [embeddingModel, setEmbeddingModel] = useState('')
  const [chunkSize, setChunkSize] = useState(DEFAULT_CHUNK_SIZE)
  const [chunkOverlap, setChunkOverlap] = useState(DEFAULT_CHUNK_OVERLAP)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-fill embedding fields from global settings when the modal opens.
  // Embedding config is locked after creation, so we want the user's
  // already-configured defaults to flow in automatically.
  useEffect(() => {
    if (createModalOpen) {
      setEmbeddingApiUrl(settings?.embeddingApiUrl ?? '')
      setEmbeddingApiKey(settings?.embeddingApiKey ?? '')
      setEmbeddingModel(settings?.embeddingModel ?? '')
      setError(null)
    }
  }, [createModalOpen, settings])

  // Reset form on close so the next open starts clean.
  useEffect(() => {
    if (!createModalOpen) {
      setName('')
      setDescription('')
      setCategory('general')
      setEmbeddingApiUrl('')
      setEmbeddingApiKey('')
      setEmbeddingModel('')
      setChunkSize(DEFAULT_CHUNK_SIZE)
      setChunkOverlap(DEFAULT_CHUNK_OVERLAP)
      setError(null)
    }
  }, [createModalOpen])

  if (!createModalOpen) return null

  const canSubmit =
    name.trim().length > 0 &&
    embeddingApiUrl.trim().length > 0 &&
    embeddingModel.trim().length > 0 &&
    !creating

  const handleSubmit = async () => {
    if (!canSubmit) return
    setCreating(true)
    setError(null)
    try {
      const kb = await createKB({
        name: name.trim(),
        description: description.trim(),
        category,
        embeddingApiUrl: embeddingApiUrl.trim(),
        embeddingApiKey: embeddingApiKey.trim(),
        embeddingModel: embeddingModel.trim(),
        chunkSize,
        chunkOverlap
      })
      closeCreateModal()
      navigate(`/kb/${kb.id}`)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '创建失败'
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
          <h2 className="text-lg font-semibold text-gray-900">新建知识库</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入知识库名称"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) handleSubmit()
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              描述 <span className="text-gray-400 font-normal">（可选）</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简短描述"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">类型</label>
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
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="text-sm font-medium text-gray-700 mb-1">文档分块</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  块大小 (字符)
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
                  重叠大小 (字符)
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
              <span className="text-sm font-medium text-gray-700">Embedding 模型</span>
              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                创建后不可修改
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              默认使用全局设置中的 Embedding 配置，可根据需要覆盖。配置在创建后锁定。
            </p>
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">模型</label>
                <input
                  type="text"
                  value={embeddingModel}
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  placeholder="如 text-embedding-3-small"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">API 地址</label>
                <input
                  type="text"
                  value={embeddingApiUrl}
                  onChange={(e) => setEmbeddingApiUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1/embeddings"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">API Key</label>
                <input
                  type="password"
                  value={embeddingApiKey}
                  onChange={(e) => setEmbeddingApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
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
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            创建
          </button>
        </div>
      </div>
    </div>
  )
}

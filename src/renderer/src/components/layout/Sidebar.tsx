import { useNavigate, useLocation } from 'react-router-dom'
import {
  Library,
  Plus,
  Search,
  Settings,
  Trash2,
  Globe,
  FileText,
  FileType,
  BrainCircuit,
  BookOpen,
  Scale,
  Stethoscope,
  FolderOpen,
  PanelLeftClose,
  Cpu
} from 'lucide-react'
import { useKBStore } from '../../stores/kb-store'
import { useState } from 'react'
import type { KnowledgeBase } from '@shared/types'

const categoryIcons: Record<KnowledgeBase['category'], typeof Library> = {
  general: BookOpen,
  technical: BrainCircuit,
  research: Globe,
  legal: Scale,
  medical: Stethoscope,
  custom: FolderOpen
}

const categoryLabels: Record<KnowledgeBase['category'], string> = {
  general: '通用',
  technical: '技术',
  research: '研究',
  legal: '法律',
  medical: '医学',
  custom: '自定义'
}

export function Sidebar({ hidden, onHide }: { hidden: boolean; onHide: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { knowledgeBases, selectedKbId, selectKB, createKB, deleteKB, createModalOpen, openCreateModal, closeCreateModal, settings } = useKBStore()
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newCategory, setNewCategory] = useState<KnowledgeBase['category']>('general')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [newChunkSize, setNewChunkSize] = useState(500)
  const [newChunkOverlap, setNewChunkOverlap] = useState(50)

  const resetForm = () => {
    setNewName('')
    setNewDesc('')
    setNewCategory('general')
    setSelectedPresetId('')
    setNewChunkSize(500)
    setNewChunkOverlap(50)
  }

  const handleCreate = async () => {
    if (!newName.trim() || !selectedPresetId) return
    const preset = settings?.embeddingPresets.find((p) => p.id === selectedPresetId)
    if (!preset) return
    const kb = await createKB({
      name: newName.trim(),
      description: newDesc.trim(),
      category: newCategory,
      embeddingApiUrl: preset.apiUrl,
      embeddingApiKey: preset.apiKey,
      embeddingModel: preset.model,
      chunkSize: newChunkSize,
      chunkOverlap: newChunkOverlap
    })
    closeCreateModal()
    resetForm()
    navigate(`/kb/${kb.id}`)
  }

  const handleClose = () => {
    closeCreateModal()
    resetForm()
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await deleteKB(id)
    if (location.pathname.includes(id)) {
      navigate('/')
    }
  }

  return (
    <aside
      className={`h-screen bg-white border-r border-gray-200 flex flex-col shrink-0 transition-all duration-200 overflow-hidden ${
        hidden ? 'w-0 border-r-0' : 'w-60'
      }`}
    >
      {/* Header */}
      <div className="drag-region h-10 shrink-0" />
      <div className="px-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2 no-drag">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Library className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm text-gray-900">RAG 知识库</span>
          <button
            type="button"
            onClick={onHide}
            title="隐藏侧边栏"
            className="ml-auto p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Create Button */}
      <div className="px-3 py-3 no-drag">
        <button
          onClick={() => openCreateModal()}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          新建知识库
        </button>
      </div>

      {/* KB List */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 no-drag">
        {knowledgeBases.map((kb) => {
          const Icon = categoryIcons[kb.category]
          const isActive = location.pathname.includes(kb.id)
          return (
            <div key={kb.id} className="group relative">
              <button
                onClick={() => navigate(`/kb/${kb.id}`)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all mb-0.5 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <div className="flex-1 text-left truncate">
                  <div className="truncate">{kb.name}</div>
                  <div className="text-[10px] text-gray-400 truncate">
                    {categoryLabels[kb.category]} · {kb.documentCount} 文档
                  </div>
                </div>
              </button>
              <button
                onClick={(e) => handleDelete(e, kb.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}

        {knowledgeBases.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            <Library className="w-8 h-8 mx-auto mb-2 opacity-30" />
            暂无知识库
            <br />
            点击上方按钮创建
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div className="border-t border-gray-100 p-2 no-drag">
        <button
          onClick={() => navigate('/settings')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
            location.pathname === '/settings'
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
          }`}
        >
          <Settings className="w-4 h-4" />
          设置
        </button>
      </div>

      {/* Create Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 no-drag">
          <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">新建知识库</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="输入知识库名称"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="简短描述（可选）"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">类型</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(categoryLabels) as KnowledgeBase['category'][]).map((cat) => {
                    const Icon = categoryIcons[cat]
                    return (
                      <button
                        key={cat}
                        onClick={() => setNewCategory(cat)}
                        className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs transition-all ${
                          newCategory === cat
                            ? 'border-blue-300 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {categoryLabels[cat]}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Cpu className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">Embedding 模型</span>
                  <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                    创建后不可修改
                  </span>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  从已保存的预设中选择，该知识库所有分片将使用此配置生成向量。
                </p>

                {settings && settings.embeddingPresets.length > 0 ? (
                  <select
                    value={selectedPresetId}
                    onChange={(e) => setSelectedPresetId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">选择 Embedding 预设...</option>
                    {settings.embeddingPresets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.model})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
                    暂无 Embedding 预设，请先前往
                    <button
                      type="button"
                      onClick={() => {
                        handleClose()
                        navigate('/settings')
                      }}
                      className="text-blue-600 hover:underline mx-0.5"
                    >
                      设置
                    </button>
                    添加预设。
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div className="text-sm font-medium text-gray-700 mb-1">文档分块</div>
                <p className="text-xs text-gray-400 mb-3">
                  控制文档切片大小与相邻分片的重叠字符数。
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      块大小 (字符)
                    </label>
                    <input
                      type="number"
                      min={50}
                      value={newChunkSize}
                      onChange={(e) => setNewChunkSize(parseInt(e.target.value) || 500)}
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
                      value={newChunkOverlap}
                      onChange={(e) => setNewChunkOverlap(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || !selectedPresetId}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

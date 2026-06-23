import type { KnowledgeBase } from '@shared/types'
import {
  ArrowUpRight,
  BookOpen,
  BrainCircuit,
  FolderOpen,
  Globe,
  Library,
  Scale,
  Stethoscope,
  Trash2
} from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useKBStore } from '../stores/kb-store'

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

export function KBManagementPage() {
  const navigate = useNavigate()
  const { knowledgeBases, loadKnowledgeBases, deleteKB } = useKBStore()

  useEffect(() => {
    loadKnowledgeBases()
  }, [])

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await deleteKB(id)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto h-[calc(100vh-40px)] overflow-y-auto no-drag">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">知识库管理</h1>

      <div className="space-y-3">
        {knowledgeBases.map((kb) => {
          const Icon = categoryIcons[kb.category]
          return (
            <div
              key={kb.id}
              onClick={() => navigate(`/kb/${kb.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/kb/${kb.id}`)}
              role="button"
              tabIndex={0}
              className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-200 hover:shadow-sm cursor-pointer transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-blue-600" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-900 truncate">{kb.name}</span>
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                    {categoryLabels[kb.category]}
                  </span>
                </div>
                {kb.description && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{kb.description}</p>
                )}
                <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                  <span>{kb.documentCount} 文档</span>
                  <span>{new Date(kb.createdAt).toLocaleDateString('zh-CN')}</span>
                  <span>模型: {kb.embeddingModel}</span>
                </div>
              </div>

              <button
                onClick={() => navigate(`/kb/${kb.id}`)}
                className="p-2 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
                title="进入知识库"
              >
                <ArrowUpRight className="w-4 h-4" />
              </button>

              <button
                onClick={(e) => handleDelete(e, kb.id)}
                className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )
        })}

        {knowledgeBases.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Library className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无知识库</p>
            <button
              onClick={() => navigate('/')}
              className="mt-3 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all"
            >
              创建知识库
            </button>
          </div>
        )}
      </div>

      {knowledgeBases.length > 0 && (
        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all"
          >
            新建知识库
          </button>
        </div>
      )}
    </div>
  )
}

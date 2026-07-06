import type { KnowledgeBase } from '@shared/types'
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  FolderOpen,
  Globe,
  Library,
  Plus,
  Scale,
  Stethoscope
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { CreateKBModal } from '../components/CreateKBModal'
import { useKBStore } from '../stores/kb-store'

const categoryConfig: Record<
  KnowledgeBase['category'],
  { icon: typeof Library; label: string; color: string; desc: string }
> = {
  general: {
    icon: BookOpen,
    label: '通用',
    color: 'bg-blue-50 text-blue-600',
    desc: '适用于各类文档的综合知识库'
  },
  technical: {
    icon: BrainCircuit,
    label: '技术',
    color: 'bg-purple-50 text-purple-600',
    desc: '技术文档、代码、API 参考'
  },
  research: {
    icon: Globe,
    label: '研究',
    color: 'bg-emerald-50 text-emerald-600',
    desc: '论文、研究报告、学术资料'
  },
  legal: {
    icon: Scale,
    label: '法律',
    color: 'bg-amber-50 text-amber-600',
    desc: '合同、法规、法律文书'
  },
  medical: {
    icon: Stethoscope,
    label: '医学',
    color: 'bg-rose-50 text-rose-600',
    desc: '医学文献、临床指南'
  },
  custom: {
    icon: FolderOpen,
    label: '自定义',
    color: 'bg-gray-50 text-gray-600',
    desc: '自定义类型的知识库'
  }
}

export function HomePage() {
  const navigate = useNavigate()
  const { knowledgeBases, openCreateModal } = useKBStore()

  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      {/* Hero */}
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">RAG 知识库</h1>
        <p className="text-gray-500 text-base leading-relaxed max-w-xl">
          本地优先的知识管理工具，支持 BM25 + 向量嵌入 + 重排序混合检索， 结合 GraphRAG
          技术实现知识图谱增强搜索。
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        <button
          onClick={() => openCreateModal()}
          className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
            <Plus className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-gray-900">新建知识库</div>
            <div className="text-xs text-gray-400">创建新的知识空间</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
            <BrainCircuit className="w-5 h-5 text-purple-600" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-gray-900">配置模型</div>
            <div className="text-xs text-gray-400">设置 Embedding API</div>
          </div>
        </button>

        <div className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Library className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-gray-900">
              {knowledgeBases.length} 个知识库
            </div>
            <div className="text-xs text-gray-400">
              {knowledgeBases.reduce((sum, kb) => sum + kb.documentCount, 0)} 份文档
            </div>
          </div>
        </div>
      </div>

      {/* Knowledge Bases */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">我的知识库</h2>
        {knowledgeBases.length === 0 ? (
          <div className="text-center py-16 bg-white border border-dashed border-gray-200 rounded-xl">
            <Library className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 text-sm mb-4">还没有知识库，开始创建第一个吧</p>
            <button
              onClick={() => openCreateModal()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              新建知识库
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {knowledgeBases.map((kb) => {
              const config = categoryConfig[kb.category]
              const Icon = config.icon
              return (
                <button
                  key={kb.id}
                  onClick={() => navigate(`/kb/${kb.id}`)}
                  className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all text-left group"
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${config.color}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 truncate">{kb.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                        {config.label}
                      </span>
                    </div>
                    {kb.description && (
                      <p className="text-xs text-gray-400 truncate mb-1">{kb.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>{kb.documentCount} 文档</span>
                      <span>{new Date(kb.updatedAt).toLocaleDateString('zh-CN')}</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all mt-2" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      <CreateKBModal />
    </div>
  )
}

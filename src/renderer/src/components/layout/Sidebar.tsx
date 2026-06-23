import type { KnowledgeBase } from '@shared/types'
import {
  BookOpen,
  BrainCircuit,
  FolderOpen,
  Globe,
  Library,
  MessageSquare,
  PanelLeftClose,
  Plus,
  Scale,
  Search,
  Settings,
  Stethoscope,
  Trash2
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useChatStore } from '../../stores/chat-store'
import { useKBStore } from '../../stores/kb-store'

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
  const { knowledgeBases, deleteKB } = useKBStore()
  const { conversations, loadConversations, createConversation, deleteConversation } =
    useChatStore()

  useEffect(() => {
    loadConversations()
  }, [])

  const handleNewConversation = async () => {
    const id = await createConversation()
    navigate(`/chat/${id}`)
  }

  const handleDeleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await deleteConversation(id)
    if (location.pathname === `/chat/${id}`) {
      navigate('/chat')
    }
  }

  const handleDeleteKB = async (e: React.MouseEvent, id: string) => {
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

      {/* KB Management Button */}
      <div className="px-3 pt-3 no-drag">
        <button
          onClick={() => navigate('/kb-management')}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
            location.pathname === '/kb-management'
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <Library className="w-4 h-4" />
          知识库管理
        </button>
      </div>

      {/* Conversations Section */}
      <div className="px-3 pt-4 pb-1 no-drag">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">对话</span>
          <button
            onClick={handleNewConversation}
            title="新建对话"
            className="p-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-1 no-drag">
        {/* Conversation List */}
        {conversations.map((conv) => {
          const isActive = location.pathname === `/chat/${conv.id}`
          return (
            <div key={conv.id} className="group relative">
              <button
                onClick={() => navigate(`/chat/${conv.id}`)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all mb-0.5 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <div className="flex-1 text-left truncate">
                  <div className="truncate">{conv.name}</div>
                  <div className="text-[10px] text-gray-400">{conv.messageCount} 条消息</div>
                </div>
              </button>
              <button
                onClick={(e) => handleDeleteConversation(e, conv.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}

        {conversations.length === 0 && (
          <div className="text-center py-6 text-gray-400 text-xs">
            <MessageSquare className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
            暂无对话
          </div>
        )}

        {/* KB List */}
        <div className="pt-4 pb-1 px-1">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">知识库</span>
        </div>
        {knowledgeBases.map((kb) => {
          const Icon = categoryIcons[kb.category]
          const isActive =
            location.pathname.includes(kb.id) && !location.pathname.startsWith('/chat')
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
                onClick={(e) => handleDeleteKB(e, kb.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}

        {knowledgeBases.length === 0 && (
          <div className="text-center py-6 text-gray-400 text-xs">
            <Library className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
            暂无知识库
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
    </aside>
  )
}

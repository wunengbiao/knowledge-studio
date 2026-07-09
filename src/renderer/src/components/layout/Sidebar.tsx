import type { KnowledgeBase } from '@shared/types'
import {
  BookOpen,
  BrainCircuit,
  FolderOpen,
  Globe,
  Library,
  MessageSquare,
  Moon,
  PanelLeftClose,
  Plus,
  Scale,
  Search,
  Settings,
  Stethoscope,
  Sun,
  Trash2
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from '../../i18n'
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

const categoryKeys = {
  general: 'category.general',
  technical: 'category.technical',
  research: 'category.research',
  legal: 'category.legal',
  medical: 'category.medical',
  custom: 'category.custom'
} as const

export function Sidebar({ hidden, onHide }: { hidden: boolean; onHide: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const { knowledgeBases, deleteKB, settings, updateSettings } = useKBStore()
  const { conversations, loadConversations, createConversation, deleteConversation } =
    useChatStore()

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  const handleNewConversation = async () => {
    const id = await createConversation()
    navigate(`/chat/${id}`)
  }

  const handleDeleteConversation = async (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    await deleteConversation(id)
    if (location.pathname === `/chat/${id}`) {
      navigate('/chat')
    }
  }

  const handleDeleteKB = async (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    await deleteKB(id)
    if (location.pathname.includes(id)) {
      navigate('/')
    }
  }

  const currentTheme = settings?.theme ?? 'light'
  const toggleTheme = () => {
    void updateSettings({ theme: currentTheme === 'dark' ? 'light' : 'dark' })
  }

  return (
    <aside
      className={`h-screen bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 flex flex-col shrink-0 transition-all duration-200 overflow-hidden ${
        hidden ? 'w-0 border-r-0' : 'w-60'
      }`}
    >
      {/* Header */}
      <div className="drag-region h-10 shrink-0" />
      <div className="px-4 pb-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 no-drag">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
            <Library className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
            {t('sidebar.title')}
          </span>
          <button
            type="button"
            onClick={onHide}
            title={t('sidebar.hideSidebar')}
            className="ml-auto p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KB Management Button */}
      <div className="px-3 pt-3 no-drag">
        <button
          type="button"
          onClick={() => navigate('/')}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
            location.pathname === '/'
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          <Library className="w-4 h-4" />
          {t('sidebar.kbManagement')}
        </button>
      </div>

      {/* Conversations Section */}
      <div className="px-3 pt-4 pb-1 no-drag">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            {t('sidebar.conversations')}
          </span>
          <button
            type="button"
            onClick={handleNewConversation}
            title={t('sidebar.newConversation')}
            className="p-1 rounded-md text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
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
                type="button"
                onClick={() => navigate(`/chat/${conv.id}`)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all mb-0.5 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 font-medium'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <div className="flex-1 text-left truncate">
                  <div className="truncate">{conv.name}</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">
                    {t('sidebar.messageCount', { n: conv.messageCount })}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => handleDeleteConversation(e, conv.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-950/50 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}

        {conversations.length === 0 && (
          <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-xs">
            <MessageSquare className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
            {t('sidebar.noConversations')}
          </div>
        )}

        {/* KB List */}
        <div className="pt-4 pb-1 px-1">
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            {t('sidebar.knowledgeBases')}
          </span>
        </div>
        {knowledgeBases.map((kb) => {
          const Icon = categoryIcons[kb.category]
          const isActive =
            location.pathname.includes(kb.id) && !location.pathname.startsWith('/chat')
          return (
            <div key={kb.id} className="group relative">
              <button
                type="button"
                onClick={() => navigate(`/kb/${kb.id}`)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all mb-0.5 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 font-medium'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <div className="flex-1 text-left truncate">
                  <div className="truncate">{kb.name}</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                    {t(categoryKeys[kb.category])} ·{' '}
                    {t('sidebar.documentCount', { n: kb.documentCount })}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => handleDeleteKB(e, kb.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-950/50 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}

        {knowledgeBases.length === 0 && (
          <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-xs">
            <Library className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
            {t('sidebar.noKnowledgeBases')}
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div className="border-t border-gray-100 dark:border-gray-800 p-2 no-drag">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
              location.pathname === '/settings'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <Settings className="w-4 h-4" />
            {t('sidebar.settings')}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            title={currentTheme === 'dark' ? t('settings.themeLight') : t('settings.themeDark')}
            className="shrink-0 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            {currentTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </aside>
  )
}

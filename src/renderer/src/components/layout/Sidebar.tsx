import { Archive, Library, MessageSquare, Moon, Plus, Search, Settings, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from '../../i18n'
import { useChatStore } from '../../stores/chat-store'
import { useKBStore } from '../../stores/kb-store'
import { ConversationActions } from './ConversationActions'
import { MarqueeText } from './MarqueeText'

export function Sidebar({
  hidden,
  width,
  dragging
}: { hidden: boolean; width: number; dragging: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const { settings, updateSettings } = useKBStore()
  const {
    conversations,
    loadConversations,
    createConversation,
    deleteConversation,
    archiveConversation
  } = useChatStore()

  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null)

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  const handleNewConversation = async () => {
    const id = await createConversation()
    navigate(`/chat/${id}`)
  }

  const handleDeleteConversation = async (id: string) => {
    await deleteConversation(id)
    if (location.pathname === `/chat/${id}`) {
      navigate('/chat')
    }
  }

  const handleArchiveConversation = async (id: string) => {
    await archiveConversation(id)
    if (location.pathname === `/chat/${id}`) {
      navigate('/chat')
    }
  }

  const currentTheme = settings?.theme ?? 'light'
  const toggleTheme = () => {
    void updateSettings({ theme: currentTheme === 'dark' ? 'light' : 'dark' })
  }

  return (
    <aside
      className="h-screen bg-white dark:bg-gray-950 flex flex-col shrink-0 transition-all duration-200 overflow-hidden"
      style={{
        width: hidden ? 0 : width,
        transitionDuration: dragging ? '0ms' : undefined
      }}
    >
      {/* Header */}
      <div className="drag-region h-10 shrink-0" />
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 no-drag">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
            <Library className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
            {t('sidebar.title')}
          </span>
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
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => navigate('/archived')}
              title={t('sidebar.archived')}
              className={`p-1 rounded-md transition-colors ${
                location.pathname === '/archived'
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50'
                  : 'text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
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
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-1 no-drag">
        {/* Conversation List */}
        {conversations.map((conv) => {
          const isActive = location.pathname === `/chat/${conv.id}`
          return (
            <div
              key={conv.id}
              className="group relative"
              onMouseEnter={() => setHoveredConvId(conv.id)}
              onMouseLeave={() => setHoveredConvId((id) => (id === conv.id ? null : id))}
            >
              <button
                type="button"
                onClick={() => navigate(`/chat/${conv.id}`)}
                className={`w-full flex items-center gap-2.5 pl-3 pr-9 py-2 rounded-lg text-sm transition-all mb-0.5 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 font-medium'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <div className="flex-1 min-w-0 text-left overflow-hidden">
                  <MarqueeText text={conv.name} playing={hoveredConvId === conv.id} />
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">
                    {t('sidebar.messageCount', { n: conv.messageCount })}
                  </div>
                </div>
              </button>
              <ConversationActions
                onArchive={() => handleArchiveConversation(conv.id)}
                onDelete={() => handleDeleteConversation(conv.id)}
              />
            </div>
          )
        })}

        {conversations.length === 0 && (
          <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-xs">
            <MessageSquare className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
            {t('sidebar.noConversations')}
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div className="p-2 no-drag">
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

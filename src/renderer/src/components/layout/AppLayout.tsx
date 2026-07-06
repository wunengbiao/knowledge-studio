import { Loader2, MessageSquare, PanelLeftOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAssistantStore } from '../../stores/assistant-store'
import { useChatStore } from '../../stores/chat-store'
import { useDocStore } from '../../stores/doc-store'
import { useKBStore } from '../../stores/kb-store'
import { AssistantSelector } from '../assistant/AssistantSettingsPanel'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  const location = useLocation()
  const { loadKnowledgeBases, loadSettings } = useKBStore()
  const { assistants, loadAssistants } = useAssistantStore()
  const { backfillProgress, subscribeProgress } = useDocStore()
  const conversations = useChatStore((s) => s.conversations)
  const currentConversationId = useChatStore((s) => s.currentConversationId)
  const setConversationAssistant = useChatStore((s) => s.setConversationAssistant)
  const [sidebarHidden, setSidebarHidden] = useState(false)

  useEffect(() => {
    loadKnowledgeBases()
    loadSettings()
    loadAssistants()
    const cleanup = subscribeProgress()
    return cleanup
  }, [loadAssistants, loadKnowledgeBases, loadSettings, subscribeProgress])

  const isHome = location.pathname === '/'
  const isChatPage = location.pathname.startsWith('/chat')
  const shouldShowSidebar = isHome || isChatPage
  const currentConversation = conversations.find((c) => c.id === currentConversationId)
  const currentAssistant =
    assistants.find((assistant) => assistant.id === currentConversation?.assistantId) ??
    assistants[0] ??
    null

  const handleSelectAssistant = async (assistantId: string) => {
    if (!currentConversationId || !assistantId) return
    await setConversationAssistant(currentConversationId, assistantId)
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {shouldShowSidebar && (
        <Sidebar hidden={sidebarHidden} onHide={() => setSidebarHidden(true)} />
      )}
      <main className="flex-1 min-h-0 overflow-hidden bg-[#fafafa]">
        <div className="drag-region h-10 w-full fixed top-0 left-0 right-0 z-10 flex items-center">
          {isChatPage && (
            <div
              className={`h-full flex items-center transition-all duration-200 ${
                sidebarHidden ? 'pl-20' : 'pl-64'
              }`}
            >
              <div className="no-drag flex items-center gap-2 min-w-0">
                <MessageSquare className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="text-sm font-medium text-gray-900 truncate max-w-[42vw]">
                  {currentConversation?.name || '新对话'}
                </span>
              </div>
            </div>
          )}
          {isChatPage && (
            <div
              className={`pointer-events-none absolute top-0 right-0 h-full flex items-center justify-center transition-all duration-200 ${
                sidebarHidden ? 'left-0' : 'left-60'
              }`}
            >
              <div className="no-drag pointer-events-auto">
                <AssistantSelector
                  assistants={assistants}
                  currentAssistant={currentAssistant}
                  onSelect={handleSelectAssistant}
                />
              </div>
            </div>
          )}
        </div>
        {shouldShowSidebar && sidebarHidden && (
          <button
            type="button"
            onClick={() => setSidebarHidden(false)}
            title="显示侧边栏"
            className="no-drag fixed top-11 left-2 z-30 w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
        {backfillProgress && backfillProgress.total > 0 && (
          <div
            className={`fixed top-10 right-0 z-20 bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-3 transition-all duration-200 ${
              shouldShowSidebar && !sidebarHidden ? 'left-60' : 'left-0'
            }`}
          >
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
            <span className="text-sm text-blue-700 truncate">{backfillProgress.status}</span>
            <div className="flex-1 h-1.5 bg-blue-100 rounded-full overflow-hidden max-w-xs">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{
                  width: `${(backfillProgress.current / Math.max(backfillProgress.total, 1)) * 100}%`
                }}
              />
            </div>
            <span className="text-xs text-blue-500 shrink-0">
              {backfillProgress.current}/{backfillProgress.total}
            </span>
          </div>
        )}
        <div className="h-full min-h-0 pt-10">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

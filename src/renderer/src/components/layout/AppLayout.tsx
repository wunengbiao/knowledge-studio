import { Loader2, MessageSquare, PanelLeftOpen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from '../../i18n'
import { useAssistantStore } from '../../stores/assistant-store'
import { useChatStore } from '../../stores/chat-store'
import { useDocStore } from '../../stores/doc-store'
import { useKBStore } from '../../stores/kb-store'
import { AssistantSelector } from '../assistant/AssistantSettingsPanel'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  const location = useLocation()
  const { t } = useTranslation()
  const { loadKnowledgeBases, loadSettings, settings } = useKBStore()
  const { assistants, loadAssistants } = useAssistantStore()
  const { backfillProgress, subscribeProgress } = useDocStore()
  const conversations = useChatStore((s) => s.conversations)
  const currentConversationId = useChatStore((s) => s.currentConversationId)
  const setConversationAssistant = useChatStore((s) => s.setConversationAssistant)
  const renameConversation = useChatStore((s) => s.renameConversation)
  const subscribeChatProgress = useChatStore((s) => s.subscribeProgress)
  const [sidebarHidden, setSidebarHidden] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadKnowledgeBases()
    loadSettings()
    loadAssistants()
    const cleanup = subscribeProgress()
    return cleanup
  }, [loadAssistants, loadKnowledgeBases, loadSettings, subscribeProgress])

  // Global chat stream subscription - must outlive ChatPage unmount so LLM
  // output keeps flowing into the store while the user is on other pages.
  useEffect(() => {
    const cleanup = subscribeChatProgress()
    return cleanup
  }, [subscribeChatProgress])

  useEffect(() => {
    const theme = settings?.theme ?? 'light'
    document.documentElement.setAttribute('data-theme', theme)
  }, [settings?.theme])

  useEffect(() => {
    const codeTheme = settings?.codeTheme ?? 'monokai'
    document.documentElement.setAttribute('data-code-theme', codeTheme)
  }, [settings?.codeTheme])

  useEffect(() => {
    const codeFont = settings?.codeFont ?? 'system'
    document.documentElement.setAttribute('data-code-font', codeFont)
  }, [settings?.codeFont])

  useEffect(() => {
    const codeFontSize = settings?.codeFontSize ?? 'md'
    document.documentElement.setAttribute('data-code-font-size', codeFontSize)
  }, [settings?.codeFontSize])

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

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  const startEditTitle = () => {
    if (!currentConversation) return
    setTitleDraft(currentConversation.name)
    setIsEditingTitle(true)
  }

  const commitTitle = () => {
    setIsEditingTitle((wasEditing) => {
      if (!wasEditing) return false
      const id = currentConversationId
      const original = currentConversation?.name
      if (id && original) {
        const trimmed = titleDraft.trim()
        if (trimmed && trimmed !== original) {
          void renameConversation(id, trimmed)
        }
      }
      return false
    })
    setTitleDraft('')
  }

  const cancelTitle = () => {
    setIsEditingTitle((wasEditing) => {
      if (!wasEditing) return false
      return false
    })
    setTitleDraft('')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {shouldShowSidebar && (
        <Sidebar hidden={sidebarHidden} onHide={() => setSidebarHidden(true)} />
      )}
      <main className="flex-1 min-h-0 overflow-hidden bg-[#fafafa] dark:bg-gray-950">
        <div className="drag-region h-10 w-full fixed top-0 left-0 right-0 z-10 flex items-center">
          {isChatPage && (
            <div
              className={`h-full flex items-center transition-all duration-200 ${
                sidebarHidden ? 'pl-20' : 'pl-64'
              }`}
            >
              <div className="no-drag flex items-center gap-2 min-w-0">
                <MessageSquare className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" />
                {isEditingTitle ? (
                  <input
                    ref={titleInputRef}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitTitle()
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelTitle()
                      }
                    }}
                    className="text-sm font-medium text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 border border-blue-400 rounded px-1.5 py-0.5 outline-none ring-2 ring-blue-100 min-w-[120px] max-w-[42vw] h-7"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={startEditTitle}
                    disabled={!currentConversation}
                    title={currentConversation ? t('appLayout.clickToEditTitle') : ''}
                    className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[42vw] hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:hover:text-gray-900 dark:disabled:hover:text-gray-100 disabled:cursor-default text-left cursor-pointer"
                  >
                    {currentConversation?.name || t('appLayout.newConversationDefault')}
                  </button>
                )}
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
            title={t('sidebar.showSidebar')}
            className="no-drag fixed top-11 left-2 z-30 w-8 h-8 flex items-center justify-center rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
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

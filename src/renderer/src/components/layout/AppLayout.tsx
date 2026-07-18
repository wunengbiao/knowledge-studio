import type { Assistant } from '@shared/types'
import { Loader2, MessageSquare, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from '../../i18n'
import { useAssistantStore } from '../../stores/assistant-store'
import { useChatStore } from '../../stores/chat-store'
import { useDocStore } from '../../stores/doc-store'
import { useKBStore } from '../../stores/kb-store'
import {
  type AssistantFormValue,
  AssistantSelector,
  AssistantSettingsPanel
} from '../assistant/AssistantSettingsPanel'
import { AnimatedOutlet } from './AnimatedOutlet'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  const location = useLocation()
  const { t } = useTranslation()
  const { knowledgeBases, loadKnowledgeBases, loadSettings, settings, updateSettings } =
    useKBStore()
  const { assistants, loadAssistants, updateAssistant, deleteAssistant } = useAssistantStore()
  const { backfillProgress, subscribeProgress } = useDocStore()
  const conversations = useChatStore((s) => s.conversations)
  const currentConversationId = useChatStore((s) => s.currentConversationId)
  const setConversationAssistant = useChatStore((s) => s.setConversationAssistant)
  const renameConversation = useChatStore((s) => s.renameConversation)
  const subscribeChatProgress = useChatStore((s) => s.subscribeProgress)
  const [sidebarHidden, setSidebarHidden] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [assistantPanelOpen, setAssistantPanelOpen] = useState(false)
  const [savingAssistant, setSavingAssistant] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const isFirstThemeRender = useRef(true)

  const SIDEBAR_MIN_WIDTH = 200
  const SIDEBAR_MAX_WIDTH = 480
  const SIDEBAR_DEFAULT_WIDTH = 240
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [isDragging, setIsDragging] = useState(false)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    const stored = settings?.sidebarWidth
    if (typeof stored === 'number' && !isDraggingRef.current) {
      const clamped = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, stored))
      setSidebarWidth(clamped)
    }
  }, [settings?.sidebarWidth])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    setIsDragging(true)
    const startX = e.clientX
    const startWidth = sidebarWidth
    let latestWidth = startWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      const maxByViewport = Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - 320)
      const upper = Math.min(SIDEBAR_MAX_WIDTH, maxByViewport)
      const next = Math.max(SIDEBAR_MIN_WIDTH, Math.min(upper, startWidth + delta))
      latestWidth = next
      setSidebarWidth(next)
    }
    const onUp = () => {
      isDraggingRef.current = false
      setIsDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      void updateSettings({ sidebarWidth: latestWidth })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleResizeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const step = e.shiftKey ? 32 : 8
    const delta = e.key === 'ArrowLeft' ? -step : step
    const maxByViewport = Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - 320)
    const upper = Math.min(SIDEBAR_MAX_WIDTH, maxByViewport)
    const next = Math.max(SIDEBAR_MIN_WIDTH, Math.min(upper, sidebarWidth + delta))
    if (next !== sidebarWidth) {
      setSidebarWidth(next)
      void updateSettings({ sidebarWidth: next })
    }
  }

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
    if (isFirstThemeRender.current) {
      isFirstThemeRender.current = false
      document.documentElement.setAttribute('data-theme', theme)
      return
    }
    const applyTheme = () => {
      document.documentElement.setAttribute('data-theme', theme)
    }
    if (typeof document.startViewTransition !== 'function') {
      applyTheme()
      return
    }
    const transition = document.startViewTransition(applyTheme)
    void transition.finished.catch(() => {})
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

  const handleOpenEditAssistant = () => {
    if (!currentAssistant) return
    setAssistantPanelOpen(true)
  }

  const handleSaveAssistant = async (value: AssistantFormValue) => {
    if (!currentAssistant) return
    setSavingAssistant(true)
    try {
      const payload = {
        name: value.name,
        description: value.description,
        prompt: value.prompt,
        providerId: value.providerId ?? undefined,
        modelId: value.modelId ?? undefined,
        rerankModelRef: value.rerankModelRef ?? undefined,
        contextCount: value.contextCount,
        modelParams: value.modelParams,
        knowledgeBaseIds: value.knowledgeBaseIds
      }
      await updateAssistant(currentAssistant.id, payload)
      setAssistantPanelOpen(false)
    } finally {
      setSavingAssistant(false)
    }
  }

  const handleDeleteAssistant = async (assistant: Assistant) => {
    await deleteAssistant(assistant.id)
    setAssistantPanelOpen(false)
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
        <Sidebar hidden={sidebarHidden} width={sidebarWidth} dragging={isDragging} />
      )}
      {shouldShowSidebar && !sidebarHidden && (
        <div className="no-drag group relative z-30 h-screen w-2 shrink-0">
          <hr
            className="no-drag h-full w-full m-0 cursor-col-resize border-0"
            onMouseDown={handleResizeStart}
            onKeyDown={handleResizeKeyDown}
            aria-orientation="vertical"
            aria-label={t('sidebar.resize')}
            aria-valuenow={sidebarWidth}
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            tabIndex={0}
          />
          <div
            className={`pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-px transition-colors ${
              isDragging
                ? 'bg-blue-500'
                : 'bg-gray-200 group-hover:bg-gray-300 dark:bg-gray-800 dark:group-hover:bg-gray-700'
            }`}
          />
          <div
            className={`pointer-events-none absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full transition-opacity ${
              isDragging
                ? 'bg-blue-500 opacity-100'
                : 'bg-gray-400 dark:bg-gray-500 opacity-0 group-hover:opacity-100'
            }`}
          />
        </div>
      )}
      <main className="flex-1 min-h-0 overflow-hidden bg-[#fafafa] dark:bg-gray-950">
        <div className="drag-region h-10 w-full fixed top-0 left-0 right-0 z-10 flex items-center">
          {shouldShowSidebar && (
            <div
              className="h-full flex items-center transition-all duration-200"
              style={{
                paddingLeft: sidebarHidden ? 80 : sidebarWidth + 16,
                transitionDuration: isDragging ? '0ms' : undefined
              }}
            >
              <div className="no-drag flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setSidebarHidden(!sidebarHidden)}
                  title={sidebarHidden ? t('sidebar.showSidebar') : t('sidebar.hideSidebar')}
                  aria-label={sidebarHidden ? t('sidebar.showSidebar') : t('sidebar.hideSidebar')}
                  className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
                >
                  {sidebarHidden ? (
                    <PanelLeftOpen className="w-4 h-4" />
                  ) : (
                    <PanelLeftClose className="w-4 h-4" />
                  )}
                </button>
                {isChatPage && (
                  <>
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
                  </>
                )}
              </div>
            </div>
          )}
          {isChatPage && (
            <div
              className="pointer-events-none absolute top-0 right-0 h-full flex items-center justify-center transition-all duration-200"
              style={{
                left: sidebarHidden ? 0 : sidebarWidth,
                transitionDuration: isDragging ? '0ms' : undefined
              }}
            >
              <div className="no-drag pointer-events-auto">
                <AssistantSelector
                  assistants={assistants}
                  currentAssistant={currentAssistant}
                  onSelect={handleSelectAssistant}
                  onEdit={handleOpenEditAssistant}
                />
              </div>
            </div>
          )}
          {isChatPage && (
            <div
              id="titlebar-citations-slot"
              className="no-drag pointer-events-auto absolute top-0 right-3 h-full flex items-center"
            />
          )}
        </div>
        {backfillProgress && backfillProgress.total > 0 && (
          <div
            className="fixed top-10 right-0 z-20 bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-3 transition-all duration-200"
            style={{
              left: shouldShowSidebar && !sidebarHidden ? sidebarWidth : 0,
              transitionDuration: isDragging ? '0ms' : undefined
            }}
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
          <AnimatedOutlet />
        </div>
        <AssistantSettingsPanel
          open={assistantPanelOpen}
          assistant={currentAssistant}
          assistants={assistants}
          knowledgeBases={knowledgeBases}
          settings={settings}
          saving={savingAssistant}
          onClose={() => setAssistantPanelOpen(false)}
          onSave={handleSaveAssistant}
          onDelete={handleDeleteAssistant}
        />
      </main>
    </div>
  )
}

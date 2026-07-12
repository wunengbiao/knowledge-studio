import type { Message, MessageCitation, MessageImage } from '@shared/types'
import {
  AlertCircle,
  BookOpen,
  Bot,
  ExternalLink,
  FileText,
  Globe,
  Hash,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  RefreshCw,
  Send,
  Square,
  User,
  X
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { MessageActions } from '../components/chat/MessageActions'
import { ThinkingBlock } from '../components/chat/ThinkingBlock'
import { CitationTooltip, MessageMarkdown } from '../components/chat/markdown'
import { type TranslationKey, useTranslation } from '../i18n'
import { useAssistantStore } from '../stores/assistant-store'
import { useChatStore } from '../stores/chat-store'
import { useKBStore } from '../stores/kb-store'

function placeCaretAtEnd(el: HTMLElement): void {
  el.focus()
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const range = sel.getRangeAt(0)
  const preRange = range.cloneRange()
  preRange.selectNodeContents(el)
  preRange.setEnd(range.endContainer, range.endOffset)
  return preRange.toString().length
}

function readFileAsMessageImage(file: File): Promise<MessageImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const img = new window.Image()
      img.onload = () => {
        const maxDim = 1024
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height)
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve({
            dataUrl,
            mimeType: file.type,
            name: file.name,
            width: img.width,
            height: img.height
          })
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        const resized = canvas.toDataURL(mimeType, 0.85)
        resolve({ dataUrl: resized, mimeType, name: file.name, width, height })
      }
      img.onerror = () => resolve({ dataUrl, mimeType: file.type, name: file.name })
      img.src = dataUrl
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function ChatPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    currentConversationId,
    conversationMessages,
    conversations,
    streams,
    error,
    lastFailedSend,
    selectConversation,
    sendMessage,
    clearError,
    retryLastFailedSend,
    createConversation,
    clearCurrentConversation,
    deleteMessage,
    editMessage,
    updateMessageContent,
    regenerateMessage,
    abortStream,
    setDraft
  } = useChatStore()
  const { assistants, loadAssistants } = useAssistantStore()
  const { knowledgeBases, loadKnowledgeBases, settings } = useKBStore()
  const [input, setInput] = useState('')
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([])
  const [kbPickerOpen, setKbPickerOpen] = useState(false)
  const [kbPickerQuery, setKbPickerQuery] = useState('')
  const [highlightedKbIndex, setHighlightedKbIndex] = useState(0)
  const [activeCitation, setActiveCitation] = useState<{
    messageId: string
    citation: MessageCitation
  } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [attachedImages, setAttachedImages] = useState<MessageImage[]>([])
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const editableRef = useRef<HTMLDivElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  const isComposingRef = useRef(false)
  const prevConversationIdRef = useRef<string | null>(null)
  const [isComposing, setIsComposing] = useState(false)
  const [chipsWidth, setChipsWidth] = useState(0)
  const { t } = useTranslation()

  const currentConversation = conversations.find((c) => c.id === currentConversationId)
  const currentConversationKbIds = currentConversation?.kbIds ?? []
  const currentAssistant =
    assistants.find((assistant) => assistant.id === currentConversation?.assistantId) ??
    assistants[0] ??
    null
  const isStreamingCurrent = Object.values(streams).some(
    (s) => s.conversationId === currentConversationId
  )
  const streamingMessageId = useMemo(() => {
    const entry = Object.entries(streams).find(
      ([, s]) => s.conversationId === currentConversationId
    )
    return entry?.[0] ?? null
  }, [streams, currentConversationId])

  const modelSupportsImage = useMemo(() => {
    if (!settings || !currentAssistant) return false
    const provider = settings.providers.find((p) => p.id === currentAssistant.providerId)
    const model = provider?.models.find((m) => m.id === currentAssistant.modelId)
    return !!model?.inputs?.image
  }, [settings, currentAssistant])

  const toggleKb = useCallback((kbId: string) => {
    setSelectedKbIds((prev) =>
      prev.includes(kbId) ? prev.filter((id) => id !== kbId) : [...prev, kbId]
    )
  }, [])

  const selectedKbs = useMemo(
    () => knowledgeBases.filter((k) => selectedKbIds.includes(k.id)),
    [knowledgeBases, selectedKbIds]
  )

  useEffect(() => {
    loadKnowledgeBases()
    loadAssistants()
  }, [loadAssistants, loadKnowledgeBases])

  useEffect(() => {
    if (id) {
      selectConversation(id)
      return
    }
    clearCurrentConversation()
  }, [clearCurrentConversation, id, selectConversation])

  // biome-ignore lint/correctness/useExhaustiveDependencies: per-conversation draft save/load - only fires on conversation change; local state captured at switch time
  useEffect(() => {
    const prevId = prevConversationIdRef.current
    const newId = currentConversationId

    // Only save if the previous conversation still exists - it might have been
    // deleted or archived (in which case its draft is already handled by the store).
    if (prevId && prevId !== newId) {
      const prevExists = useChatStore.getState().conversations.some((c) => c.id === prevId)
      if (prevExists) {
        setDraft(prevId, {
          text: input,
          attachedImages,
          selectedKbIds,
          webSearchEnabled
        })
      }
    }

    const draft = newId ? useChatStore.getState().drafts[newId] : undefined
    if (draft) {
      setInput(draft.text)
      setAttachedImages(draft.attachedImages)
      setSelectedKbIds(draft.selectedKbIds)
      setWebSearchEnabled(draft.webSearchEnabled)
    } else {
      setInput('')
      setAttachedImages([])
      setWebSearchEnabled(false)
      // selectedKbIds is set by the KB-init effect below.
    }

    // contentEditable is imperative - React doesn't manage its textContent.
    if (editableRef.current) {
      const newText = draft ? draft.text : ''
      const hasChips = draft
        ? draft.selectedKbIds.length > 0 || draft.attachedImages.length > 0
        : false
      if (newText !== '') {
        editableRef.current.textContent = newText
      } else if (hasChips) {
        editableRef.current.textContent = '\u200B'
      } else {
        editableRef.current.textContent = ''
      }
    }

    prevConversationIdRef.current = newId
  }, [currentConversationId, setDraft])

  // Initializes KBs when no draft exists; also covers late-loading `currentAssistant`.
  useEffect(() => {
    const id = currentConversationId
    // Draft already loaded its KBs in the switch effect - don't override.
    if (id && useChatStore.getState().drafts[id]) return

    if (currentConversationKbIds.length > 0) {
      setSelectedKbIds(currentConversationKbIds)
    } else if (currentAssistant) {
      setSelectedKbIds(currentAssistant.knowledgeBaseIds)
    } else {
      setSelectedKbIds([])
    }
  }, [currentConversationId, currentConversationKbIds, currentAssistant])

  // 无依赖 effect：流式响应期间每次渲染都跟进滚动到底部；编辑消息时跳过，避免被编辑的消息被滚出视口
  useEffect(() => {
    if (editingId) return
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: chip presence drives the conditional render that mounts/unmounts chipsRef.current
  useEffect(() => {
    if (!chipsRef.current) {
      setChipsWidth(0)
      return
    }
    const updateWidth = () => {
      if (chipsRef.current) setChipsWidth(chipsRef.current.offsetWidth)
    }
    updateWidth()
    const ro = new ResizeObserver(updateWidth)
    ro.observe(chipsRef.current)
    return () => ro.disconnect()
  }, [selectedKbs, attachedImages])

  // Keep the editable's ZWSP sentinel in sync when chips change while input is empty
  // (e.g. user removes the last chip via its X button without typing).
  useEffect(() => {
    const el = editableRef.current
    if (!el || input !== '') return
    const hasChips = selectedKbIds.length > 0 || attachedImages.length > 0
    const hasZwsp = el.textContent.includes('\u200B')
    if (hasChips && !hasZwsp) {
      el.textContent = '\u200B'
    } else if (!hasChips && hasZwsp) {
      el.textContent = ''
    }
  }, [input, selectedKbIds, attachedImages])

  const handleSend = async () => {
    const trimmed = input.trim()
    const images = attachedImages
    console.log('[chat:debug:renderer] handleSend', {
      webSearchEnabled,
      webSearchEnabledType: typeof webSearchEnabled,
      hasConversation: !!currentConversationId,
      selectedKbIds
    })
    if ((!trimmed && images.length === 0) || isStreamingCurrent) return
    setInput('')
    setAttachedImages([])
    if (editableRef.current) {
      editableRef.current.textContent =
        selectedKbIds.length > 0 || images.length > 0 ? '\u200B' : ''
    }

    if (!currentConversationId) {
      const newId = await createConversation(selectedKbIds, undefined, currentAssistant?.id)
      // Persist the current KB/webSearch toggle as the new conversation's draft
      // so the switch effect (fired by currentConversationId changing to newId)
      // restores them instead of resetting to defaults.
      setDraft(newId, {
        text: '',
        attachedImages: [],
        selectedKbIds,
        webSearchEnabled
      })
      navigate(`/chat/${newId}`, { replace: true })
    }

    await sendMessage(
      trimmed,
      selectedKbIds,
      undefined,
      currentAssistant?.id,
      images,
      webSearchEnabled
    )
  }

  const handleAbort = async () => {
    if (!streamingMessageId) return
    await abortStream(streamingMessageId)
  }

  const handleStartEdit = useCallback((msg: Message) => {
    setEditingId(msg.id)
    setEditContent(msg.content)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
    setEditContent('')
  }, [])

  const handleChangeEdit = useCallback((content: string) => {
    setEditContent(content)
  }, [])

  const handleSaveEdit = useCallback(() => {
    if (!editingId) return
    const trimmed = editContent.trim()
    if (!trimmed) return
    const target = conversationMessages.find((m) => m.id === editingId)
    // Run side effects before setEditingId - never inside a state updater
    // (StrictMode double-invokes updaters + Zustand set during React update
    // destabilizes the render and blanks the page).
    if (target?.role === 'assistant') {
      void updateMessageContent(editingId, trimmed)
    } else {
      void editMessage(editingId, trimmed, target?.images)
    }
    setEditingId(null)
    setEditContent('')
  }, [conversationMessages, editContent, editMessage, editingId, updateMessageContent])

  const handleCopy = useCallback((msg: Message) => {
    void navigator.clipboard.writeText(msg.content)
  }, [])

  const handleDelete = useCallback(
    (msgId: string) => {
      void deleteMessage(msgId)
    },
    [deleteMessage]
  )

  const handleRegenerate = useCallback(
    (msgId: string) => {
      void regenerateMessage(msgId)
    },
    [regenerateMessage]
  )

  const filteredKbs = kbPickerOpen
    ? knowledgeBases.filter(
        (kb) =>
          !selectedKbIds.includes(kb.id) &&
          kb.name.toLowerCase().includes(kbPickerQuery.toLowerCase())
      )
    : []

  const selectKbFromPicker = (kbId: string) => {
    setSelectedKbIds((prev) => (prev.includes(kbId) ? prev : [...prev, kbId]))
    if (editableRef.current) {
      const current = editableRef.current.innerText
      const next = current
        .replace(/(?:^|\s)@[^\s]*$/, '')
        .replace(/\u200B/g, '')
        .trimEnd()
      // When empty, use zero-width space to establish a line box after the floated chips,
      // so the caret lands on the first line (right of chips) instead of behind them.
      editableRef.current.textContent = next === '' ? '\u200B' : next
      setInput(next)
    }
    setKbPickerOpen(false)
    setKbPickerQuery('')
    setHighlightedKbIndex(0)
    requestAnimationFrame(() => {
      editableRef.current?.focus()
      if (editableRef.current) placeCaretAtEnd(editableRef.current)
    })
  }

  const syncFromEditable = (el: HTMLDivElement) => {
    const initialText = el.innerText.replace(/\u200B/g, '')
    if (initialText === '' && selectedKbIds.length > 0) {
      if (!el.textContent.includes('\u200B')) {
        el.textContent = '\u200B'
        placeCaretAtEnd(el)
      }
    } else if (initialText === '' && el.textContent !== '') {
      el.textContent = ''
    }
    const rawText = el.innerText
    const text = rawText.replace(/\u200B/g, '')
    setInput(text)
    const caretOffset = getCaretOffset(el)
    const textBeforeCursor = rawText.slice(0, caretOffset).replace(/\u200B/g, '')
    const match = textBeforeCursor.match(/(?:^|\s)@([^\s]*)$/)
    if (match) {
      setKbPickerOpen(true)
      setKbPickerQuery(match[1])
      setHighlightedKbIndex(0)
    } else if (kbPickerOpen) {
      setKbPickerOpen(false)
      setKbPickerQuery('')
    }
  }

  const handleEditableInput = (e: React.FormEvent<HTMLDivElement>) => {
    if (isComposingRef.current) return
    syncFromEditable(e.currentTarget)
  }

  const handleCompositionStart = () => {
    isComposingRef.current = true
    setIsComposing(true)
  }

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLDivElement>) => {
    isComposingRef.current = false
    setIsComposing(false)
    syncFromEditable(e.currentTarget)
  }

  const handleEditablePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const imageFiles = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file)
    if (imageFiles.length > 0) {
      e.preventDefault()
      const images = await Promise.all(imageFiles.map(readFileAsMessageImage))
      setAttachedImages((prev) => [...prev, ...images])
      return
    }
    e.preventDefault()
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
  }

  const handleEditableKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (kbPickerOpen && filteredKbs.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedKbIndex((i) => (i + 1) % filteredKbs.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedKbIndex((i) => (i - 1 + filteredKbs.length) % filteredKbs.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        selectKbFromPicker(filteredKbs[highlightedKbIndex].id)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setKbPickerOpen(false)
        return
      }
    } else {
      if (e.key === 'Backspace' && input === '') {
        if (attachedImages.length > 0) {
          e.preventDefault()
          setAttachedImages((prev) => prev.slice(0, -1))
          return
        }
        if (selectedKbIds.length > 0) {
          e.preventDefault()
          setSelectedKbIds((prev) => prev.slice(0, -1))
          return
        }
      }
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          e.preventDefault()
          document.execCommand('insertText', false, '\n')
        } else {
          e.preventDefault()
          void handleSend()
        }
      }
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return
    const images = await Promise.all(files.map(readFileAsMessageImage))
    setAttachedImages((prev) => [...prev, ...images])
    e.target.value = ''
  }

  const removeImage = (idx: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="flex flex-col h-[calc(100vh-40px)]">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 no-drag">
        <div className="space-y-6">
          {conversationMessages.length === 0 && !isStreamingCurrent && (
            <div className="text-center py-16 text-gray-400">
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
              {selectedKbs.length === 0 ? (
                <>
                  <p className="text-sm text-gray-500">{t('chat.startDirectChat')}</p>
                  <p className="text-xs mt-1">{t('chat.noKbSelected')}</p>
                  <p className="text-xs mt-2 text-blue-500">{t('chat.typeAtForKb')}</p>
                </>
              ) : (
                <>
                  <p className="text-sm">{t('chat.startKbChat')}</p>
                  <p className="text-xs mt-1">
                    {t('chat.selectedKbsCount', { n: selectedKbs.length })}
                  </p>
                </>
              )}
            </div>
          )}

          {conversationMessages.map((msg) => (
            <ErrorBoundary key={msg.id}>
              <MessageBubble
                msg={msg}
                sending={isStreamingCurrent}
                streamingThis={!!streams[msg.id]}
                isEditing={editingId === msg.id}
                editContent={editingId === msg.id ? editContent : ''}
                onCitationClick={setActiveCitation}
                onStartEdit={handleStartEdit}
                onCancelEdit={handleCancelEdit}
                onChangeEdit={handleChangeEdit}
                onSaveEdit={handleSaveEdit}
                onCopy={handleCopy}
                onDelete={handleDelete}
                onRegenerate={handleRegenerate}
              />
            </ErrorBoundary>
          ))}

          {isStreamingCurrent &&
            conversationMessages[conversationMessages.length - 1]?.role !== 'assistant' && (
              <div className="msg-enter flex gap-3 ml-6">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4 text-white" />
                </div>
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('chat.thinking')}
                </div>
              </div>
            )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 break-words">{error}</div>
              {lastFailedSend && lastFailedSend.conversationId === currentConversationId && (
                <button
                  type="button"
                  onClick={() => void retryLastFailedSend()}
                  disabled={isStreamingCurrent}
                  className="flex items-center gap-1 px-2 py-0.5 -mt-0.5 -mb-0.5 text-xs font-medium text-red-700 hover:text-red-800 hover:bg-red-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  {t('common.retry')}
                </button>
              )}
              <button
                type="button"
                onClick={clearError}
                className="text-red-400 hover:text-red-600 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 no-drag">
        <div className="relative">
          {kbPickerOpen && (
            <div className="absolute bottom-full left-2 mb-2 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg z-40 max-h-64 overflow-y-auto">
              {filteredKbs.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500">
                  {knowledgeBases.length === 0 ? t('chat.noKbs') : t('chat.noMatchingKbs')}
                </div>
              ) : (
                filteredKbs.map((kb, i) => (
                  <button
                    key={kb.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      selectKbFromPicker(kb.id)
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                      i === highlightedKbIndex
                        ? 'bg-blue-50 dark:bg-blue-950/50'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <FileText className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-900 dark:text-gray-100 truncate">{kb.name}</div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                        {t('chat.documentCount', { n: kb.documentCount })}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          <div className="flex items-end gap-2 border border-gray-200 rounded-2xl bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all p-2">
            <div className="flex-1 min-w-0 relative max-h-[200px] overflow-y-auto px-1 py-1">
              {(selectedKbs.length > 0 || attachedImages.length > 0) && (
                <div ref={chipsRef} className="flex items-center gap-1.5 float-left mr-2">
                  {selectedKbs.map((kb) => (
                    <span
                      key={kb.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs leading-4 max-h-5"
                    >
                      {kb.name}
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          toggleKb(kb.id)
                        }}
                        className="text-blue-400 hover:text-blue-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {attachedImages.map((img, idx) => (
                    <span
                      key={img.dataUrl}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs leading-4 max-h-5"
                    >
                      <ImageIcon className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[80px]">{img.name || 'image'}</span>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          removeImage(idx)
                        }}
                        className="text-purple-400 hover:text-purple-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div
                ref={editableRef}
                contentEditable={!isStreamingCurrent}
                suppressContentEditableWarning
                onInput={handleEditableInput}
                onKeyDown={handleEditableKeyDown}
                onPaste={handleEditablePaste}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onBlur={() => {
                  setTimeout(() => setKbPickerOpen(false), 150)
                }}
                className="block w-full outline-none text-sm leading-5 whitespace-pre-wrap break-words"
                style={{ minHeight: '20px' }}
              />
              {input === '' && !isComposing && (
                <div
                  className="absolute top-1 left-1 text-sm text-gray-400 pointer-events-none"
                  style={{ paddingLeft: chipsWidth > 0 ? chipsWidth + 8 : 0 }}
                >
                  {selectedKbs.length === 0
                    ? t('chat.placeholderNoKb')
                    : t('chat.placeholderWithKb')}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t('chat.attachImage')}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => setWebSearchEnabled((v) => !v)}
              aria-label={t('chat.webSearch')}
              aria-pressed={webSearchEnabled}
              title={t('chat.webSearch')}
              className={
                webSearchEnabled
                  ? 'w-9 h-9 flex items-center justify-center rounded-xl text-blue-600 bg-blue-50 hover:bg-blue-100 dark:text-blue-300 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 shrink-0 transition-colors'
                  : 'w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0 transition-colors'
              }
            >
              <Globe className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={isStreamingCurrent ? handleAbort : handleSend}
              disabled={!isStreamingCurrent && !input.trim() && attachedImages.length === 0}
              aria-label={isStreamingCurrent ? t('chat.stop') : t('chat.send')}
              className={
                isStreamingCurrent
                  ? 'stop-breathing w-9 h-9 flex items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors shrink-0'
                  : 'w-9 h-9 flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0'
              }
            >
              {isStreamingCurrent ? (
                <Square className="w-3 h-3" fill="currentColor" stroke="none" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          {attachedImages.length > 0 && !modelSupportsImage && (
            <div className="mt-1.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 px-1">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {t('chat.imageNotSupported')}
            </div>
          )}
        </div>
      </div>

      {/* Citation Popover */}
      {activeCitation &&
        (() => {
          const c = activeCitation.citation
          const isWeb = c.kind === 'web'
          const sectionPath = !isWeb ? c.chunkTitle?.trim() || '' : ''
          const badgeCls = isWeb
            ? 'w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300 flex items-center justify-center shrink-0 font-semibold text-sm'
            : 'w-8 h-8 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300 flex items-center justify-center shrink-0 font-semibold text-sm'
          return (
            <>
              <button
                type="button"
                aria-label={t('chat.closeCitation')}
                className="fixed inset-0 z-40 bg-black/20"
                onClick={() => setActiveCitation(null)}
              />
              <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(640px,90vw)] max-h-[70vh] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col">
                <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                  <div className={badgeCls}>[{c.index}]</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                      {isWeb ? c.title || c.url : c.docTitle}
                    </div>
                    {isWeb ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 hover:underline min-w-0"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{c.url}</span>
                      </a>
                    ) : (
                      <>
                        {sectionPath && (
                          <div
                            className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 mt-0.5 min-w-0"
                            title={sectionPath}
                          >
                            <Hash className="w-3 h-3 shrink-0" />
                            <span className="truncate">{sectionPath}</span>
                          </div>
                        )}
                        <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                          {t('chat.relevance', { n: ((c.score ?? 0) * 100).toFixed(1) })}
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveCitation(null)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {c.content}
                </div>
              </div>
            </>
          )
        })()}
    </div>
  )
}

type CitationClickHandler = (v: { messageId: string; citation: MessageCitation } | null) => void

interface MessageBubbleProps {
  msg: Message
  sending: boolean
  streamingThis: boolean
  isEditing: boolean
  editContent: string
  onCitationClick: CitationClickHandler
  onStartEdit: (msg: Message) => void
  onCancelEdit: () => void
  onChangeEdit: (content: string) => void
  onSaveEdit: () => void
  onCopy: (msg: Message) => void
  onDelete: (msgId: string) => void
  onRegenerate: (msgId: string) => void
}

const MessageBubble = memo(function MessageBubble({
  msg,
  sending,
  streamingThis,
  isEditing,
  editContent,
  onCitationClick,
  onStartEdit,
  onCancelEdit,
  onChangeEdit,
  onSaveEdit,
  onCopy,
  onDelete,
  onRegenerate
}: MessageBubbleProps) {
  const citations = msg.citations ?? []
  const citationMap = useMemo(() => new Map(citations.map((c) => [c.index, c])), [citations])
  const isStreamingThis = msg.role === 'assistant' && msg.content === '' && !msg.reasoning
  const isReasoningStreaming = msg.role === 'assistant' && !!msg.reasoning && msg.content === ''
  const { t } = useTranslation()
  const userAvatar = useKBStore((s) => s.settings?.userAvatar) ?? ''
  const editTextareaRef = useRef<HTMLDivElement>(null)
  const editComposingRef = useRef(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: editContent is read only on entering edit mode; subsequent edits flow DOM -> state, never back to DOM (would wipe caret)
  useEffect(() => {
    if (!isEditing || !editTextareaRef.current) return
    const el = editTextareaRef.current
    el.textContent = editContent
    el.focus()
    placeCaretAtEnd(el)
  }, [isEditing])

  const handleEditInput = (e: React.FormEvent<HTMLDivElement>) => {
    if (editComposingRef.current) return
    onChangeEdit(e.currentTarget.innerText)
  }

  const handleEditCompositionStart = () => {
    editComposingRef.current = true
  }

  const handleEditCompositionEnd = (e: React.CompositionEvent<HTMLDivElement>) => {
    editComposingRef.current = false
    onChangeEdit(e.currentTarget.innerText)
  }

  const handleEditPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
  }

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSaveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancelEdit()
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      document.execCommand('insertText', false, '\n')
    }
  }

  const transformChildren = useCallback(
    (children: React.ReactNode) =>
      renderCitationsInChildren(children, citationMap, msg.id, onCitationClick, t),
    [citationMap, msg.id, onCitationClick, t]
  )

  return (
    <div
      className={`group msg-enter flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse mr-6' : 'ml-6'}`}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden ${
          msg.role === 'user'
            ? userAvatar
              ? 'bg-gray-100'
              : 'bg-gradient-to-br from-blue-500 to-blue-600'
            : 'bg-gradient-to-br from-slate-600 to-slate-700'
        }`}
      >
        {msg.role === 'user' ? (
          userAvatar ? (
            <img src={userAvatar} alt={t('chat.you')} className="w-full h-full object-cover" />
          ) : (
            <User className="w-4 h-4 text-white" />
          )
        ) : (
          <BookOpen className="w-4 h-4 text-white" />
        )}
      </div>
      <div
        className={`flex flex-col min-w-0 max-w-[calc(100%-5rem)] ${
          msg.role === 'user' ? 'items-end' : 'items-start'
        }`}
      >
        {isEditing ? (
          <div
            className={`rounded-2xl bg-white border border-blue-400 px-4 py-2.5 max-w-full shadow-sm ${
              msg.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm'
            }`}
          >
            <div
              ref={editTextareaRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditInput}
              onKeyDown={handleEditKeyDown}
              onPaste={handleEditPaste}
              onCompositionStart={handleEditCompositionStart}
              onCompositionEnd={handleEditCompositionEnd}
              className="outline-none text-[15px] leading-relaxed text-gray-900 whitespace-pre-wrap break-words"
              style={{ minHeight: '24px' }}
            />
            <div className="flex items-center justify-between mt-2 gap-2">
              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                {t('chat.editHint')}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={onSaveEdit}
                  disabled={!editContent.trim() || sending}
                  className="px-3 py-1 text-xs text-white bg-blue-500 hover:bg-blue-600 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-2xl px-4 py-2.5 max-w-full ${
              msg.role === 'user'
                ? 'bg-blue-500 text-white rounded-tr-sm'
                : 'bg-white border border-gray-200 text-gray-900 rounded-tl-sm shadow-sm'
            }`}
          >
            {msg.role === 'user' ? (
              <>
                {msg.images && msg.images.length > 0 && (
                  <div className="flex items-start gap-1.5 mb-2 flex-wrap">
                    <ImageIcon className="w-3.5 h-3.5 text-white/70 shrink-0 mt-0.5" />
                    <div className="flex flex-wrap gap-1.5">
                      {msg.images.map((img, idx) => (
                        <img
                          key={img.dataUrl}
                          src={img.dataUrl}
                          alt={img.name || `image ${idx + 1}`}
                          className="w-24 h-24 object-cover rounded-lg border border-white/20"
                        />
                      ))}
                    </div>
                  </div>
                )}
                <MessageMarkdown variant="user" content={msg.content} />
              </>
            ) : (
              <>
                {(msg.reasoning || isReasoningStreaming) && (
                  <ThinkingBlock reasoning={msg.reasoning} streaming={isReasoningStreaming} />
                )}
                {isStreamingThis ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 py-1">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {citations.length > 0
                      ? t('chat.searchingAndThinking')
                      : t('chat.thinkingShort')}
                  </div>
                ) : (
                  <MessageMarkdown
                    content={msg.content}
                    transformChildren={transformChildren}
                    streaming={streamingThis}
                  />
                )}

                {citations.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 mb-1.5 text-[11px] text-gray-400">
                      <FileText className="w-3 h-3" />
                      <span>{t('chat.citationSource', { n: citations.length })}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {citations.map((c) => {
                        const isWeb = c.kind === 'web'
                        const chipCls = isWeb
                          ? 'group/cite inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 dark:text-emerald-300 text-[11px] transition-colors'
                          : 'group/cite inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 dark:text-blue-300 text-[11px] transition-colors'
                        const badgeCls = isWeb
                          ? 'inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-emerald-500 group-hover/cite:bg-emerald-600 text-white text-[10px] font-semibold leading-none tabular-nums transition-colors'
                          : 'inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-blue-500 group-hover/cite:bg-blue-600 text-white text-[10px] font-semibold leading-none tabular-nums transition-colors'
                        return (
                          <CitationTooltip key={c.index} citation={c}>
                            <button
                              type="button"
                              onClick={() => onCitationClick({ messageId: msg.id, citation: c })}
                              className={chipCls}
                            >
                              <span className={badgeCls}>{c.index}</span>
                              <span className="max-w-[200px] truncate">
                                {isWeb ? c.title || c.url : c.docTitle}
                              </span>
                            </button>
                          </CitationTooltip>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {!isStreamingThis && !isEditing && (
          <MessageActions
            role={msg.role}
            disabled={sending}
            onCopy={() => onCopy(msg)}
            onEdit={() => onStartEdit(msg)}
            onDelete={() => onDelete(msg.id)}
            onRegenerate={() => onRegenerate(msg.id)}
          />
        )}
      </div>
    </div>
  )
})

function renderCitationsInChildren(
  children: React.ReactNode,
  citationMap: Map<number, MessageCitation>,
  messageId: string,
  setActiveCitation: (v: { messageId: string; citation: MessageCitation } | null) => void,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): React.ReactNode {
  const result: React.ReactNode[] = []
  let keyCounter = 0

  const process = (node: React.ReactNode): void => {
    if (typeof node === 'string') {
      const regex = /\[(\d+)\]/g
      let lastIndex = 0
      let match: RegExpExecArray | null
      // biome-ignore lint/suspicious/noAssignInExpressions: regex.exec loop
      while ((match = regex.exec(node)) !== null) {
        if (match.index > lastIndex) {
          result.push(node.slice(lastIndex, match.index))
        }
        const idx = Number.parseInt(match[1], 10)
        const citation = citationMap.get(idx)
        if (citation) {
          const k = `cite-${messageId}-${keyCounter++}`
          result.push(
            <CitationTooltip key={k} citation={citation}>
              <button
                type="button"
                onClick={() => setActiveCitation({ messageId, citation })}
                aria-label={t('chat.citationN', {
                  n: idx,
                  title:
                    [citation.docTitle, citation.chunkTitle].filter(Boolean).join(' · ') ||
                    citation.title ||
                    citation.url ||
                    ''
                })}
                className="inline-flex items-center justify-center align-super mx-0.5 min-w-[16px] h-[16px] px-[5px] rounded-full bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-semibold leading-none tabular-nums transition-colors"
              >
                {idx}
              </button>
            </CitationTooltip>
          )
        } else {
          result.push(match[0])
        }
        lastIndex = match.index + match[0].length
      }
      if (lastIndex < node.length) {
        result.push(node.slice(lastIndex))
      }
      return
    }
    result.push(node)
  }

  if (Array.isArray(children)) {
    children.forEach(process)
  } else {
    process(children)
  }
  return result
}

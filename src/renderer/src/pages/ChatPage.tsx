import type { Message, MessageCitation } from '@shared/types'
import { AlertCircle, Bot, FileText, Loader2, Send, User, X } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MessageActions } from '../components/chat/MessageActions'
import { ThinkingBlock } from '../components/chat/ThinkingBlock'
import { CitationTooltip, MessageMarkdown } from '../components/chat/markdown'
import { useAssistantStore } from '../stores/assistant-store'
import { useChatStore } from '../stores/chat-store'
import { useKBStore } from '../stores/kb-store'

export function ChatPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    currentConversationId,
    conversationMessages,
    conversations,
    streams,
    error,
    selectConversation,
    sendMessage,
    subscribeProgress,
    clearError,
    createConversation,
    clearCurrentConversation,
    deleteMessage,
    editMessage,
    regenerateMessage
  } = useChatStore()
  const { assistants, loadAssistants } = useAssistantStore()
  const { knowledgeBases, loadKnowledgeBases } = useKBStore()
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const currentConversation = conversations.find((c) => c.id === currentConversationId)
  const currentConversationKbIds = currentConversation?.kbIds ?? []
  const currentAssistant =
    assistants.find((assistant) => assistant.id === currentConversation?.assistantId) ??
    assistants[0] ??
    null
  const isStreamingCurrent = Object.values(streams).some(
    (s) => s.conversationId === currentConversationId
  )

  useEffect(() => {
    loadKnowledgeBases()
    loadAssistants()
    const cleanup = subscribeProgress()
    return cleanup
  }, [loadAssistants, loadKnowledgeBases, subscribeProgress])

  useEffect(() => {
    if (id) {
      selectConversation(id)
      return
    }
    clearCurrentConversation()
  }, [clearCurrentConversation, id, selectConversation])

  useEffect(() => {
    if (currentConversationKbIds.length > 0) {
      setSelectedKbIds(currentConversationKbIds)
      return
    }
    if (currentAssistant) {
      setSelectedKbIds(currentAssistant.knowledgeBaseIds)
    }
  }, [currentAssistant, currentConversationKbIds])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  })

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  })

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreamingCurrent) return
    setInput('')

    if (!currentConversationId) {
      const newId = await createConversation(selectedKbIds, undefined, currentAssistant?.id)
      navigate(`/chat/${newId}`, { replace: true })
    }

    await sendMessage(trimmed, selectedKbIds, undefined, currentAssistant?.id)
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
    setEditingId((currentId) => {
      if (!currentId) return null
      const trimmed = editContent.trim()
      if (!trimmed) return currentId
      void editMessage(currentId, trimmed)
      return null
    })
    setEditContent('')
  }, [editContent, editMessage])

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

  const toggleKb = (kbId: string) => {
    setSelectedKbIds((prev) =>
      prev.includes(kbId) ? prev.filter((id) => id !== kbId) : [...prev, kbId]
    )
  }

  const selectedKbs = knowledgeBases.filter((k) => selectedKbIds.includes(k.id))

  const filteredKbs = kbPickerOpen
    ? knowledgeBases.filter(
        (kb) =>
          !selectedKbIds.includes(kb.id) &&
          kb.name.toLowerCase().includes(kbPickerQuery.toLowerCase())
      )
    : []

  const selectKbFromPicker = (kbId: string) => {
    setSelectedKbIds((prev) => (prev.includes(kbId) ? prev : [...prev, kbId]))
    setInput((prev) => prev.replace(/(?:^|\s)@[^\s]*$/, '').trimEnd())
    setKbPickerOpen(false)
    setKbPickerQuery('')
    setHighlightedKbIndex(0)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)

    const cursorPos = e.target.selectionStart ?? value.length
    const textBeforeCursor = value.slice(0, cursorPos)
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      if (e.key === 'Backspace' && input === '' && selectedKbIds.length > 0) {
        e.preventDefault()
        setSelectedKbIds((prev) => prev.slice(0, -1))
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    }
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
                  <p className="text-sm text-gray-500">开始直接对话</p>
                  <p className="text-xs mt-1">未选择知识库，将直接调用模型回复</p>
                  <p className="text-xs mt-2 text-blue-500">输入 @ 可选择知识库进行检索</p>
                </>
              ) : (
                <>
                  <p className="text-sm">开始与你的知识库对话</p>
                  <p className="text-xs mt-1">
                    已选择 {selectedKbs.length} 个知识库，提问将基于检索结果
                  </p>
                </>
              )}
            </div>
          )}

          {conversationMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              sending={isStreamingCurrent}
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
          ))}

          {isStreamingCurrent &&
            conversationMessages[conversationMessages.length - 1]?.role !== 'assistant' && (
              <div className="msg-enter flex gap-3 ml-6">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  正在思考中...
                </div>
              </div>
            )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
              <button
                type="button"
                onClick={clearError}
                className="text-red-400 hover:text-red-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 bg-white p-4 no-drag">
        <div className="relative">
          {kbPickerOpen && (
            <div className="absolute bottom-full left-2 mb-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-40 max-h-64 overflow-y-auto">
              {filteredKbs.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-gray-400">
                  {knowledgeBases.length === 0 ? '暂无知识库' : '无匹配知识库'}
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
                      i === highlightedKbIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-900 truncate">{kb.name}</div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {kb.documentCount} 文档
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          <div className="flex items-end gap-2 border border-gray-200 rounded-2xl bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all p-2">
            <div className="flex-1 flex flex-wrap items-center gap-1.5">
              {selectedKbs.map((kb) => (
                <span
                  key={kb.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
                >
                  {kb.name}
                  <button
                    type="button"
                    onClick={() => toggleKb(kb.id)}
                    className="text-blue-400 hover:text-blue-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                  setTimeout(() => setKbPickerOpen(false), 150)
                }}
                placeholder={
                  selectedKbs.length === 0
                    ? '输入消息... 输入 @ 选择知识库 (Enter 发送，Shift+Enter 换行)'
                    : '输入消息... (Enter 发送，Shift+Enter 换行)'
                }
                rows={1}
                className="flex-1 resize-none outline-none px-2 py-1.5 text-sm placeholder-gray-400 max-h-[200px] min-w-[200px]"
              />
            </div>
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isStreamingCurrent}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
            >
              {isStreamingCurrent ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Citation Popover */}
      {activeCitation && (
        <>
          <button
            type="button"
            aria-label="关闭引用详情"
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setActiveCitation(null)}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(640px,90vw)] max-h-[70vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col">
            <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 font-semibold text-sm">
                [{activeCitation.citation.index}]
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-900 truncate">
                  {activeCitation.citation.docTitle}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  相关度 {(activeCitation.citation.score * 100).toFixed(1)}%
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveCitation(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {activeCitation.citation.content}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

type CitationClickHandler = (v: { messageId: string; citation: MessageCitation } | null) => void

interface MessageBubbleProps {
  msg: Message
  sending: boolean
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
  const userAvatar = useKBStore((s) => s.settings?.userAvatar) ?? ''
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing && editTextareaRef.current) {
      editTextareaRef.current.focus()
    }
  }, [isEditing])

  const transformChildren = useCallback(
    (children: React.ReactNode) =>
      renderCitationsInChildren(children, citationMap, msg.id, onCitationClick),
    [citationMap, msg.id, onCitationClick]
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
            : 'bg-gradient-to-br from-purple-500 to-purple-600'
        }`}
      >
        {msg.role === 'user' ? (
          userAvatar ? (
            <img src={userAvatar} alt="你" className="w-full h-full object-cover" />
          ) : (
            <User className="w-4 h-4 text-white" />
          )
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>
      <div
        className={`flex flex-col min-w-0 max-w-[calc(100%-5rem)] ${
          msg.role === 'user' ? 'items-end' : 'items-start'
        }`}
      >
        {isEditing ? (
          <div className="w-[min(480px,100%)] rounded-2xl rounded-tr-sm bg-white border border-blue-400 px-4 py-2.5 shadow-sm">
            <textarea
              ref={editTextareaRef}
              value={editContent}
              onChange={(e) => onChangeEdit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onSaveEdit()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  onCancelEdit()
                }
              }}
              className="w-full resize-none outline-none px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 min-h-[60px] text-gray-900"
            />
            <div className="flex gap-2 justify-end mt-2">
              <button
                type="button"
                onClick={onCancelEdit}
                className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onSaveEdit}
                disabled={!editContent.trim() || sending}
                className="px-3 py-1 text-xs text-white bg-blue-500 hover:bg-blue-600 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
              >
                保存
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-2xl px-4 py-2.5 ${
              msg.role === 'user'
                ? 'bg-blue-500 text-white rounded-tr-sm'
                : 'bg-white border border-gray-200 text-gray-900 rounded-tl-sm shadow-sm'
            }`}
          >
            {msg.role === 'user' ? (
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
            ) : (
              <>
                {(msg.reasoning || isReasoningStreaming) && (
                  <ThinkingBlock reasoning={msg.reasoning} streaming={isReasoningStreaming} />
                )}
                {isStreamingThis ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 py-1">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {citations.length > 0 ? '正在检索并思考...' : '正在思考...'}
                  </div>
                ) : (
                  <MessageMarkdown content={msg.content} transformChildren={transformChildren} />
                )}

                {!isStreamingThis && citations.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 mb-1.5 text-[11px] text-gray-400">
                      <FileText className="w-3 h-3" />
                      <span>引用来源 · {citations.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {citations.map((c) => (
                        <CitationTooltip key={c.index} citation={c}>
                          <button
                            type="button"
                            onClick={() => onCitationClick({ messageId: msg.id, citation: c })}
                            className="group/cite inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] transition-colors"
                          >
                            <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-blue-500 group-hover/cite:bg-blue-600 text-white text-[10px] font-semibold leading-none tabular-nums transition-colors">
                              {c.index}
                            </span>
                            <span className="max-w-[200px] truncate">{c.docTitle}</span>
                          </button>
                        </CitationTooltip>
                      ))}
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
  setActiveCitation: (v: { messageId: string; citation: MessageCitation } | null) => void
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
                aria-label={`引用 ${idx}: ${citation.docTitle}`}
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

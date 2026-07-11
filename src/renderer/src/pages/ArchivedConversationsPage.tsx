import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Trash2
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '../i18n'
import { useChatStore } from '../stores/chat-store'

const PAGE_SIZE = 10

export function ArchivedConversationsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const {
    archivedConversations,
    loadArchivedConversations,
    unarchiveConversation,
    deleteConversation
  } = useChatStore()
  const [page, setPage] = useState(1)

  useEffect(() => {
    loadArchivedConversations()
  }, [loadArchivedConversations])

  const totalPages = Math.max(1, Math.ceil(archivedConversations.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedConversations = archivedConversations.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  const handleRestore = async (id: string) => {
    await unarchiveConversation(id)
  }

  const handleDelete = async (id: string) => {
    await deleteConversation(id)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="max-w-6xl mx-auto px-8 pt-8 w-full shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            title={t('common.back')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Archive className="w-6 h-6 text-gray-700 dark:text-gray-300" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('archive.title')}
          </h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('archive.restoreHint')}</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 pb-8">
          {archivedConversations.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-gray-900 border border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
              <Archive className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
              <p className="text-gray-400 dark:text-gray-500 text-sm">{t('archive.empty')}</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {pagedConversations.map((conv) => (
                  <div key={conv.id} className="group relative">
                    <div className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                        <MessageSquare className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0 pr-16">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {conv.name}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-3">
                          <span>{t('sidebar.messageCount', { n: conv.messageCount })}</span>
                          <span>{new Date(conv.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleRestore(conv.id)}
                        title={t('sidebar.unarchive')}
                        className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-all"
                      >
                        <ArchiveRestore className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(conv.id)}
                        title={t('common.delete')}
                        className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-8">
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage <= 1}
                    title={t('common.prev')}
                    className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-500 dark:disabled:hover:text-gray-400"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums min-w-[60px] text-center">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    title={t('common.next')}
                    className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-500 dark:disabled:hover:text-gray-400"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

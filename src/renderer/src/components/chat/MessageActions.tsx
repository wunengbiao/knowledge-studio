import { useTranslation } from '../../i18n'
import { Check, Copy, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'

interface MessageActionsProps {
  role: 'user' | 'assistant'
  disabled: boolean
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
  onRegenerate: () => void
}

export function MessageActions({
  role,
  disabled,
  onCopy,
  onEdit,
  onDelete,
  onRegenerate
}: MessageActionsProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className={`flex gap-1 mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ${
        role === 'user' ? 'justify-end' : 'justify-start'
      }`}
    >
      {role === 'assistant' && (
        <button
          type="button"
          aria-label={t('messageActions.regenerate')}
          disabled={disabled}
          onClick={onRegenerate}
          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        type="button"
        aria-label={t('messageActions.edit')}
        disabled={disabled}
        onClick={onEdit}
        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        aria-label={copied ? t('messageActions.copied') : t('messageActions.copy')}
        disabled={disabled}
        onClick={handleCopy}
        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
      <button
        type="button"
        aria-label={t('messageActions.delete')}
        disabled={disabled}
        onClick={onDelete}
        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

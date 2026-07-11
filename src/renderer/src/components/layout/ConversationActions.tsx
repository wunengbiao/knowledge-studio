import { Archive, MoreHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../i18n'

interface ConversationActionsProps {
  onArchive: () => void
  onDelete: () => void
}

const MENU_WIDTH = 172

/**
 * "..." trigger + fixed-position popup for conversation row actions.
 * The popup uses `position: fixed` with viewport-relative coordinates so it
 * escapes the sidebar's `overflow-hidden` ancestor and is never clipped.
 */
export function ConversationActions({ onArchive, onDelete }: ConversationActionsProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on Escape, outside pointer-down, scroll, or viewport resize.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        triggerRef.current?.focus()
      }
    }
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  // Compute fixed popup position relative to the trigger, clamped to viewport.
  useEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const menuH = menuRef.current?.offsetHeight ?? 0
    const gap = 6
    const margin = 8
    // Right-align menu to trigger; open below by default.
    let left = rect.right - MENU_WIDTH
    let top = rect.bottom + gap
    // Clamp horizontally into viewport.
    left = Math.max(margin, Math.min(left, window.innerWidth - MENU_WIDTH - margin))
    // Flip above when insufficient room below.
    if (top + menuH > window.innerHeight - margin) {
      top = rect.top - menuH - gap
    }
    // Clamp vertically.
    top = Math.max(margin, Math.min(top, window.innerHeight - menuH - margin))
    setPos({ left, top })
  }, [open])

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOpen((v) => !v)
  }

  const handleArchive = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOpen(false)
    onArchive()
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOpen(false)
    onDelete()
  }

  return (
    <>
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
        <button
          ref={triggerRef}
          type="button"
          onClick={toggle}
          title={t('sidebar.moreActions')}
          aria-haspopup="menu"
          aria-expanded={open}
          className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{ left: pos.left, top: pos.top, width: MENU_WIDTH }}
          className="fixed z-50 rounded-lg border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 py-1 dark:border-gray-700 dark:bg-gray-800"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleArchive}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 dark:text-gray-200 dark:hover:bg-blue-950/50 dark:hover:text-blue-300 transition-colors"
          >
            <Archive className="w-4 h-4 shrink-0" />
            {t('sidebar.archive')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleDelete}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 dark:text-gray-200 dark:hover:bg-red-950/50 dark:hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            {t('common.delete')}
          </button>
        </div>
      )}
    </>
  )
}

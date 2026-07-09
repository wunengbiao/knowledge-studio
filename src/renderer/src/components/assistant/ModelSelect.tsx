import type { Provider, ProviderModel } from '@shared/types'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../i18n'

interface ModelOptionGroup {
  readonly provider: Provider
  readonly models: ProviderModel[]
}

interface ModelSelectProps {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly groups: ModelOptionGroup[]
  readonly placeholder: string
}

interface PanelPosition {
  readonly top?: number
  readonly bottom?: number
  readonly left: number
  readonly width: number
  readonly maxHeight: number
}

export function ModelSelect({ value, onChange, groups, placeholder }: ModelSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<PanelPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const totalModels = useMemo(() => groups.reduce((sum, g) => sum + g.models.length, 0), [groups])
  const showSearch = totalModels > 8

  const selectedLabel = useMemo(() => {
    if (!value) return placeholder
    for (const g of groups) {
      for (const m of g.models) {
        if (`${g.provider.id}::${m.id}` === value) {
          return m.name ? `${m.id} · ${m.name}` : m.id
        }
      }
    }
    return value
  }, [value, groups, placeholder])

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => ({
        provider: g.provider,
        models: g.models.filter((m) => {
          const id = m.id.toLowerCase()
          const name = (m.name ?? '').toLowerCase()
          const providerName = g.provider.name.toLowerCase()
          return id.includes(q) || name.includes(q) || providerName.includes(q)
        })
      }))
      .filter((g) => g.models.length > 0)
  }, [groups, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setPosition(null)
      return
    }
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const margin = 4
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    let top: number | undefined
    let bottom: number | undefined
    let maxHeight: number
    if (spaceBelow < 220 && spaceAbove > spaceBelow) {
      bottom = window.innerHeight - rect.top + margin
      maxHeight = Math.min(360, Math.max(160, spaceAbove - margin - 8))
    } else {
      top = rect.bottom + margin
      maxHeight = Math.min(360, Math.max(160, spaceBelow - margin - 8))
    }
    setPosition({ top, bottom, left: rect.left, width: rect.width, maxHeight })
    const id = setTimeout(() => searchRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const handleScroll = (e: Event) => {
      const target = e.target as Node | null
      if (target && panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleClose = () => setOpen(false)
    document.addEventListener('mousedown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleClose)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleClose)
    }
  }, [open])

  const handleSelect = (next: string) => {
    onChange(next)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const itemBase = 'w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2'
  const itemSelected = 'text-blue-700 dark:text-blue-300 font-medium bg-blue-50 dark:bg-blue-950/40'
  const itemUnselected = 'text-gray-700 hover:bg-gray-50'

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 dark:focus:ring-blue-900/30 dark:focus:border-blue-500"
      >
        <span className={value ? 'text-gray-900 truncate' : 'text-gray-400 truncate'}>
          {selectedLabel}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && position && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: position.top,
            bottom: position.bottom,
            left: position.left,
            width: position.width,
            maxHeight: position.maxHeight,
            zIndex: 60
          }}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl flex flex-col overflow-hidden"
        >
          {showSearch && (
            <div className="p-2 border-b border-gray-100 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('common.search')}
                  className="w-full pl-7 pr-7 py-1.5 text-sm border border-gray-200 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700 dark:focus:ring-blue-900/30 dark:focus:border-blue-500"
                />
                {query && (
                  <button
                    type="button"
                    aria-label={t('common.remove')}
                    onClick={() => {
                      setQuery('')
                      searchRef.current?.focus()
                    }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => handleSelect('')}
              className={`${itemBase} ${value === '' ? itemSelected : itemUnselected}`}
            >
              <span className="truncate">{placeholder}</span>
              {value === '' && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>
            {filteredGroups.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-gray-400">
                {t('common.noResults')}
              </div>
            ) : (
              filteredGroups.map((g) => (
                <div key={g.provider.id}>
                  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {g.provider.name}
                  </div>
                  {g.models.map((m) => {
                    const optionValue = `${g.provider.id}::${m.id}`
                    const isSelected = optionValue === value
                    return (
                      <button
                        key={optionValue}
                        type="button"
                        onClick={() => handleSelect(optionValue)}
                        className={`${itemBase} ${isSelected ? itemSelected : itemUnselected}`}
                      >
                        <span className="truncate">{m.name ? `${m.id} · ${m.name}` : m.id}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

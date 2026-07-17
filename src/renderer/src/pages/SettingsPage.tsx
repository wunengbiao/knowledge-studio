import type {
  ActiveModelRef,
  AppSettings,
  Assistant,
  CodeFont,
  CodeFontSize,
  CodeTheme,
  Provider,
  ProviderKind,
  ProviderModel
} from '@shared/types'
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronRight,
  ExternalLink,
  FlaskConical,
  Image as ImageIcon,
  Key,
  Languages,
  Layers,
  ListOrdered,
  Loader2,
  MessageSquare,
  Palette,
  Plus,
  ScanText,
  Search,
  Sparkles,
  Trash2,
  Type,
  Upload,
  User as UserIcon,
  Wifi,
  XCircle
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  type AssistantFormValue,
  AssistantSettingsPanel
} from '../components/assistant/AssistantSettingsPanel'
import { MessageMarkdown } from '../components/chat/markdown/MessageMarkdown'
import { useTranslation, type TranslationKey } from '../i18n'
import { useAssistantStore } from '../stores/assistant-store'
import { useKBStore } from '../stores/kb-store'

type Capability = 'chat' | 'embedding' | 'rerank'
type FetchCapabilityFilter = Capability | 'all'

function SettingGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  )
}

function SettingRow({
  label,
  description,
  children,
  align = 'center'
}: {
  label: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  align?: 'center' | 'start'
}) {
  return (
    <div className={`flex gap-6 px-5 py-3.5 ${align === 'start' ? 'items-start' : 'items-center'}`}>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-gray-800">{label}</div>
        {description && <div className="mt-0.5 text-xs text-gray-400">{description}</div>}
      </div>
      <div className="flex-shrink-0 min-w-[260px] max-w-[420px] w-[55%]">{children}</div>
    </div>
  )
}

function TestResultBanner({
  result
}: {
  result: { success: boolean; message: string } | null
}) {
  if (!result) return null
  return (
    <div
      className={`flex items-center gap-1.5 text-xs p-2 rounded ${
        result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
      }`}
    >
      {result.success ? <Check className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
      {result.message}
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean | number; onChange: () => void }) {
  const active = !!on
  return (
    <button
      onClick={onChange}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        active ? 'bg-blue-500' : 'bg-gray-200'
      }`}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          active ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

const inputCls =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

const CODE_THEMES: CodeTheme[] = [
  'monokai',
  'github',
  'github-dark',
  'dracula',
  'atom-one-dark',
  'atom-one-light',
  'vs',
  'vs2015'
]

const CODE_THEME_LABELS: Record<CodeTheme, string> = {
  monokai: 'Monokai',
  github: 'GitHub',
  'github-dark': 'GitHub Dark',
  dracula: 'Dracula',
  'atom-one-dark': 'Atom One Dark',
  'atom-one-light': 'Atom One Light',
  vs: 'Visual Studio',
  vs2015: 'Visual Studio 2015'
}

const CODE_FONTS: CodeFont[] = [
  'system',
  'menlo',
  'consolas',
  'monaco',
  'courier',
  'jetbrains',
  'firacode',
  'sfmono'
]

const CODE_FONT_LABELS: Record<CodeFont, string> = {
  system: 'System Default',
  menlo: 'Menlo',
  consolas: 'Consolas',
  monaco: 'Monaco',
  courier: 'Courier New',
  jetbrains: 'JetBrains Mono',
  firacode: 'Fira Code',
  sfmono: 'SF Mono'
}

const CODE_FONT_SIZES: CodeFontSize[] = ['xs', 'sm', 'md', 'lg', 'xl']

const CODE_FONT_SIZE_LABELS: Record<CodeFontSize, string> = {
  xs: 'Extra Small',
  sm: 'Small',
  md: 'Default',
  lg: 'Large',
  xl: 'Extra Large'
}

const CODE_THEME_DEMO = `\`\`\`typescript
// User profile service
import { Database } from './db'

interface User {
  id: number
  name: string
  email?: string
}

export async function fetchUser(db: Database, id: number): Promise<User | null> {
  const row = await db.query('SELECT * FROM users WHERE id = ?', [id])
  if (!row) return null
  return { id: row.id, name: row.name, email: row.email }
}
\`\`\``

const PROVIDER_KIND_BADGE: Record<ProviderKind, string> = {
  deepseek: 'DeepSeek',
  nvidia: 'NVIDIA',
  mistral: 'Mistral',
  gemini: 'Gemini',
  ollama: 'Ollama',
  custom: 'Custom'
}

const PROVIDER_KIND_COLOR: Record<ProviderKind, string> = {
  deepseek: 'bg-indigo-500',
  nvidia: 'bg-emerald-500',
  mistral: 'bg-orange-500',
  gemini: 'bg-blue-500',
  ollama: 'bg-slate-600',
  custom: 'bg-gray-400'
}

const CAPABILITY_META: Record<
  Capability,
  { label: string; chipClass: string; icon: React.ComponentType<{ className?: string }> }
> = {
  chat: {
    label: 'Chat',
    chipClass: 'border-slate-200 bg-slate-50 text-slate-700',
    icon: MessageSquare
  },
  embedding: {
    label: 'Embedding',
    chipClass: 'border-blue-200 bg-blue-50 text-blue-700',
    icon: Layers
  },
  rerank: {
    label: 'ReRank',
    chipClass: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: ListOrdered
  }
}

type ModelInput = 'text' | 'image'

const INPUTS_META: Record<
  ModelInput,
  { label: string; chipClass: string; icon: React.ComponentType<{ className?: string }> }
> = {
  text: {
    label: 'Text',
    chipClass: 'border-slate-200 bg-slate-50 text-slate-600',
    icon: Type
  },
  image: {
    label: 'Image',
    chipClass: 'border-purple-200 bg-purple-50 text-purple-700',
    icon: ImageIcon
  }
}

const FETCH_FILTERS: { key: FetchCapabilityFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'chat', label: 'Chat' },
  { key: 'embedding', label: 'Embedding' },
  { key: 'rerank', label: 'ReRank' }
]

type Section = 'general' | 'providers' | 'models' | 'assistants' | 'ocr' | 'proxy' | 'ui' | 'language' | 'search'

type NavGroup = {
  titleKey: TranslationKey
  items: { key: Section; labelKey: TranslationKey; icon: React.ComponentType<{ className?: string }> }[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    titleKey: 'settings.nav.groupGeneral',
    items: [
      { key: 'general', labelKey: 'settings.nav.profile', icon: UserIcon },
      { key: 'language', labelKey: 'settings.nav.language', icon: Languages }
    ]
  },
  {
    titleKey: 'settings.nav.groupModels',
    items: [
      { key: 'providers', labelKey: 'settings.nav.providers', icon: Sparkles },
      { key: 'models', labelKey: 'settings.nav.defaultModels', icon: MessageSquare },
      { key: 'assistants', labelKey: 'settings.nav.assistants', icon: Bot }
    ]
  },
  {
    titleKey: 'settings.nav.groupServices',
    items: [{ key: 'ocr', labelKey: 'settings.nav.ocr', icon: ScanText }]
  },
  {
    titleKey: 'settings.nav.groupApp',
    items: [
      { key: 'ui', labelKey: 'settings.nav.display', icon: Palette },
      { key: 'search', labelKey: 'settings.nav.search', icon: Search },
      { key: 'proxy', labelKey: 'settings.nav.proxy', icon: Wifi }
    ]
  }
]

function Sidebar({
  active,
  onSelect,
  onBack
}: {
  active: Section
  onSelect: (s: Section) => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  return (
    <aside className="w-[220px] flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
      <div className="px-3 py-3.5 flex items-center gap-2 border-b border-gray-200">
        <button
          onClick={onBack}
          className="p-1 rounded-md hover:bg-gray-200 transition-colors"
          title={t('common.back')}
        >
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </button>
        <h1 className="text-sm font-semibold text-gray-800">{t('settings.title')}</h1>
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.titleKey}>
            <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-normal text-gray-400">
              {t(group.titleKey)}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = active === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => onSelect(item.key)}
                    className={`w-full flex items-center gap-2 h-8 px-2.5 rounded-[10px] text-sm transition-colors ${
                      isActive
                        ? 'bg-gray-200 font-medium text-gray-900'
                        : 'text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{t(item.labelKey)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}

function PaneHeader({
  title,
  description
}: {
  title: string
  description?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
        {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
      </div>
    </div>
  )
}

function ProviderListItem({
  provider,
  selected,
  isActiveAnywhere,
  onClick
}: {
  provider: Provider
  selected: boolean
  isActiveAnywhere: boolean
  onClick: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onClick}
      data-selected={selected || undefined}
      className={`w-full group flex items-center gap-2.5 h-10 px-2.5 rounded-[10px] text-sm transition-colors ${
        selected ? 'bg-gray-200 text-gray-900' : 'text-gray-700 hover:bg-gray-200'
      }`}
    >
      <span
        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white ${PROVIDER_KIND_COLOR[provider.kind]}`}
      >
        {provider.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="flex-1 min-w-0 text-left truncate">{provider.name}</span>
      {isActiveAnywhere && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title={t('common.inUse')} />
      )}
      <ChevronRight
        className={`w-3.5 h-3.5 text-gray-300 ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      />
    </button>
  )
}

function ModelRow({
  model,
  testing,
  testResult,
  onChange,
  onDelete,
  onTest
}: {
  model: ProviderModel
  testing: Record<Capability, boolean>
  testResult: { success: boolean; message: string } | null
  onChange: (patch: Partial<ProviderModel>) => void
  onDelete: () => void
  onTest: (cap: Capability) => void
}) {
  const { t } = useTranslation()
  const toggleCapability = (cap: Capability) => {
    const nextCaps = { ...model.capabilities, [cap]: !model.capabilities[cap] }
    if (cap === 'chat') {
      if (nextCaps.chat) {
        onChange({
          capabilities: nextCaps,
          inputs: model.inputs ?? { text: true, image: false }
        })
      } else {
        onChange({ capabilities: nextCaps, inputs: undefined })
      }
    } else {
      onChange({ capabilities: nextCaps })
    }
  }
  const toggleInput = (input: ModelInput) => {
    if (!model.capabilities.chat) return
    const current = model.inputs ?? { text: true, image: false }
    onChange({ inputs: { ...current, [input]: !current[input] } })
  }
  const enabledCaps = (Object.keys(CAPABILITY_META) as Capability[]).filter((c) => model.capabilities[c])
  return (
    <div className="px-5 py-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={model.id}
          onChange={(e) => onChange({ id: e.target.value })}
          placeholder={t('settings.modelIdPlaceholder')}
          className={inputCls + ' flex-1 font-mono text-[13px]'}
        />
        <button
          onClick={onDelete}
          className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          title={t('common.delete')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(CAPABILITY_META) as Capability[]).map((cap) => {
            const meta = CAPABILITY_META[cap]
            const on = model.capabilities[cap]
            const Icon = meta.icon
            return (
              <button
                key={cap}
                onClick={() => toggleCapability(cap)}
                className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  on ? meta.chipClass : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-3 h-3" />
                {meta.label}
              </button>
            )
          })}
        </div>
        {enabledCaps.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
            {enabledCaps.map((cap) => {
              const meta = CAPABILITY_META[cap]
              return (
                <button
                  key={cap}
                  onClick={() => onTest(cap)}
                  disabled={testing[cap]}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  title={`${t('common.test')} ${meta.label}`}
                >
                  {testing[cap] ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <FlaskConical className="w-3 h-3" />
                  )}
                  {t('common.test')}
                </button>
              )
            })}
          </div>
        )}
      </div>
      {model.capabilities.chat && (
        <div className="flex flex-wrap items-center gap-1.5 pl-1">
          <span className="text-[11px] text-gray-400 mr-1">Inputs:</span>
          {(Object.keys(INPUTS_META) as ModelInput[]).map((input) => {
            const meta = INPUTS_META[input]
            const on = model.inputs?.[input] ?? input === 'text'
            const Icon = meta.icon
            return (
              <button
                key={input}
                onClick={() => toggleInput(input)}
                className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  on ? meta.chipClass : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-3 h-3" />
                {meta.label}
              </button>
            )
          })}
        </div>
      )}
      {testResult && <TestResultBanner result={testResult} />}
    </div>
  )
}

function buildCapabilityUrl(provider: Provider, capability: Capability): string {
  const host = provider.apiHost.replace(/\/+$/, '')
  if (!host) return ''
  if (capability === 'chat') return `${host}/chat/completions`
  if (capability === 'embedding') return `${host}/embeddings`
  return provider.kind === 'nvidia' ? `${host}/ranking` : `${host}/rerank`
}

function DefaultModelsCard({
  form,
  setForm,
  updateSettings
}: {
  form: AppSettings
  setForm: React.Dispatch<React.SetStateAction<AppSettings | null>>
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>
}) {
  const { t } = useTranslation()
  const rows: {
    cap: Capability
    key: 'activeChatModel' | 'activeEmbeddingModel' | 'activeRerankModel'
    description: string
  }[] = [
    {
      cap: 'chat',
      key: 'activeChatModel',
      description: t('settings.capabilityChatDesc')
    },
    {
      cap: 'embedding',
      key: 'activeEmbeddingModel',
      description: t('settings.capabilityEmbeddingDesc')
    },
    {
      cap: 'rerank',
      key: 'activeRerankModel',
      description: t('settings.capabilityRerankDesc')
    }
  ]

  const handleSelect = (
    key: 'activeChatModel' | 'activeEmbeddingModel' | 'activeRerankModel',
    value: string
  ) => {
    if (!value) {
      setForm((prev) => (prev ? { ...prev, [key]: null } : prev))
      void updateSettings({ [key]: null })
      return
    }
    const [providerId, ...rest] = value.split('::')
    const modelId = rest.join('::')
    const ref = { providerId, modelId }
    setForm((prev) => (prev ? { ...prev, [key]: ref } : prev))
    void updateSettings({ [key]: ref })
  }

  return (
    <SettingGroup>
      <div className="px-5 py-3 border-b border-gray-100">
        <div className="text-sm font-medium text-gray-800">{t('settings.defaultModels')}</div>
        <div className="mt-0.5 text-xs text-gray-400">{t('settings.defaultModelsDesc')}</div>
      </div>
      {rows.map((row) => {
        const meta = CAPABILITY_META[row.cap]
        const Icon = meta.icon
        const current = form[row.key]
        const value = current ? `${current.providerId}::${current.modelId}` : ''
        const options: { providerName: string; models: { value: string; label: string }[] }[] = []
        for (const p of form.providers) {
          const models = p.models.filter((m) => m.capabilities[row.cap] && m.id.trim())
          if (models.length === 0) continue
          options.push({
            providerName: p.name,
            models: models.map((m) => ({
              value: `${p.id}::${m.id}`,
              label: m.name ? `${m.id} · ${m.name}` : m.id
            }))
          })
        }
        const hasAny = options.length > 0
        return (
          <SettingRow
            key={row.cap}
            label={
              <span className="inline-flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5 text-gray-500" />
                {meta.label}
              </span>
            }
            description={row.description}
          >
            {hasAny ? (
              <select
                value={value}
                onChange={(e) => handleSelect(row.key, e.target.value)}
                className={inputCls}
              >
                <option value="">{t('common.notSpecified')}</option>
                {options.map((g) => (
                  <optgroup key={g.providerName} label={g.providerName}>
                    {g.models.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              <div className="text-xs text-gray-400 px-1">
                {t('settings.noCapability', { cap: meta.label })}
              </div>
            )}
          </SettingRow>
        )
      })}
    </SettingGroup>
  )
}

function LanguagePane() {
  const { t, language, setLanguage } = useTranslation()
  const options: { value: 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'ru'; label: string; desc: string }[] = [
    { value: 'zh', label: t('settings.langZh'), desc: '中文' },
    { value: 'en', label: t('settings.langEn'), desc: 'English' },
    { value: 'ja', label: t('settings.langJa'), desc: '日本語' },
    { value: 'ko', label: t('settings.langKo'), desc: '한국어' },
    { value: 'fr', label: t('settings.langFr'), desc: 'Français' },
    { value: 'de', label: t('settings.langDe'), desc: 'Deutsch' },
    { value: 'ru', label: t('settings.langRu'), desc: 'Русский' }
  ]
  return (
    <div className="space-y-4 px-1">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{t('settings.languageSection')}</h2>
        <p className="text-sm text-gray-500 mt-1">{t('settings.languageDesc')}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLanguage(opt.value)}
            className={`flex flex-col items-start gap-1 p-4 rounded-xl border transition-all text-left ${
              language === opt.value
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100 dark:bg-blue-950/40 dark:ring-blue-900/50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <span className="text-sm font-medium text-gray-900">{opt.label}</span>
            <span className="text-xs text-gray-500">{opt.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { settings, knowledgeBases, loadSettings, loadKnowledgeBases, updateSettings } =
    useKBStore()
  const { assistants, loadAssistants, createAssistant, updateAssistant, deleteAssistant } =
    useAssistantStore()
  const [form, setForm] = useState<AppSettings | null>(null)
  const [section, setSection] = useState<Section>('general')
  const [selectedAssistantId, setSelectedAssistantId] = useState('')
  const [assistantPanelOpen, setAssistantPanelOpen] = useState(false)
  const [creatingAssistant, setCreatingAssistant] = useState(false)
  const [savingAssistant, setSavingAssistant] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedProviderId, setSelectedProviderId] = useState<string>('')

  const [testingMistral, setTestingMistral] = useState(false)
  const [mistralTestResult, setMistralTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  const [testingMap, setTestingMap] = useState<Record<string, Record<Capability, boolean>>>({})
  const [testResultMap, setTestResultMap] = useState<
    Record<string, { success: boolean; message: string } | null>
  >({})

  const [fetchOpen, setFetchOpen] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [fetchedModels, setFetchedModels] = useState<
    { id: string; name?: string; ownedBy?: string }[]
  >([])
  const [pickerState, setPickerState] = useState<
    Record<
      string,
      {
        selected: boolean
        chat: boolean
        embedding: boolean
        rerank: boolean
        text: boolean
        image: boolean
      }
    >
  >({})
  const [fetchSearch, setFetchSearch] = useState('')
  const [fetchCapabilityFilter, setFetchCapabilityFilter] = useState<FetchCapabilityFilter>('all')

  useEffect(() => {
    loadSettings()
    loadAssistants()
    loadKnowledgeBases()
  }, [loadAssistants, loadKnowledgeBases, loadSettings])

  useEffect(() => {
    if (settings && !form) {
      setForm({ ...settings })
      if (settings.providers && settings.providers.length > 0) {
        setSelectedProviderId(settings.activeChatModel?.providerId || settings.providers[0].id)
      }
    }
  }, [settings])

  const selectedAssistant =
    assistants.find((assistant) => assistant.id === selectedAssistantId) ?? assistants[0] ?? null
  const panelAssistant = creatingAssistant ? null : selectedAssistant

  const openCreateAssistant = () => {
    setSelectedAssistantId('')
    setCreatingAssistant(true)
    setAssistantPanelOpen(true)
  }

  const openEditAssistant = (assistant: Assistant) => {
    setSelectedAssistantId(assistant.id)
    setCreatingAssistant(false)
    setAssistantPanelOpen(true)
  }

  const handleSaveAssistant = async (value: AssistantFormValue) => {
    setSavingAssistant(true)
    try {
      const payload = {
        name: value.name,
        description: value.description,
        prompt: value.prompt,
        providerId: value.providerId ?? undefined,
        modelId: value.modelId ?? undefined,
        contextCount: value.contextCount,
        modelParams: value.modelParams,
        knowledgeBaseIds: value.knowledgeBaseIds
      }
      const savedAssistant = panelAssistant
        ? await updateAssistant(panelAssistant.id, payload)
        : await createAssistant(payload)
      setSelectedAssistantId(savedAssistant.id)
      setCreatingAssistant(false)
      setAssistantPanelOpen(false)
    } finally {
      setSavingAssistant(false)
    }
  }

  const handleDeleteAssistant = async (assistant: Assistant) => {
    await deleteAssistant(assistant.id)
    if (selectedAssistantId === assistant.id) {
      setSelectedAssistantId('')
    }
    setAssistantPanelOpen(false)
  }

  const update = (key: keyof AppSettings, value: string | number | boolean) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : null))
    void updateSettings({ [key]: value } as Partial<AppSettings>)
  }

  const updateSelectedProvider = (patch: Partial<Provider>) => {
    setForm((prev) => {
      if (!prev) return prev
      const nextProviders = prev.providers.map((p) =>
        p.id === selectedProviderId ? { ...p, ...patch } : p
      )
      void updateSettings({ providers: nextProviders })
      return { ...prev, providers: nextProviders }
    })
  }

  const updateModel = (modelId: string, patch: Partial<ProviderModel>) => {
    setForm((prev) => {
      if (!prev) return prev
      const nextProviders = prev.providers.map((p) =>
        p.id !== selectedProviderId
          ? p
          : {
              ...p,
              models: p.models.map((m) => (m.id === modelId ? { ...m, ...patch } : m))
            }
      )
      void updateSettings({ providers: nextProviders })
      return { ...prev, providers: nextProviders }
    })
  }

  const addModel = () => {
    if (!form) return
    const newModel: ProviderModel = {
      id: '',
      capabilities: { chat: true, embedding: false, rerank: false },
      inputs: { text: true, image: false }
    }
    const nextProviders = form.providers.map((p) =>
      p.id !== selectedProviderId ? p : { ...p, models: [...p.models, newModel] }
    )
    setForm({ ...form, providers: nextProviders })
    void updateSettings({ providers: nextProviders })
  }

  const deleteModel = (modelId: string) => {
    setForm((prev) => {
      if (!prev) return prev
      const clearRef = (ref: ActiveModelRef | null) =>
        ref && ref.providerId === selectedProviderId && ref.modelId === modelId ? null : ref
      const nextProviders = prev.providers.map((p) =>
        p.id !== selectedProviderId
          ? p
          : { ...p, models: p.models.filter((m) => m.id !== modelId) }
      )
      const nextChat = clearRef(prev.activeChatModel)
      const nextEmbed = clearRef(prev.activeEmbeddingModel)
      const nextRerank = clearRef(prev.activeRerankModel)
      void updateSettings({
        providers: nextProviders,
        activeChatModel: nextChat,
        activeEmbeddingModel: nextEmbed,
        activeRerankModel: nextRerank
      })
      return {
        ...prev,
        providers: nextProviders,
        activeChatModel: nextChat,
        activeEmbeddingModel: nextEmbed,
        activeRerankModel: nextRerank
      }
    })
  }

  const addCustomProvider = () => {
    if (!form) return
    const newProvider: Provider = {
      id: crypto.randomUUID(),
      name: t('common.custom'),
      kind: 'custom',
      isBuiltIn: false,
      apiKey: '',
      apiHost: '',
      models: []
    }
    const nextProviders = [...form.providers, newProvider]
    setForm({ ...form, providers: nextProviders })
    setSelectedProviderId(newProvider.id)
    void updateSettings({ providers: nextProviders })
  }

  const deleteSelectedProvider = () => {
    if (!form) return
    const provider = form.providers.find((p) => p.id === selectedProviderId)
    if (!provider || provider.isBuiltIn) return
    const next = form.providers.filter((p) => p.id !== selectedProviderId)
    const fallback = next.find((p) => p.isBuiltIn)?.id ?? next[0]?.id ?? ''
    const clearRef = (ref: ActiveModelRef | null) =>
      ref && ref.providerId === selectedProviderId ? null : ref
    const nextChat = clearRef(form.activeChatModel)
    const nextEmbed = clearRef(form.activeEmbeddingModel)
    const nextRerank = clearRef(form.activeRerankModel)
    setForm({
      ...form,
      providers: next,
      activeChatModel: nextChat,
      activeEmbeddingModel: nextEmbed,
      activeRerankModel: nextRerank
    })
    setSelectedProviderId(fallback)
    void updateSettings({
      providers: next,
      activeChatModel: nextChat,
      activeEmbeddingModel: nextEmbed,
      activeRerankModel: nextRerank
    })
  }

  const testModelCapability = async (model: ProviderModel, cap: Capability) => {
    if (!form) return
    const provider = form.providers.find((p) => p.id === selectedProviderId)
    if (!provider) return
    const testKey = `${selectedProviderId}:${model.id}:${cap}`
    const url = buildCapabilityUrl(provider, cap)
    setTestingMap((s) => ({
      ...s,
      [model.id]: {
        ...(s[model.id]         ?? { chat: false, embedding: false, rerank: false }),
        [cap]: true
      }
    }))
    setTestResultMap((s) => ({ ...s, [testKey]: null }))
    try {
      const payload: AppSettings = {
        ...form,
        llmApiUrl: cap === 'chat' ? url : form.llmApiUrl,
        llmApiKey: cap === 'chat' ? provider.apiKey : form.llmApiKey,
        llmModel: cap === 'chat' ? model.id : form.llmModel,
        embeddingApiUrl: cap === 'embedding' ? url : form.embeddingApiUrl,
        embeddingApiKey: cap === 'embedding' ? provider.apiKey : form.embeddingApiKey,
        embeddingModel: cap === 'embedding' ? model.id : form.embeddingModel,
        rerankApiUrl: cap === 'rerank' ? url : form.rerankApiUrl,
        rerankApiKey: cap === 'rerank' ? provider.apiKey : form.rerankApiKey,
        rerankModel: cap === 'rerank' ? model.id : form.rerankModel
      }
      const channel =
        cap === 'chat'
          ? 'settings:test-llm'
          : cap === 'embedding'
            ? 'settings:test-embedding'
            : 'settings:test-rerank'
      const res = await window.electronAPI.invoke(channel, payload)
      setTestResultMap((s) => ({ ...s, [testKey]: res }))
    } catch (e: any) {
      setTestResultMap((s) => ({
        ...s,
        [testKey]: { success: false, message: e.message || t('settings.testFailed') }
      }))
    } finally {
      setTestingMap((s) => ({
        ...s,
        [model.id]: {
          ...(s[model.id]         ?? { chat: false, embedding: false, rerank: false }),
          [cap]: false
        }
      }))
    }
  }

  const openFetchDrawer = async () => {
    if (!form) return
    const provider = form.providers.find((p) => p.id === selectedProviderId)
    if (!provider) return
    setFetchOpen(true)
    setFetching(true)
    setFetchError(null)
    setFetchSearch('')
    setFetchCapabilityFilter('all')
    setFetchedModels([])
    setPickerState({})
    try {
      const res = (await window.electronAPI.invoke('provider:list-models', {
        apiHost: provider.apiHost,
        apiKey: provider.apiKey,
        kind: provider.kind
      })) as {
        success: boolean
        message?: string
        models: { id: string; name?: string; ownedBy?: string }[]
      }
      if (!res.success) {
        setFetchError(res.message || t('settings.fetchFailed'))
        return
      }
      const existingIds = new Set(provider.models.map((m) => m.id))
      const fresh = res.models.filter((m) => !existingIds.has(m.id))
      setFetchedModels(fresh)
      const init: Record<
        string,
        {
          selected: boolean
          chat: boolean
          embedding: boolean
          rerank: boolean
          text: boolean
          image: boolean
        }
      > = {}
      for (const m of fresh) {
        const isEmbed = /embed/i.test(m.id)
        const isRerank = /rerank|reranker|ranking/i.test(m.id)
        const isImage = /vision|vl|gpt-4o|claude-3|gemini/i.test(m.id)
        const isChat = !isEmbed && !isRerank
        init[m.id] = {
          selected: false,
          chat: isChat,
          embedding: isEmbed,
          rerank: isRerank,
          text: isChat,
          image: isChat && isImage
        }
      }
      setPickerState(init)
    } catch (e: any) {
      setFetchError(e.message || t('settings.fetchFailed'))
    } finally {
      setFetching(false)
    }
  }

  const addSelectedFetchedModels = () => {
    if (!form) return
    const toAdd: ProviderModel[] = []
    for (const m of fetchedModels) {
      const s = pickerState[m.id]
      if (!s || !s.selected) continue
      toAdd.push({
        id: m.id,
        name: m.name,
        capabilities: { chat: s.chat, embedding: s.embedding, rerank: s.rerank },
        ...(s.chat ? { inputs: { text: s.text, image: s.image } } : {})
      })
    }
    if (toAdd.length === 0) {
      setFetchOpen(false)
      return
    }
    const nextProviders = form.providers.map((p) =>
      p.id !== selectedProviderId
        ? p
        : {
            ...p,
            models: [
              ...p.models,
              ...toAdd.filter((nm) => !p.models.some((existing) => existing.id === nm.id))
            ]
          }
    )
    setForm({ ...form, providers: nextProviders })
    void updateSettings({ providers: nextProviders })
    setFetchOpen(false)
  }

  const handleTestMistral = async () => {
    if (!form) return
    setTestingMistral(true)
    setMistralTestResult(null)
    try {
      setMistralTestResult(await window.electronAPI.invoke('settings:test-mistral', form))
    } catch (e: any) {
      setMistralTestResult({ success: false, message: e.message || t('settings.testFailed') })
    } finally {
      setTestingMistral(false)
    }
  }

  const handlePickAvatar = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !form) return
    if (!file.type.startsWith('image/')) return

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(t('settings.imageLoadFailed')))
      img.src = dataUrl
    })

    const SIZE = 128
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const ratio = Math.max(SIZE / img.width, SIZE / img.height)
    const w = img.width * ratio
    const h = img.height * ratio
    ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h)
    const compact = canvas.toDataURL('image/jpeg', 0.85)
    setForm({ ...form, userAvatar: compact })
    void updateSettings({ userAvatar: compact })
  }

  const handleRemoveAvatar = () => {
    if (!form) return
    setForm({ ...form, userAvatar: '' })
    void updateSettings({ userAvatar: '' })
  }

  const paneMeta = useMemo<Record<Section, { title: string; description?: string }>>(
    () => ({
      general: {
        title: t('settings.nav.profile'),
        description: t('settings.paneDesc.general')
      },
      providers: {
        title: t('settings.nav.providers'),
        description: t('settings.paneDesc.providers')
      },
      models: {
        title: t('settings.nav.defaultModels'),
        description: t('settings.paneDesc.models')
      },
      assistants: {
        title: t('settings.nav.assistants'),
        description: t('settings.paneDesc.assistants')
      },
      ocr: {
        title: t('settings.nav.ocr'),
        description: t('settings.paneDesc.ocr')
      },
      proxy: {
        title: t('settings.nav.proxy'),
        description: t('settings.proxyDesc')
      },
      search: {
        title: t('settings.nav.search'),
        description: t('settings.searchDesc')
      },
      ui: {
        title: t('settings.uiTitle'),
        description: t('settings.paneDesc.ui')
      },
      language: {
        title: t('settings.nav.language')
      }
    }),
    [t]
  )

  if (!form) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const selectedProvider =
    form.providers.find((p) => p.id === selectedProviderId) ?? form.providers[0]

  const filteredFetchedModels = fetchedModels.filter((model) => {
    const query = fetchSearch.trim().toLowerCase()
    const state = pickerState[model.id]
    const matchesSearch =
      !query ||
      model.id.toLowerCase().includes(query) ||
      model.name?.toLowerCase().includes(query) ||
      model.ownedBy?.toLowerCase().includes(query)
    const matchesCapability = fetchCapabilityFilter === 'all' || !!state?.[fetchCapabilityFilter]
    return matchesSearch && matchesCapability
  })

  const isProviderActiveAnywhere = (p: Provider) =>
    form.activeChatModel?.providerId === p.id ||
    form.activeEmbeddingModel?.providerId === p.id ||
    form.activeRerankModel?.providerId === p.id

  return (
    <div className="flex h-full min-h-0 bg-white">
      <Sidebar active={section} onSelect={setSection} onBack={() => navigate('/')} />

      <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
        <div className="h-full min-h-0 max-w-[960px] mx-auto px-8 py-6 flex flex-col">
          <PaneHeader
            title={paneMeta[section].title}
            description={paneMeta[section].description}
          />

          {section === 'general' && (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
              <SettingGroup>
                <SettingRow
                  label={t('settings.avatar')}
                  description={t('settings.avatarDesc')}
                  align="start"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 border border-gray-200">
                      {form.userAvatar ? (
                        <img
                          src={form.userAvatar}
                          alt={t('settings.avatar')}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <UserIcon className="w-7 h-7 text-white" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePickAvatar}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        {form.userAvatar ? t('settings.changeAvatar') : t('settings.uploadAvatar')}
                      </button>
                      {form.userAvatar && (
                        <button
                          onClick={handleRemoveAvatar}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          {t('common.remove')}
                        </button>
                      )}
                    </div>
                  </div>
                </SettingRow>
              </SettingGroup>
              <p className="text-xs text-gray-400 px-1">{t('settings.saveHint')}</p>
            </div>
          )}

          {section === 'providers' && selectedProvider && (
            <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
              <div className="flex flex-1 min-h-0 gap-5">
                <div className="w-[200px] shrink-0 min-h-0 flex flex-col gap-3">
                  <div className="rounded-xl border border-gray-200 bg-white flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-0.5">
                      {form.providers.map((p) => (
                        <ProviderListItem
                          key={p.id}
                          provider={p}
                          selected={p.id === selectedProviderId}
                          isActiveAnywhere={isProviderActiveAnywhere(p)}
                          onClick={() => setSelectedProviderId(p.id)}
                        />
                      ))}
                    </div>
                    <button
                      onClick={addCustomProvider}
                      className="flex items-center justify-center gap-1.5 h-9 text-xs text-gray-600 border-t border-gray-200 hover:bg-gray-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t('settings.addCustomProvider')}
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-w-0 min-h-0 overflow-y-auto space-y-4 pr-1">
                  <SettingGroup>
                    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white ${PROVIDER_KIND_COLOR[selectedProvider.kind]}`}
                      >
                        {selectedProvider.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        {selectedProvider.isBuiltIn ? (
                          <div className="text-sm font-medium text-gray-900">
                            {selectedProvider.name}
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={selectedProvider.name}
                            onChange={(e) => updateSelectedProvider({ name: e.target.value })}
                            className="text-sm font-medium text-gray-900 bg-transparent border-b border-transparent focus:border-gray-300 focus:outline-none w-full max-w-[200px]"
                          />
                        )}
                        <div className="text-xs text-gray-400">
                          {selectedProvider.kind === 'custom'
                            ? t('common.custom')
                            : PROVIDER_KIND_BADGE[selectedProvider.kind]}
                          {selectedProvider.isBuiltIn
                            ? ` · ${t('common.builtin')}`
                            : ` · ${t('common.custom')}`}
                        </div>
                      </div>
                      {!selectedProvider.isBuiltIn && (
                        <button
                          onClick={deleteSelectedProvider}
                          className="text-xs px-2.5 py-1 rounded border border-red-100 text-red-500 hover:bg-red-50"
                        >
                          {t('common.delete')}
                        </button>
                      )}
                    </div>
                    <SettingRow
                      label={t('settings.apiHost')}
                      description={t('settings.apiHostDesc')}
                    >
                      <input
                        type="text"
                        value={selectedProvider.apiHost}
                        onChange={(e) => updateSelectedProvider({ apiHost: e.target.value })}
                        placeholder="https://api.deepseek.com/v1"
                        className={inputCls}
                      />
                    </SettingRow>
                    <SettingRow label="API Key">
                      <div className="relative">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                          type="password"
                          value={selectedProvider.apiKey}
                          onChange={(e) => updateSelectedProvider({ apiKey: e.target.value })}
                          placeholder="sk-..."
                          className={inputCls + ' pl-9'}
                        />
                      </div>
                    </SettingRow>
                  </SettingGroup>

                  <SettingGroup>
                    <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800">
                          {t('settings.modelList')}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-400">
                          {t('settings.modelListDesc')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={openFetchDrawer}
                          disabled={!selectedProvider.apiHost || !selectedProvider.apiKey}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <Sparkles className="w-3 h-3" />
                          {t('settings.fetchFromService')}
                        </button>
                        <button
                          onClick={addModel}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          <Plus className="w-3 h-3" />
                          {t('settings.addModel')}
                        </button>
                      </div>
                    </div>
                    {selectedProvider.models.length === 0 ? (
                      <div className="px-5 py-8 text-center text-xs text-gray-400">
                        {t('settings.noModels')}
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {selectedProvider.models.map((m, idx) => {
                          const testKey = (cap: Capability) =>
                            `${selectedProviderId}:${m.id}:${cap}`
                          const lastResult =
                            testResultMap[testKey('chat')] ||
                            testResultMap[testKey('embedding')] ||
                            testResultMap[testKey('rerank')] ||
                            null
                          return (
                            <ModelRow
                              key={idx}
                              model={m}
                              testing={
                                testingMap[m.id] ?? {
                                  chat: false,
                                  embedding: false,
                                  rerank: false
                                }
                              }
                              testResult={lastResult}
                              onChange={(patch) => updateModel(m.id, patch)}
                              onDelete={() => deleteModel(m.id)}
                              onTest={(cap) => testModelCapability(m, cap)}
                            />
                          )
                        })}
                      </div>
                    )}
                  </SettingGroup>
                </div>
              </div>

              {fetchOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
                  onClick={() => !fetching && setFetchOpen(false)}
                >
                  <div
                    className="bg-white rounded-xl shadow-2xl w-[640px] max-h-[80vh] flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                      <div className="text-sm font-medium text-gray-800">
                        {t('settings.fetchTitle', { name: selectedProvider.name })}
                      </div>
                      <button
                        onClick={() => setFetchOpen(false)}
                        disabled={fetching}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-5 py-3">
                      {fetching ? (
                        <div className="flex items-center justify-center py-12 text-sm text-gray-500">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          {t('settings.fetchingModels')}
                        </div>
                      ) : fetchError ? (
                        <div className="rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs px-3 py-2">
                          {fetchError}
                        </div>
                      ) : fetchedModels.length === 0 ? (
                        <div className="py-12 text-center text-xs text-gray-400">
                          {t('settings.noNewModels')}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                              <input
                                type="text"
                                value={fetchSearch}
                                onChange={(e) => setFetchSearch(e.target.value)}
                                placeholder={t('settings.searchModelsPlaceholder')}
                                className={inputCls + ' pl-9 bg-white'}
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {FETCH_FILTERS.map((filter) => {
                                const active = fetchCapabilityFilter === filter.key
                                return (
                                  <button
                                    key={filter.key}
                                    type="button"
                                    onClick={() => setFetchCapabilityFilter(filter.key)}
                                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                                      active
                                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                                        : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                                    }`}
                                  >
                                    {filter.key === 'all'
                                      ? t('settings.filterAll')
                                      : filter.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500 px-1 pb-1.5">
                            <span>
                              {t('settings.modelCount', { n: fetchedModels.length })}
                              {filteredFetchedModels.length !== fetchedModels.length
                                ? ` · ${t('settings.modelCountShown', {
                                    n: filteredFetchedModels.length
                                  })}`
                                : ''}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setPickerState((s) => {
                                    const next = { ...s }
                                    for (const m of filteredFetchedModels) {
                                      next[m.id] = { ...next[m.id], selected: true }
                                    }
                                    return next
                                  })
                                }}
                                className="hover:text-gray-700"
                              >
                                {t('settings.selectAll')}
                              </button>
                              <span className="text-gray-300">|</span>
                              <button
                                onClick={() => {
                                  setPickerState((s) => {
                                    const next = { ...s }
                                    for (const m of filteredFetchedModels) {
                                      next[m.id] = { ...next[m.id], selected: false }
                                    }
                                    return next
                                  })
                                }}
                                className="hover:text-gray-700"
                              >
                                {t('settings.selectNone')}
                              </button>
                            </div>
                          </div>
                          {filteredFetchedModels.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-xs text-gray-400">
                              {t('settings.noMatchingModels')}
                            </div>
                          ) : (
                            filteredFetchedModels.map((m) => {
                              const s = pickerState[m.id] ?? {
                                selected: false,
                                chat: true,
                                embedding: false,
                                rerank: false,
                                text: true,
                                image: false
                              }
                              return (
                                <label
                                  key={m.id}
                                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                                    s.selected
                                      ? 'border-blue-200 bg-blue-50/50'
                                      : 'border-gray-100 hover:bg-gray-50'
                                  } cursor-pointer`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={s.selected}
                                    onChange={(e) =>
                                      setPickerState((prev) => ({
                                        ...prev,
                                        [m.id]: { ...s, selected: e.target.checked }
                                      }))
                                    }
                                    className="w-3.5 h-3.5"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-mono text-gray-800 truncate">
                                      {m.id}
                                    </div>
                                    {m.name && m.name !== m.id ? (
                                      <div className="text-[11px] text-gray-400 truncate">
                                        {m.name}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div
                                    className="flex items-center gap-1.5 text-[11px]"
                                    onClick={(e) => e.preventDefault()}
                                  >
                                    {(Object.keys(CAPABILITY_META) as Capability[]).map((c) => {
                                      const meta = CAPABILITY_META[c]
                                      const on = s[c]
                                      const Icon = meta.icon
                                      return (
                                        <button
                                          key={c}
                                          type="button"
                                          onClick={() =>
                                            setPickerState((prev) => ({
                                              ...prev,
                                              [m.id]: { ...s, [c]: !on }
                                            }))
                                          }
                                          className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] ${
                                            on
                                              ? meta.chipClass
                                              : 'bg-white text-gray-400 border-gray-200'
                                          }`}
                                        >
                                          <Icon className="w-2.5 h-2.5" />
                                          {meta.label}
                                        </button>
                                      )
                                    })}
                                    {s.chat &&
                                      (Object.keys(INPUTS_META) as ModelInput[]).map((input) => {
                                        const meta = INPUTS_META[input]
                                        const on = s[input]
                                        const Icon = meta.icon
                                        return (
                                          <button
                                            key={input}
                                            type="button"
                                            onClick={() =>
                                              setPickerState((prev) => ({
                                                ...prev,
                                                [m.id]: { ...s, [input]: !on }
                                              }))
                                            }
                                            className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] ${
                                              on
                                                ? meta.chipClass
                                                : 'bg-white text-gray-400 border-gray-200'
                                            }`}
                                          >
                                            <Icon className="w-2.5 h-2.5" />
                                            {meta.label}
                                          </button>
                                        )
                                      })}
                                  </div>
                                </label>
                              )
                            })
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
                      <button
                        onClick={() => setFetchOpen(false)}
                        className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={addSelectedFetchedModels}
                        disabled={
                          fetching || !fetchedModels.some((m) => pickerState[m.id]?.selected)
                        }
                        className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {t('settings.addSelected')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {section === 'models' && (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-5">
              <DefaultModelsCard form={form} setForm={setForm} updateSettings={updateSettings} />
            </div>
          )}

          {section === 'assistants' && (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-5">
              <div className="rounded-3xl border border-slate-100 bg-gradient-to-br from-slate-50 via-white to-white p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-gray-900 dark:to-gray-900">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">
                        {t('settings.assistantSettings')}
                      </h3>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
                        {t('settings.assistantDesc')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={openCreateAssistant}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-blue-600 hover:to-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    {t('settings.createAssistant')}
                  </button>
                </div>
              </div>

              {assistants.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center">
                  <Bot className="mx-auto h-10 w-10 text-gray-300" />
                  <div className="mt-3 text-sm font-medium text-gray-700">
                    {t('settings.noAssistants')}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {t('settings.createAssistantHint')}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {assistants.map((assistant) => (
                    <div
                      key={assistant.id}
                      className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:border-slate-200 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-slate-700"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-semibold text-gray-900">
                          {assistant.name}
                        </div>
                        {assistant.modelId ? (
                          <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {assistant.modelId}
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                            {t('settings.globalDefaultModel')}
                          </span>
                        )}
                        {assistant.knowledgeBaseIds.length > 0 && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                            {t('settings.kbCount', {
                              n: assistant.knowledgeBaseIds.length
                            })}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditAssistant(assistant)}
                          className="ml-auto shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                        >
                          {t('common.edit')}
                        </button>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                        {assistant.description || t('settings.noDescription')}
                      </p>
                      <div className="mt-2 rounded-xl bg-gray-50 px-3 py-2">
                        <p className="line-clamp-2 text-[11px] leading-5 text-gray-500">
                          {assistant.prompt || t('settings.noPrompt')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <AssistantSettingsPanel
                open={assistantPanelOpen}
                assistant={panelAssistant}
                assistants={assistants}
                knowledgeBases={knowledgeBases}
                settings={form}
                saving={savingAssistant}
                onClose={() => {
                  setAssistantPanelOpen(false)
                  setCreatingAssistant(false)
                }}
                onSave={handleSaveAssistant}
                onDelete={handleDeleteAssistant}
              />
            </div>
          )}

          {section === 'ocr' && (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-5">
              <SettingGroup>
                <SettingRow
                  label={t('settings.apiKeyMistral')}
                  description={
                    <a
                      href="https://admin.mistral.ai/organization/api-keys"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-500 hover:underline dark:text-blue-400 inline-flex items-center gap-1 align-middle"
                    >
                      {t('settings.mistralKeyHint')}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  }
                >
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="password"
                      value={form.mistralApiKey}
                      onChange={(e) => update('mistralApiKey', e.target.value)}
                      placeholder={t('settings.mistralPlaceholder')}
                      className={inputCls + ' pl-9'}
                    />
                  </div>
                </SettingRow>
                <SettingRow label={t('settings.apiUrl')}>
                  <input
                    type="text"
                    value={form.mistralApiUrl}
                    onChange={(e) => update('mistralApiUrl', e.target.value)}
                    placeholder="https://api.mistral.ai/v1/ocr"
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label={t('settings.model')}>
                  <input
                    type="text"
                    value={form.mistralOcrModel}
                    onChange={(e) => update('mistralOcrModel', e.target.value)}
                    placeholder="mistral-ocr-latest"
                    className={inputCls}
                  />
                </SettingRow>
              </SettingGroup>

              <div className="flex justify-end">
                <button
                  onClick={handleTestMistral}
                  disabled={testingMistral || !form.mistralApiKey}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-emerald-200 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                >
                  {testingMistral ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <FlaskConical className="w-3 h-3" />
                  )}
                  {t('settings.testConnection')}
                </button>
              </div>
              <TestResultBanner result={mistralTestResult} />
            </div>
          )}

          {section === 'proxy' && (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-5">
              <SettingGroup>
                <SettingRow
                  label={t('settings.enableProxy')}
                  description={t('settings.proxyDesc')}
                >
                  <div className="flex justify-end">
                    <Toggle
                      on={form.proxyEnabled}
                      onChange={() => update('proxyEnabled', form.proxyEnabled ? 0 : 1)}
                    />
                  </div>
                </SettingRow>
                {form.proxyEnabled ? (
                  <SettingRow
                    label={t('settings.proxyAddress')}
                    description={t('settings.proxyAddressDesc')}
                  >
                    <input
                      type="text"
                      value={form.proxyUrl}
                      onChange={(e) => update('proxyUrl', e.target.value)}
                      placeholder="http://127.0.0.1:7890"
                      className={inputCls}
                    />
                  </SettingRow>
                ) : null}
              </SettingGroup>
              {!form.proxyEnabled && (
                <p className="text-xs text-gray-400 px-1">{t('settings.proxyHint')}</p>
              )}
            </div>
          )}

          {section === 'search' && (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-5">
              <SettingGroup>
                <SettingRow
                  label={t('settings.searchTopK')}
                  description={t('settings.searchTopKDesc')}
                >
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={form.searchTopK}
                    onChange={(e) => update('searchTopK', Math.max(1, Number(e.target.value) || 1))}
                    className={`${inputCls} max-w-[160px]`}
                  />
                </SettingRow>
                <SettingRow
                  label={t('settings.embeddingTopK')}
                  description={t('settings.embeddingTopKDesc')}
                >
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={form.embeddingTopK}
                    onChange={(e) => update('embeddingTopK', Math.max(1, Number(e.target.value) || 1))}
                    className={`${inputCls} max-w-[160px]`}
                  />
                </SettingRow>
              </SettingGroup>
              <p className="text-xs text-gray-400 px-1">{t('settings.searchHint')}</p>
            </div>
          )}

          {section === 'ui' && (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {t('settings.themeSection')}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t('settings.themeDesc')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(['light', 'dark'] as const).map((th) => {
                  const active = (form?.theme ?? 'light') === th
                  return (
                    <button
                      key={th}
                      type="button"
                      onClick={() => {
                        update('theme', th)
                      }}
                      className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${
                        active
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100 dark:bg-blue-950/40 dark:ring-blue-900/50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <span
                        className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                          th === 'light'
                            ? 'bg-white border-gray-300 dark:bg-gray-900 dark:border-gray-700'
                            : 'bg-gray-900 border-gray-700'
                        }`}
                      >
                        {th === 'light' ? (
                          <span className="w-3 h-3 rounded-full bg-amber-400" />
                        ) : (
                          <span className="w-3 h-3 rounded-full bg-slate-500" />
                        )}
                      </span>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {th === 'light' ? t('settings.themeLight') : t('settings.themeDark')}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
              <SettingGroup>
                <SettingRow
                  label={t('settings.codeBlockWordWrap')}
                  description={t('settings.codeBlockWordWrapDesc')}
                >
                  <div className="flex justify-end">
                    <Toggle
                      on={form.codeBlockWordWrap}
                      onChange={() => update('codeBlockWordWrap', !form.codeBlockWordWrap)}
                    />
                  </div>
                </SettingRow>
                <SettingRow
                  label={t('settings.codeBlockShowLineNumbers')}
                  description={t('settings.codeBlockShowLineNumbersDesc')}
                >
                <div className="flex justify-end">
                  <Toggle
                    on={form.codeBlockShowLineNumbers}
                    onChange={() => update('codeBlockShowLineNumbers', !form.codeBlockShowLineNumbers)}
                  />
                </div>
              </SettingRow>
            </SettingGroup>
            <SettingGroup>
              <SettingRow
                label={t('settings.codeTheme')}
                description={t('settings.codeThemeDesc')}
              >
                <select
                  value={form.codeTheme}
                  onChange={(e) => {
                    const ct = e.target.value as CodeTheme
                    update('codeTheme', ct)
                  }}
                  className={inputCls}
                >
                  {CODE_THEMES.map((ct) => (
                    <option key={ct} value={ct}>
                      {CODE_THEME_LABELS[ct]}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow
                label={t('settings.codeFont')}
                description={t('settings.codeFontDesc')}
              >
                <select
                  value={form.codeFont}
                  onChange={(e) => {
                    const cf = e.target.value as CodeFont
                    update('codeFont', cf)
                  }}
                  className={inputCls}
                >
                  {CODE_FONTS.map((cf) => (
                    <option key={cf} value={cf}>
                      {CODE_FONT_LABELS[cf]}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow
                label={t('settings.codeFontSize')}
                description={t('settings.codeFontSizeDesc')}
              >
                <select
                  value={form.codeFontSize}
                  onChange={(e) => {
                    const cfs = e.target.value as CodeFontSize
                    update('codeFontSize', cfs)
                  }}
                  className={inputCls}
                >
                  {CODE_FONT_SIZES.map((cfs) => (
                    <option key={cfs} value={cfs}>
                      {CODE_FONT_SIZE_LABELS[cfs]}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <div className="px-5 py-4 overflow-hidden">
                <MessageMarkdown content={CODE_THEME_DEMO} />
              </div>
            </SettingGroup>
          </div>
        )}

          {section === 'language' && (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-5">
              <LanguagePane />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

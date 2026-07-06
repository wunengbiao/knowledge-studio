import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Bot,
  Save,
  Key,
  Check,
  FlaskConical,
  Loader2,
  XCircle,
  Wifi,
  ScanText,
  User as UserIcon,
  Upload,
  Trash2,
  Plus,
  Sparkles,
  ChevronRight,
  MessageSquare,
  Search,
  Layers,
  ListOrdered
} from 'lucide-react'
import { useKBStore } from '../stores/kb-store'
import type {
  ActiveModelRef,
  AppSettings,
  Assistant,
  Provider,
  ProviderKind,
  ProviderModel
} from '@shared/types'
import {
  type AssistantFormValue,
  AssistantSettingsPanel
} from '../components/assistant/AssistantSettingsPanel'
import { useAssistantStore } from '../stores/assistant-store'

type Capability = 'chat' | 'embedding' | 'rerank'
type FetchCapabilityFilter = Capability | 'all'

function SettingGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200/80 bg-white">
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

const PROVIDER_KIND_BADGE: Record<ProviderKind, string> = {
  deepseek: 'DeepSeek',
  nvidia: 'NVIDIA',
  mistral: 'Mistral',
  gemini: 'Gemini',
  custom: '自定义'
}

const PROVIDER_KIND_COLOR: Record<ProviderKind, string> = {
  deepseek: 'bg-indigo-500',
  nvidia: 'bg-emerald-500',
  mistral: 'bg-orange-500',
  gemini: 'bg-blue-500',
  custom: 'bg-gray-400'
}

const CAPABILITY_META: Record<
  Capability,
  { label: string; chipClass: string; icon: React.ComponentType<{ className?: string }> }
> = {
  chat: {
    label: 'Chat',
    chipClass: 'border-purple-200 bg-purple-50 text-purple-700',
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

const FETCH_FILTERS: { key: FetchCapabilityFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'chat', label: 'Chat' },
  { key: 'embedding', label: 'Embedding' },
  { key: 'rerank', label: 'ReRank' }
]

type Section = 'general' | 'providers' | 'models' | 'assistants' | 'ocr' | 'proxy'

const NAV_GROUPS: {
  title: string
  items: { key: Section; label: string; icon: React.ComponentType<{ className?: string }> }[]
}[] = [
  { title: '通用', items: [{ key: 'general', label: '个人资料', icon: UserIcon }] },
  {
    title: '模型',
    items: [
      { key: 'providers', label: '模型提供商', icon: Sparkles },
      { key: 'models', label: '默认模型', icon: MessageSquare },
      { key: 'assistants', label: '助手设置', icon: Bot }
    ]
  },
  { title: '服务', items: [{ key: 'ocr', label: 'PDF OCR', icon: ScanText }] },
  { title: '应用设置', items: [{ key: 'proxy', label: '网络代理', icon: Wifi }] }
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
  return (
    <aside className="w-[220px] flex-shrink-0 border-r border-gray-200/80 bg-gray-50/40 flex flex-col">
      <div className="px-3 py-3.5 flex items-center gap-2 border-b border-gray-200/70">
        <button
          onClick={onBack}
          className="p-1 rounded-md hover:bg-gray-200/70 transition-colors"
          title="返回"
        >
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </button>
        <h1 className="text-sm font-semibold text-gray-800">设置</h1>
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-normal text-gray-400">
              {group.title}
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
                        ? 'bg-gray-200/80 font-medium text-gray-900'
                        : 'text-gray-600 hover:bg-gray-200/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
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
  description,
  saved,
  onSave
}: {
  title: string
  description?: string
  saved: boolean
  onSave: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
        {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
      </div>
      <button
        onClick={onSave}
        className="flex-shrink-0 flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors"
      >
        {saved ? (
          <>
            <Check className="w-3.5 h-3.5" />
            已保存
          </>
        ) : (
          <>
            <Save className="w-3.5 h-3.5" />
            保存
          </>
        )}
      </button>
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
  return (
    <button
      onClick={onClick}
      data-selected={selected || undefined}
      className={`w-full group flex items-center gap-2.5 h-10 px-2.5 rounded-[10px] text-sm transition-colors ${
        selected ? 'bg-gray-200/80 text-gray-900' : 'text-gray-700 hover:bg-gray-200/50'
      }`}
    >
      <span
        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white ${PROVIDER_KIND_COLOR[provider.kind]}`}
      >
        {provider.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="flex-1 min-w-0 text-left truncate">{provider.name}</span>
      {isActiveAnywhere && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="正在使用" />
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
  const toggleCapability = (cap: Capability) => {
    onChange({
      capabilities: { ...model.capabilities, [cap]: !model.capabilities[cap] }
    })
  }
  const enabledCaps = (Object.keys(CAPABILITY_META) as Capability[]).filter(
    (c) => model.capabilities[c]
  )
  return (
    <div className="px-5 py-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={model.id}
          onChange={(e) => onChange({ id: e.target.value })}
          placeholder="模型 ID,如 deepseek-chat"
          className={inputCls + ' flex-1 font-mono text-[13px]'}
        />
        <button
          onClick={onDelete}
          className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="删除"
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
                  title={`测试 ${meta.label}`}
                >
                  {testing[cap] ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <FlaskConical className="w-3 h-3" />
                  )}
                  测试
                </button>
              )
            })}
          </div>
        )}
      </div>
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
  setForm
}: {
  form: AppSettings
  setForm: React.Dispatch<React.SetStateAction<AppSettings | null>>
}) {
  const rows: {
    cap: Capability
    key: 'activeChatModel' | 'activeEmbeddingModel' | 'activeRerankModel'
    description: string
  }[] = [
    {
      cap: 'chat',
      key: 'activeChatModel',
      description: '用于对话回答与 GraphRAG 的默认大语言模型。'
    },
    {
      cap: 'embedding',
      key: 'activeEmbeddingModel',
      description: '检索阶段对查询与片段进行向量化的默认模型。'
    },
    {
      cap: 'rerank',
      key: 'activeRerankModel',
      description: '对召回结果重新排序的默认模型(需在上方开启 ReRank)。'
    }
  ]

  const handleSelect = (
    key: 'activeChatModel' | 'activeEmbeddingModel' | 'activeRerankModel',
    value: string
  ) => {
    if (!value) {
      setForm((prev) => (prev ? { ...prev, [key]: null } : prev))
      return
    }
    const [providerId, ...rest] = value.split('::')
    const modelId = rest.join('::')
    setForm((prev) => (prev ? { ...prev, [key]: { providerId, modelId } } : prev))
  }

  return (
    <SettingGroup>
      <div className="px-5 py-3 border-b border-gray-100">
        <div className="text-sm font-medium text-gray-800">默认模型</div>
        <div className="mt-0.5 text-xs text-gray-400">
          为每种能力指定默认模型,新会话与未指定模型的检索流程将使用这里的选择。
        </div>
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
                <option value="">未指定</option>
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
                尚未在任一提供商中勾选 {meta.label} 能力。
              </div>
            )}
          </SettingRow>
        )
      })}
    </SettingGroup>
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { settings, knowledgeBases, loadSettings, loadKnowledgeBases, updateSettings } =
    useKBStore()
  const { assistants, loadAssistants, createAssistant, updateAssistant, deleteAssistant } =
    useAssistantStore()
  const [form, setForm] = useState<AppSettings | null>(null)
  const [saved, setSaved] = useState(false)
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
    Record<string, { selected: boolean; chat: boolean; embedding: boolean; rerank: boolean }>
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

  const handleSave = async () => {
    if (!form) return
    await updateSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

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

  const update = (key: keyof AppSettings, value: string | number) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : null))
  }

  const updateSelectedProvider = (patch: Partial<Provider>) => {
    setForm((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        providers: prev.providers.map((p) => (p.id === selectedProviderId ? { ...p, ...patch } : p))
      }
    })
  }

  const updateModel = (modelId: string, patch: Partial<ProviderModel>) => {
    setForm((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        providers: prev.providers.map((p) =>
          p.id !== selectedProviderId
            ? p
            : {
                ...p,
                models: p.models.map((m) => (m.id === modelId ? { ...m, ...patch } : m))
              }
        )
      }
    })
  }

  const addModel = () => {
    if (!form) return
    const newModel: ProviderModel = {
      id: '',
      capabilities: { chat: true, embedding: false, rerank: false }
    }
    setForm({
      ...form,
      providers: form.providers.map((p) =>
        p.id !== selectedProviderId ? p : { ...p, models: [...p.models, newModel] }
      )
    })
  }

  const deleteModel = (modelId: string) => {
    setForm((prev) => {
      if (!prev) return prev
      const clearRef = (ref: ActiveModelRef | null) =>
        ref && ref.providerId === selectedProviderId && ref.modelId === modelId ? null : ref
      return {
        ...prev,
        providers: prev.providers.map((p) =>
          p.id !== selectedProviderId
            ? p
            : { ...p, models: p.models.filter((m) => m.id !== modelId) }
        ),
        activeChatModel: clearRef(prev.activeChatModel),
        activeEmbeddingModel: clearRef(prev.activeEmbeddingModel),
        activeRerankModel: clearRef(prev.activeRerankModel)
      }
    })
  }

  const addCustomProvider = () => {
    if (!form) return
    const newProvider: Provider = {
      id: crypto.randomUUID(),
      name: '自定义',
      kind: 'custom',
      isBuiltIn: false,
      apiKey: '',
      apiHost: '',
      models: []
    }
    setForm({ ...form, providers: [...form.providers, newProvider] })
    setSelectedProviderId(newProvider.id)
  }

  const deleteSelectedProvider = () => {
    if (!form) return
    const provider = form.providers.find((p) => p.id === selectedProviderId)
    if (!provider || provider.isBuiltIn) return
    const next = form.providers.filter((p) => p.id !== selectedProviderId)
    const fallback = next.find((p) => p.isBuiltIn)?.id ?? next[0]?.id ?? ''
    const clearRef = (ref: ActiveModelRef | null) =>
      ref && ref.providerId === selectedProviderId ? null : ref
    setForm({
      ...form,
      providers: next,
      activeChatModel: clearRef(form.activeChatModel),
      activeEmbeddingModel: clearRef(form.activeEmbeddingModel),
      activeRerankModel: clearRef(form.activeRerankModel)
    })
    setSelectedProviderId(fallback)
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
        ...(s[model.id] ?? { chat: false, embedding: false, rerank: false }),
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
        [testKey]: { success: false, message: e.message || '测试失败' }
      }))
    } finally {
      setTestingMap((s) => ({
        ...s,
        [model.id]: {
          ...(s[model.id] ?? { chat: false, embedding: false, rerank: false }),
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
        setFetchError(res.message || '获取失败')
        return
      }
      const existingIds = new Set(provider.models.map((m) => m.id))
      const fresh = res.models.filter((m) => !existingIds.has(m.id))
      setFetchedModels(fresh)
      const init: Record<
        string,
        { selected: boolean; chat: boolean; embedding: boolean; rerank: boolean }
      > = {}
      for (const m of fresh) {
        const isEmbed = /embed/i.test(m.id)
        const isRerank = /rerank|reranker|ranking/i.test(m.id)
        init[m.id] = {
          selected: false,
          chat: !isEmbed && !isRerank,
          embedding: isEmbed,
          rerank: isRerank
        }
      }
      setPickerState(init)
    } catch (e: any) {
      setFetchError(e.message || '获取失败')
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
        capabilities: { chat: s.chat, embedding: s.embedding, rerank: s.rerank }
      })
    }
    if (toAdd.length === 0) {
      setFetchOpen(false)
      return
    }
    setForm({
      ...form,
      providers: form.providers.map((p) =>
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
    })
    setFetchOpen(false)
  }

  const handleTestMistral = async () => {
    if (!form) return
    setTestingMistral(true)
    setMistralTestResult(null)
    try {
      setMistralTestResult(await window.electronAPI.invoke('settings:test-mistral', form))
    } catch (e: any) {
      setMistralTestResult({ success: false, message: e.message || '测试失败' })
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
      img.onerror = () => reject(new Error('图片加载失败'))
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
  }

  const handleRemoveAvatar = () => {
    if (!form) return
    setForm({ ...form, userAvatar: '' })
  }

  const paneMeta = useMemo<Record<Section, { title: string; description?: string }>>(
    () => ({
      general: {
        title: '个人资料',
        description: '自定义你的头像,将显示在对话中你的消息旁。'
      },
      providers: {
        title: '模型提供商',
        description:
          '为每个提供商配置 API Host 和 Key,然后在统一的模型列表中勾选每个模型支持的能力。'
      },
      models: {
        title: '默认模型',
        description:
          '为 Chat / Embedding / ReRank 指定全局默认模型,所有新对话与检索流程都会使用这些默认值。'
      },
      assistants: {
        title: '助手设置',
        description: '配置助手提示词、模型参数和默认知识库,在 Chat 页面切换选择。'
      },
      ocr: {
        title: 'PDF OCR',
        description: '配置后,PDF 通过 Mistral OCR 转 Markdown;未配置则降级为纯文本提取。'
      },
      proxy: {
        title: '网络代理',
        description: '通过 HTTP 代理访问外部 API。'
      }
    }),
    []
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
            saved={saved}
            onSave={handleSave}
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
                  label="头像"
                  description="JPG / PNG / WebP,将自动压缩为 128×128。"
                  align="start"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 border border-gray-200">
                      {form.userAvatar ? (
                        <img
                          src={form.userAvatar}
                          alt="头像"
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
                        {form.userAvatar ? '更换头像' : '上传头像'}
                      </button>
                      {form.userAvatar && (
                        <button
                          onClick={handleRemoveAvatar}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          移除
                        </button>
                      )}
                    </div>
                  </div>
                </SettingRow>
              </SettingGroup>
              <p className="text-xs text-gray-400 px-1">点击右上角"保存"以应用更改。</p>
            </div>
          )}

          {section === 'providers' && selectedProvider && (
            <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
              <div className="flex flex-1 min-h-0 gap-5">
                <div className="w-[200px] shrink-0 min-h-0 flex flex-col gap-3">
                  <div className="rounded-xl border border-gray-200/80 bg-white flex-1 min-h-0 flex flex-col overflow-hidden">
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
                      className="flex items-center justify-center gap-1.5 h-9 text-xs text-gray-600 border-t border-gray-200/80 hover:bg-gray-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      添加自定义提供商
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
                          {PROVIDER_KIND_BADGE[selectedProvider.kind]}
                          {selectedProvider.isBuiltIn ? ' · 内置' : ' · 自定义'}
                        </div>
                      </div>
                      {!selectedProvider.isBuiltIn && (
                        <button
                          onClick={deleteSelectedProvider}
                          className="text-xs px-2.5 py-1 rounded border border-red-100 text-red-500 hover:bg-red-50"
                        >
                          删除
                        </button>
                      )}
                    </div>
                    <SettingRow
                      label="API Host"
                      description="基础地址,Chat / Embedding / ReRank 自动拼接路径。"
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
                        <div className="text-sm font-medium text-gray-800">模型列表</div>
                        <div className="mt-0.5 text-xs text-gray-400">
                          每个模型可同时承担多种能力,只勾选该模型实际支持的项。
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={openFetchDrawer}
                          disabled={!selectedProvider.apiHost || !selectedProvider.apiKey}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <Sparkles className="w-3 h-3" />
                          从服务获取
                        </button>
                        <button
                          onClick={addModel}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          <Plus className="w-3 h-3" />
                          添加模型
                        </button>
                      </div>
                    </div>
                    {selectedProvider.models.length === 0 ? (
                      <div className="px-5 py-8 text-center text-xs text-gray-400">
                        暂无模型,点击右上角"添加模型"。
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
                              key={`${m.id}-${idx}`}
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

                  <SettingGroup>
                    <SettingRow
                      label="启用 ReRank"
                      description="全局开关,关闭后所有提供商均不执行重排序。"
                    >
                      <div className="flex justify-end">
                        <Toggle
                          on={form.rerankEnabled}
                          onChange={() => update('rerankEnabled', form.rerankEnabled ? 0 : 1)}
                        />
                      </div>
                    </SettingRow>
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
                        从 {selectedProvider.name} 获取模型列表
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
                          正在获取模型列表...
                        </div>
                      ) : fetchError ? (
                        <div className="rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs px-3 py-2">
                          {fetchError}
                        </div>
                      ) : fetchedModels.length === 0 ? (
                        <div className="py-12 text-center text-xs text-gray-400">
                          没有可添加的新模型(可能已全部添加)。
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                              <input
                                type="search"
                                value={fetchSearch}
                                onChange={(e) => setFetchSearch(e.target.value)}
                                placeholder="搜索模型 ID、名称或 owned_by"
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
                                    {filter.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500 px-1 pb-1.5">
                            <span>
                              共 {fetchedModels.length} 个新模型
                              {filteredFetchedModels.length !== fetchedModels.length
                                ? ` · 当前显示 ${filteredFetchedModels.length} 个`
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
                                全选
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
                                全不选
                              </button>
                            </div>
                          </div>
                          {filteredFetchedModels.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-xs text-gray-400">
                              没有匹配当前搜索或类型过滤的模型。
                            </div>
                          ) : (
                            filteredFetchedModels.map((m) => {
                              const s = pickerState[m.id] ?? {
                                selected: false,
                                chat: true,
                                embedding: false,
                                rerank: false
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
                                    {(['chat', 'embedding', 'rerank'] as Capability[]).map((c) => {
                                      const on = s[c]
                                      const cls = on
                                        ? c === 'chat'
                                          ? 'bg-purple-100 text-purple-700 border-purple-200'
                                          : c === 'embedding'
                                            ? 'bg-blue-100 text-blue-700 border-blue-200'
                                            : 'bg-amber-100 text-amber-700 border-amber-200'
                                        : 'bg-white text-gray-400 border-gray-200'
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
                                          className={`px-2 py-0.5 rounded border ${cls}`}
                                        >
                                          {c === 'chat'
                                            ? 'Chat'
                                            : c === 'embedding'
                                              ? 'Embed'
                                              : 'ReRank'}
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
                        取消
                      </button>
                      <button
                        onClick={addSelectedFetchedModels}
                        disabled={
                          fetching || !fetchedModels.some((m) => pickerState[m.id]?.selected)
                        }
                        className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        添加选中
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {section === 'models' && (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-5">
              <DefaultModelsCard form={form} setForm={setForm} />
            </div>
          )}

          {section === 'assistants' && (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-5">
              <div className="rounded-3xl border border-purple-100 bg-gradient-to-br from-purple-50 via-white to-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-purple-100 text-purple-600">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">助手设置</h3>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
                        在这里集中管理助手提示词、专属模型参数和默认知识库。Chat
                        页面只保留顶部下拉选择。
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={openCreateAssistant}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-purple-600 hover:to-purple-700"
                  >
                    <Plus className="h-4 w-4" />
                    新建助手
                  </button>
                </div>
              </div>

              {assistants.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center">
                  <Bot className="mx-auto h-10 w-10 text-gray-300" />
                  <div className="mt-3 text-sm font-medium text-gray-700">还没有助手</div>
                  <p className="mt-1 text-xs text-gray-400">
                    创建一个助手后即可在 Chat 顶部切换使用。
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {assistants.map((assistant) => (
                    <div
                      key={assistant.id}
                      className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:border-purple-100 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-sm font-semibold text-gray-900">
                              {assistant.name}
                            </div>
                            {assistant.modelId ? (
                              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                                {assistant.modelId}
                              </span>
                            ) : (
                              <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                                全局默认模型
                              </span>
                            )}
                            {assistant.knowledgeBaseIds.length > 0 && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                                {assistant.knowledgeBaseIds.length} 个知识库
                              </span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                            {assistant.description || '无描述'}
                          </p>
                          <p className="mt-2 line-clamp-2 rounded-xl bg-gray-50 px-3 py-2 text-[11px] leading-5 text-gray-500">
                            {assistant.prompt || '未设置系统提示词'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openEditAssistant(assistant)}
                          className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700"
                        >
                          编辑
                        </button>
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
                <SettingRow label="API Key">
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="password"
                      value={form.mistralApiKey}
                      onChange={(e) => update('mistralApiKey', e.target.value)}
                      placeholder="留空则使用本地 pdf-parse 纯文本提取"
                      className={inputCls + ' pl-9'}
                    />
                  </div>
                </SettingRow>
                <SettingRow label="API 地址">
                  <input
                    type="text"
                    value={form.mistralApiUrl}
                    onChange={(e) => update('mistralApiUrl', e.target.value)}
                    placeholder="https://api.mistral.ai/v1/ocr"
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="模型">
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
                  测试连接
                </button>
              </div>
              <TestResultBanner result={mistralTestResult} />
            </div>
          )}

          {section === 'proxy' && (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-5">
              <SettingGroup>
                <SettingRow label="启用代理" description="通过 HTTP 代理访问外部 API。">
                  <div className="flex justify-end">
                    <Toggle
                      on={form.proxyEnabled}
                      onChange={() => update('proxyEnabled', form.proxyEnabled ? 0 : 1)}
                    />
                  </div>
                </SettingRow>
                {form.proxyEnabled ? (
                  <SettingRow
                    label="代理地址"
                    description="支持 HTTP 代理,如 http://127.0.0.1:7890"
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
                <p className="text-xs text-gray-400 px-1">启用后可配置 HTTP 代理。</p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

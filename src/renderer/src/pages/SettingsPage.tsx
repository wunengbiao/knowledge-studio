import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Save,
  Key,
  Globe,
  Cpu,
  Sliders,
  Check,
  FlaskConical,
  Loader2,
  XCircle,
  Wifi,
  Bookmark,
  Plus,
  X,
  ScanText,
  User as UserIcon,
  Upload,
  Trash2
} from 'lucide-react'
import { useKBStore } from '../stores/kb-store'
import type { AppSettings, EmbeddingPreset, LlmPreset, RerankPreset } from '@shared/types'

/* ------------------------------------------------------------------ */
/*  Preset Manager (unchanged behavior, lighter styling)              */
/* ------------------------------------------------------------------ */

interface PresetManagerProps {
  presets: EmbeddingPreset[] | RerankPreset[] | LlmPreset[]
  onLoad: (preset: EmbeddingPreset | RerankPreset | LlmPreset) => void
  onSave: (name: string) => void
  onDelete: (id: string) => void
}

function PresetManager({ presets, onLoad, onSave, onDelete }: PresetManagerProps) {
  const [name, setName] = useState('')
  const [selectedId, setSelectedId] = useState('')

  const handleSave = () => {
    if (!name.trim()) return
    onSave(name.trim())
    setName('')
  }

  return (
    <div className="rounded-lg border border-gray-200/70 bg-gray-50/60 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Bookmark className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs font-medium text-gray-600">配置预设</span>
      </div>
      {presets.length > 0 ? (
        <>
          <select
            value={selectedId}
            onChange={(e) => {
              const p = presets.find((item) => item.id === e.target.value)
              if (p) onLoad(p)
              setSelectedId(e.target.value)
            }}
            className="w-full px-2 py-1.5 border border-gray-200 bg-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">选择预设加载到表单...</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.model})
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 rounded px-2 py-0.5"
              >
                {p.name}
                <button onClick={() => onDelete(p.id)} className="text-gray-400 hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-400">暂无预设，填写下方配置后可保存为预设。</p>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="预设名称（如：OpenAI 生产环境）"
          className="flex-1 px-2 py-1.5 border border-gray-200 bg-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
        >
          <Plus className="w-3 h-3" />
          保存为预设
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Layout primitives — cherry-studio inspired                        */
/* ------------------------------------------------------------------ */

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
    <div
      className={`flex gap-6 px-5 py-3.5 ${align === 'start' ? 'items-start' : 'items-center'}`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm text-gray-800">{label}</div>
        {description && <div className="mt-0.5 text-xs text-gray-400">{description}</div>}
      </div>
      <div className="flex-shrink-0 min-w-[260px] max-w-[420px] w-[55%]">{children}</div>
    </div>
  )
}

function SettingStack({
  label,
  description,
  children
}: {
  label: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="px-5 py-4 space-y-3">
      <div>
        <div className="text-sm font-medium text-gray-800">{label}</div>
        {description && <div className="mt-0.5 text-xs text-gray-400">{description}</div>}
      </div>
      {children}
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

/* ------------------------------------------------------------------ */
/*  Sidebar nav                                                       */
/* ------------------------------------------------------------------ */

type Section = 'general' | 'embedding' | 'llm' | 'rerank' | 'ocr' | 'proxy'

const NAV_GROUPS: {
  title: string
  items: { key: Section; label: string; icon: React.ComponentType<{ className?: string }> }[]
}[] = [
  {
    title: '通用',
    items: [{ key: 'general', label: '个人资料', icon: UserIcon }]
  },
  {
    title: '模型 API',
    items: [
      { key: 'embedding', label: 'Embedding', icon: Cpu },
      { key: 'llm', label: 'LLM', icon: Globe },
      { key: 'rerank', label: 'ReRank', icon: Sliders }
    ]
  },
  {
    title: '服务',
    items: [{ key: 'ocr', label: 'PDF OCR', icon: ScanText }]
  },
  {
    title: '应用设置',
    items: [{ key: 'proxy', label: '网络代理', icon: Wifi }]
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

/* ------------------------------------------------------------------ */
/*  Content header                                                    */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */

export function SettingsPage() {
  const navigate = useNavigate()
  const { settings, loadSettings, updateSettings } = useKBStore()
  const [form, setForm] = useState<AppSettings | null>(null)
  const [saved, setSaved] = useState(false)
  const [section, setSection] = useState<Section>('general')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [testingEmbedding, setTestingEmbedding] = useState(false)
  const [testingRerank, setTestingRerank] = useState(false)
  const [testingMistral, setTestingMistral] = useState(false)
  const [testingLlm, setTestingLlm] = useState(false)
  const [embeddingTestResult, setEmbeddingTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [rerankTestResult, setRerankTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [mistralTestResult, setMistralTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [llmTestResult, setLlmTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    if (settings && !form) setForm({ ...settings })
  }, [settings])

  const handleSave = async () => {
    if (!form) return
    await updateSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  /* ---- test handlers ---- */
  const handleTestEmbedding = async () => {
    if (!form) return
    setTestingEmbedding(true)
    setEmbeddingTestResult(null)
    try {
      setEmbeddingTestResult(await window.electronAPI.invoke('settings:test-embedding', form))
    } catch (e: any) {
      setEmbeddingTestResult({ success: false, message: e.message || '测试失败' })
    } finally {
      setTestingEmbedding(false)
    }
  }
  const handleTestRerank = async () => {
    if (!form) return
    setTestingRerank(true)
    setRerankTestResult(null)
    try {
      setRerankTestResult(await window.electronAPI.invoke('settings:test-rerank', form))
    } catch (e: any) {
      setRerankTestResult({ success: false, message: e.message || '测试失败' })
    } finally {
      setTestingRerank(false)
    }
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
  const handleTestLlm = async () => {
    if (!form) return
    setTestingLlm(true)
    setLlmTestResult(null)
    try {
      setLlmTestResult(await window.electronAPI.invoke('settings:test-llm', form))
    } catch (e: any) {
      setLlmTestResult({ success: false, message: e.message || '测试失败' })
    } finally {
      setTestingLlm(false)
    }
  }

  /* ---- preset handlers ---- */
  const handleSaveEmbeddingPreset = (name: string) => {
    if (!form) return
    const preset: EmbeddingPreset = {
      id: crypto.randomUUID(),
      name,
      apiUrl: form.embeddingApiUrl,
      apiKey: form.embeddingApiKey,
      model: form.embeddingModel
    }
    setForm({ ...form, embeddingPresets: [...form.embeddingPresets, preset] })
  }
  const handleLoadEmbeddingPreset = (preset: EmbeddingPreset | RerankPreset | LlmPreset) => {
    if (!form) return
    setForm({
      ...form,
      embeddingApiUrl: preset.apiUrl,
      embeddingApiKey: preset.apiKey,
      embeddingModel: preset.model
    })
    setEmbeddingTestResult(null)
  }
  const handleDeleteEmbeddingPreset = (id: string) => {
    if (!form) return
    setForm({ ...form, embeddingPresets: form.embeddingPresets.filter((p) => p.id !== id) })
  }

  const handleSaveRerankPreset = (name: string) => {
    if (!form) return
    const preset: RerankPreset = {
      id: crypto.randomUUID(),
      name,
      apiUrl: form.rerankApiUrl,
      apiKey: form.rerankApiKey,
      model: form.rerankModel
    }
    setForm({ ...form, rerankPresets: [...form.rerankPresets, preset] })
  }
  const handleLoadRerankPreset = (preset: EmbeddingPreset | RerankPreset | LlmPreset) => {
    if (!form) return
    setForm({
      ...form,
      rerankApiUrl: preset.apiUrl,
      rerankApiKey: preset.apiKey,
      rerankModel: preset.model
    })
    setRerankTestResult(null)
  }
  const handleDeleteRerankPreset = (id: string) => {
    if (!form) return
    setForm({ ...form, rerankPresets: form.rerankPresets.filter((p) => p.id !== id) })
  }

  const handleSaveLlmPreset = (name: string) => {
    if (!form) return
    const preset: LlmPreset = {
      id: crypto.randomUUID(),
      name,
      apiUrl: form.llmApiUrl,
      apiKey: form.llmApiKey,
      model: form.llmModel
    }
    setForm({ ...form, llmPresets: [...form.llmPresets, preset] })
  }
  const handleLoadLlmPreset = (preset: EmbeddingPreset | RerankPreset | LlmPreset) => {
    if (!form) return
    setForm({
      ...form,
      llmApiUrl: preset.apiUrl,
      llmApiKey: preset.apiKey,
      llmModel: preset.model
    })
    setLlmTestResult(null)
  }
  const handleDeleteLlmPreset = (id: string) => {
    if (!form) return
    setForm({ ...form, llmPresets: form.llmPresets.filter((p) => p.id !== id) })
  }

  const update = (key: keyof AppSettings, value: string | number) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : null))
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

    // Downscale to 128x128 to keep settings JSON small
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
        description: '自定义你的头像，将显示在对话中你的消息旁。'
      },
      embedding: {
        title: 'Embedding API',
        description: '用于将文档分块向量化并写入向量库。'
      },
      llm: {
        title: 'LLM API',
        description: '用于 Chat 对话和 GraphRAG。可保存多个预设，在对话窗口顶部切换模型。'
      },
      rerank: {
        title: 'ReRank',
        description: '启用后使用重排序模型对召回结果二次打分，提升检索精度。'
      },
      ocr: {
        title: 'PDF OCR',
        description: '配置后，PDF 通过 Mistral OCR 转 Markdown；未配置则降级为纯文本提取。'
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

  return (
    <div className="flex h-full min-h-0 bg-white">
      <Sidebar active={section} onSelect={setSection} onBack={() => navigate('/')} />

      <main className="flex-1 min-w-0 min-h-0 overflow-y-auto">
        <div className="max-w-[860px] mx-auto px-8 py-6">
          <PaneHeader
            title={paneMeta[section].title}
            description={paneMeta[section].description}
            saved={saved}
            onSave={handleSave}
          />

          {/* ============== General (Avatar) ============== */}
          {section === 'general' && (
            <div className="space-y-5">
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
                  description="JPG / PNG / WebP，将自动压缩为 128×128。"
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

          {/* ============== Embedding ============== */}
          {section === 'embedding' && (
            <div className="space-y-5">
              <SettingGroup>
                <SettingStack label="配置预设" description="保存常用配置以便快速切换。">
                  <PresetManager
                    presets={form.embeddingPresets}
                    onLoad={handleLoadEmbeddingPreset}
                    onSave={handleSaveEmbeddingPreset}
                    onDelete={handleDeleteEmbeddingPreset}
                  />
                </SettingStack>
              </SettingGroup>

              <SettingGroup>
                <SettingRow label="API 地址">
                  <input
                    type="text"
                    value={form.embeddingApiUrl}
                    onChange={(e) => update('embeddingApiUrl', e.target.value)}
                    placeholder="https://api.openai.com/v1/embeddings"
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="API Key">
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="password"
                      value={form.embeddingApiKey}
                      onChange={(e) => update('embeddingApiKey', e.target.value)}
                      placeholder="sk-..."
                      className={inputCls + ' pl-9'}
                    />
                  </div>
                </SettingRow>
                <SettingRow label="模型名称">
                  <input
                    type="text"
                    value={form.embeddingModel}
                    onChange={(e) => update('embeddingModel', e.target.value)}
                    placeholder="text-embedding-3-small"
                    className={inputCls}
                  />
                </SettingRow>
              </SettingGroup>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    update('embeddingApiUrl', 'https://api.openai.com/v1/embeddings')
                    update('embeddingModel', 'text-embedding-3-small')
                  }}
                  className="text-xs px-2.5 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                >
                  OpenAI
                </button>
                <button
                  onClick={() => {
                    update(
                      'embeddingApiUrl',
                      'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-1:embedContent'
                    )
                    update('embeddingModel', 'gemini-embedding-1')
                  }}
                  className="text-xs px-2.5 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                >
                  Gemini
                </button>
                <button
                  onClick={() => {
                    update('embeddingApiUrl', 'http://localhost:11434/api/embeddings')
                    update('embeddingModel', 'nomic-embed-text')
                  }}
                  className="text-xs px-2.5 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                >
                  Ollama
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleTestEmbedding}
                  disabled={testingEmbedding}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-colors"
                >
                  {testingEmbedding ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <FlaskConical className="w-3 h-3" />
                  )}
                  测试连接
                </button>
              </div>
              <TestResultBanner result={embeddingTestResult} />
            </div>
          )}

          {/* ============== LLM ============== */}
          {section === 'llm' && (
            <div className="space-y-5">
              <SettingGroup>
                <SettingStack label="配置预设" description="可创建多个预设，在每个对话窗口顶部切换。">
                  <PresetManager
                    presets={form.llmPresets}
                    onLoad={handleLoadLlmPreset}
                    onSave={handleSaveLlmPreset}
                    onDelete={handleDeleteLlmPreset}
                  />
                </SettingStack>
              </SettingGroup>

              <SettingGroup>
                <SettingRow label="API 地址">
                  <input
                    type="text"
                    value={form.llmApiUrl}
                    onChange={(e) => update('llmApiUrl', e.target.value)}
                    placeholder="https://api.openai.com/v1/chat/completions"
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="API Key">
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="password"
                      value={form.llmApiKey}
                      onChange={(e) => update('llmApiKey', e.target.value)}
                      placeholder="sk-..."
                      className={inputCls + ' pl-9'}
                    />
                  </div>
                </SettingRow>
                <SettingRow label="模型名称">
                  <input
                    type="text"
                    value={form.llmModel}
                    onChange={(e) => update('llmModel', e.target.value)}
                    placeholder="gpt-4o-mini"
                    className={inputCls}
                  />
                </SettingRow>
              </SettingGroup>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    update('llmApiUrl', 'https://api.openai.com/v1/chat/completions')
                    update('llmModel', 'gpt-4o-mini')
                  }}
                  className="text-xs px-2.5 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                >
                  OpenAI
                </button>
                <button
                  onClick={() => {
                    update('llmApiUrl', 'https://api.deepseek.com/v1/chat/completions')
                    update('llmModel', 'deepseek-chat')
                  }}
                  className="text-xs px-2.5 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                >
                  DeepSeek
                </button>
                <button
                  onClick={() => {
                    update('llmApiUrl', 'http://localhost:11434/v1/chat/completions')
                    update('llmModel', 'qwen2.5')
                  }}
                  className="text-xs px-2.5 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                >
                  Ollama
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleTestLlm}
                  disabled={testingLlm}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-purple-200 text-purple-600 hover:bg-purple-50 disabled:opacity-50 transition-colors"
                >
                  {testingLlm ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <FlaskConical className="w-3 h-3" />
                  )}
                  测试连接
                </button>
              </div>
              <TestResultBanner result={llmTestResult} />
            </div>
          )}

          {/* ============== ReRank ============== */}
          {section === 'rerank' && (
            <div className="space-y-5">
              <SettingGroup>
                <SettingRow
                  label="启用 ReRank"
                  description="对召回结果做二次打分以提升精度。"
                >
                  <div className="flex justify-end">
                    <Toggle
                      on={form.rerankEnabled}
                      onChange={() => update('rerankEnabled', form.rerankEnabled ? 0 : 1)}
                    />
                  </div>
                </SettingRow>
              </SettingGroup>

              {form.rerankEnabled ? (
                <>
                  <SettingGroup>
                    <SettingStack label="配置预设">
                      <PresetManager
                        presets={form.rerankPresets}
                        onLoad={handleLoadRerankPreset}
                        onSave={handleSaveRerankPreset}
                        onDelete={handleDeleteRerankPreset}
                      />
                    </SettingStack>
                  </SettingGroup>

                  <SettingGroup>
                    <SettingRow label="API 地址">
                      <input
                        type="text"
                        value={form.rerankApiUrl}
                        onChange={(e) => update('rerankApiUrl', e.target.value)}
                        placeholder="https://api.example.com/rerank"
                        className={inputCls}
                      />
                    </SettingRow>
                    <SettingRow label="API Key">
                      <input
                        type="password"
                        value={form.rerankApiKey}
                        onChange={(e) => update('rerankApiKey', e.target.value)}
                        placeholder="sk-..."
                        className={inputCls}
                      />
                    </SettingRow>
                    <SettingRow label="模型名称">
                      <input
                        type="text"
                        value={form.rerankModel}
                        onChange={(e) => update('rerankModel', e.target.value)}
                        placeholder="bge-reranker-v2-m3"
                        className={inputCls}
                      />
                    </SettingRow>
                  </SettingGroup>

                  <div className="flex justify-end">
                    <button
                      onClick={handleTestRerank}
                      disabled={testingRerank}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-amber-200 text-amber-600 hover:bg-amber-50 disabled:opacity-50 transition-colors"
                    >
                      {testingRerank ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <FlaskConical className="w-3 h-3" />
                      )}
                      测试连接
                    </button>
                  </div>
                  <TestResultBanner result={rerankTestResult} />
                </>
              ) : (
                <p className="text-xs text-gray-400 px-1">启用后可使用重排序模型提升检索精度。</p>
              )}
            </div>
          )}

          {/* ============== Mistral OCR ============== */}
          {section === 'ocr' && (
            <div className="space-y-5">
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

          {/* ============== Proxy ============== */}
          {section === 'proxy' && (
            <div className="space-y-5">
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
                  <SettingRow label="代理地址" description="支持 HTTP 代理，如 http://127.0.0.1:7890">
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

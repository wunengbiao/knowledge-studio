import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Key, Globe, Cpu, Sliders, Check, FlaskConical, Loader2, XCircle, Wifi, Bookmark, Plus, X, ScanText } from 'lucide-react'
import { useKBStore } from '../stores/kb-store'
import type { AppSettings, EmbeddingPreset, RerankPreset } from '@shared/types'

interface PresetManagerProps {
  presets: EmbeddingPreset[] | RerankPreset[]
  onLoad: (preset: EmbeddingPreset | RerankPreset) => void
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
    <div className="bg-gray-50 rounded-lg p-3 space-y-2 mb-1">
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
            className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
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
                <button
                  onClick={() => onDelete(p.id)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-400">暂无预设，填写下方配置后可保存为预设供新建知识库时快速选择</p>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="预设名称（如：OpenAI 生产环境）"
          className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
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

export function SettingsPage() {
  const navigate = useNavigate()
  const { settings, loadSettings, updateSettings } = useKBStore()
  const [form, setForm] = useState<AppSettings | null>(null)
  const [saved, setSaved] = useState(false)
  const [testingEmbedding, setTestingEmbedding] = useState(false)
  const [testingRerank, setTestingRerank] = useState(false)
  const [testingMistral, setTestingMistral] = useState(false)
  const [embeddingTestResult, setEmbeddingTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [rerankTestResult, setRerankTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [mistralTestResult, setMistralTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    if (settings && !form) {
      setForm({ ...settings })
    }
  }, [settings])

  const handleSave = async () => {
    if (!form) return
    await updateSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTestEmbedding = async () => {
    if (!form) return
    setTestingEmbedding(true)
    setEmbeddingTestResult(null)
    try {
      const result = await window.electronAPI.invoke('settings:test-embedding', form)
      setEmbeddingTestResult(result)
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
      const result = await window.electronAPI.invoke('settings:test-rerank', form)
      setRerankTestResult(result)
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
      const result = await window.electronAPI.invoke('settings:test-mistral', form)
      setMistralTestResult(result)
    } catch (e: any) {
      setMistralTestResult({ success: false, message: e.message || '测试失败' })
    } finally {
      setTestingMistral(false)
    }
  }

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

  const handleLoadEmbeddingPreset = (preset: EmbeddingPreset | RerankPreset) => {
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

  const handleLoadRerankPreset = (preset: EmbeddingPreset | RerankPreset) => {
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

  if (!form) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const update = (key: keyof AppSettings, value: string | number) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : null))
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate('/')}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">设置</h1>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" />
              已保存
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              保存
            </>
          )}
        </button>
      </div>

      <div className="space-y-6">
        {/* Embedding API */}
        <section className="bg-white border border-gray-100 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-blue-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Embedding API 配置</h2>
          </div>
          <div className="space-y-3">
            <PresetManager
              presets={form.embeddingPresets}
              onLoad={handleLoadEmbeddingPreset}
              onSave={handleSaveEmbeddingPreset}
              onDelete={handleDeleteEmbeddingPreset}
            />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">API 地址</label>
              <input
                type="text"
                value={form.embeddingApiUrl}
                onChange={(e) => update('embeddingApiUrl', e.target.value)}
                placeholder="https://api.openai.com/v1/embeddings"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">API Key</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="password"
                  value={form.embeddingApiKey}
                  onChange={(e) => update('embeddingApiKey', e.target.value)}
                  placeholder="sk-..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">模型名称</label>
              <input
                type="text"
                value={form.embeddingModel}
                onChange={(e) => update('embeddingModel', e.target.value)}
                placeholder="text-embedding-3-small"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  update('embeddingApiUrl', 'https://api.openai.com/v1/embeddings')
                  update('embeddingModel', 'text-embedding-3-small')
                }}
                className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
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
                className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
              >
                Gemini
              </button>
              <button
                onClick={() => {
                  update('embeddingApiUrl', 'http://localhost:11434/api/embeddings')
                  update('embeddingModel', 'nomic-embed-text')
                }}
                className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
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
            {embeddingTestResult && (
              <div className={`flex items-center gap-1.5 text-xs p-2 rounded ${embeddingTestResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {embeddingTestResult.success ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                {embeddingTestResult.message}
              </div>
            )}
          </div>
        </section>

        {/* LLM API (for GraphRAG) */}
        <section className="bg-white border border-gray-100 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <Globe className="w-4 h-4 text-purple-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">LLM API 配置 (GraphRAG)</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">API 地址</label>
              <input
                type="text"
                value={form.llmApiUrl}
                onChange={(e) => update('llmApiUrl', e.target.value)}
                placeholder="https://api.openai.com/v1/chat/completions"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">API Key</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="password"
                  value={form.llmApiKey}
                  onChange={(e) => update('llmApiKey', e.target.value)}
                  placeholder="sk-..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">模型名称</label>
              <input
                type="text"
                value={form.llmModel}
                onChange={(e) => update('llmModel', e.target.value)}
                placeholder="gpt-4o-mini"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </section>

        {/* ReRank API */}
        <section className="bg-white border border-gray-100 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <Sliders className="w-4 h-4 text-amber-600" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">ReRank 配置</h2>
            </div>
            <button
              onClick={() => update('rerankEnabled', form.rerankEnabled ? 0 : 1)}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.rerankEnabled ? 'bg-blue-500' : 'bg-gray-200'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.rerankEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {form.rerankEnabled && (
            <div className="space-y-3">
              <PresetManager
                presets={form.rerankPresets}
                onLoad={handleLoadRerankPreset}
                onSave={handleSaveRerankPreset}
                onDelete={handleDeleteRerankPreset}
              />
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">API 地址</label>
                <input
                  type="text"
                  value={form.rerankApiUrl}
                  onChange={(e) => update('rerankApiUrl', e.target.value)}
                  placeholder="https://api.example.com/rerank"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">API Key</label>
                  <input
                    type="password"
                    value={form.rerankApiKey}
                    onChange={(e) => update('rerankApiKey', e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">模型名称</label>
                  <input
                    type="text"
                    value={form.rerankModel}
                    onChange={(e) => update('rerankModel', e.target.value)}
                    placeholder="bge-reranker-v2-m3"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
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
              {rerankTestResult && (
                <div className={`flex items-center gap-1.5 text-xs p-2 rounded ${rerankTestResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {rerankTestResult.success ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  {rerankTestResult.message}
                </div>
              )}
            </div>
          )}
          {!form.rerankEnabled && <p className="text-xs text-gray-400">启用后可使用重排序模型提升检索精度</p>}
        </section>

        {/* Mistral OCR (PDF -> Markdown) */}
        <section className="bg-white border border-gray-100 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <ScanText className="w-4 h-4 text-emerald-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Mistral OCR (PDF 解析)</h2>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            配置后，上传 PDF 将通过 Mistral OCR 转为 Markdown，再进入分块/向量化流程；未配置则降级为纯文本提取。
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">API Key</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="password"
                  value={form.mistralApiKey}
                  onChange={(e) => update('mistralApiKey', e.target.value)}
                  placeholder="留空则使用本地 pdf-parse 纯文本提取"
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">API 地址</label>
                <input
                  type="text"
                  value={form.mistralApiUrl}
                  onChange={(e) => update('mistralApiUrl', e.target.value)}
                  placeholder="https://api.mistral.ai/v1/ocr"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">模型</label>
                <input
                  type="text"
                  value={form.mistralOcrModel}
                  onChange={(e) => update('mistralOcrModel', e.target.value)}
                  placeholder="mistral-ocr-latest"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
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
            {mistralTestResult && (
              <div className={`flex items-center gap-1.5 text-xs p-2 rounded ${mistralTestResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {mistralTestResult.success ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                {mistralTestResult.message}
              </div>
            )}
          </div>
        </section>

        {/* Proxy */}
        <section className="bg-white border border-gray-100 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
                <Wifi className="w-4 h-4 text-sky-600" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">网络代理</h2>
            </div>
            <button
              onClick={() => update('proxyEnabled', form.proxyEnabled ? 0 : 1)}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.proxyEnabled ? 'bg-blue-500' : 'bg-gray-200'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.proxyEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {form.proxyEnabled && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">代理地址</label>
              <input
                type="text"
                value={form.proxyUrl}
                onChange={(e) => update('proxyUrl', e.target.value)}
                placeholder="http://127.0.0.1:7890"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1.5">支持 HTTP 代理，如 http://127.0.0.1:7890</p>
            </div>
          )}
          {!form.proxyEnabled && <p className="text-xs text-gray-400">启用后可配置 HTTP 代理访问外部 API</p>}
        </section>
      </div>
    </div>
  )
}

import type {
  AppSettings,
  Assistant,
  AssistantModelParams,
  CustomParamEntry,
  CustomParamType,
  KnowledgeBase
} from '@shared/types'
import { DEFAULT_ASSISTANT_MODEL_PARAMS, DEFAULT_ASSISTANT_PROMPT } from '@shared/types'
import {
  Bot,
  Check,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  X
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageMarkdown } from '../chat/markdown/MessageMarkdown'

export type AssistantFormValue = {
  readonly name: string
  readonly description: string
  readonly prompt: string
  readonly providerId: string | null
  readonly modelId: string | null
  readonly modelParams: AssistantModelParams
  readonly knowledgeBaseIds: string[]
}

interface AssistantSettingsPanelProps {
  readonly open: boolean
  readonly assistant: Assistant | null
  readonly assistants: Assistant[]
  readonly knowledgeBases: KnowledgeBase[]
  readonly settings: AppSettings | null
  readonly saving: boolean
  readonly onClose: () => void
  readonly onSave: (value: AssistantFormValue) => Promise<void>
  readonly onDelete: (assistant: Assistant) => Promise<void>
}

interface AssistantSelectorProps {
  readonly assistants: Assistant[]
  readonly currentAssistant: Assistant | null
  readonly onSelect: (assistantId: string) => void
  readonly onCreate?: () => void
  readonly onEdit?: () => void
}

function initialForm(assistant: Assistant | null): AssistantFormValue {
  return {
    name: assistant?.name ?? '新助手',
    description: assistant?.description ?? '',
    prompt: assistant?.prompt ?? DEFAULT_ASSISTANT_PROMPT,
    providerId: assistant?.providerId ?? null,
    modelId: assistant?.modelId ?? null,
    modelParams: assistant?.modelParams ?? DEFAULT_ASSISTANT_MODEL_PARAMS,
    knowledgeBaseIds: assistant?.knowledgeBaseIds ?? []
  }
}

function parseModelValue(value: string): Pick<AssistantFormValue, 'providerId' | 'modelId'> {
  if (!value) return { providerId: null, modelId: null }
  const [providerId, ...rest] = value.split('::')
  return { providerId, modelId: rest.join('::') }
}

export function AssistantSelector({
  assistants,
  currentAssistant,
  onSelect,
  onCreate,
  onEdit
}: AssistantSelectorProps) {
  return (
    <div className="inline-flex items-center gap-1.5 bg-transparent no-drag">
      <span className="text-xs text-gray-400">助手</span>
      <select
        value={currentAssistant?.id ?? ''}
        onChange={(event) => onSelect(event.target.value)}
        className="h-6 max-w-[160px] rounded-md border border-transparent bg-transparent px-1.5 text-xs font-medium text-gray-700 outline-none transition-colors hover:border-gray-200 hover:bg-white focus:border-purple-200 focus:bg-white"
      >
        {assistants.length === 0 ? (
          <option value="">默认助手</option>
        ) : (
          assistants.map((assistant) => (
            <option key={assistant.id} value={assistant.id}>
              {assistant.name}
            </option>
          ))
        )}
      </select>
      {(onCreate || onEdit) && currentAssistant?.description && (
        <div className="hidden md:block max-w-[320px] truncate text-xs text-gray-400">
          {currentAssistant.description}
        </div>
      )}
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          新建
        </button>
      )}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          disabled={!currentAssistant}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
          设置
        </button>
      )}
    </div>
  )
}

export function AssistantSettingsPanel({
  open,
  assistant,
  assistants,
  knowledgeBases,
  settings,
  saving,
  onClose,
  onSave,
  onDelete
}: AssistantSettingsPanelProps) {
  const [form, setForm] = useState<AssistantFormValue>(() => initialForm(assistant))
  const [error, setError] = useState<string | null>(null)
  const [promptMode, setPromptMode] = useState<'edit' | 'preview'>('edit')

  useEffect(() => {
    if (open) {
      setForm(initialForm(assistant))
      setError(null)
      setPromptMode('edit')
    }
  }, [open, assistant])

  const modelValue = form.providerId && form.modelId ? `${form.providerId}::${form.modelId}` : ''
  const chatOptions = useMemo(() => {
    if (!settings) return []
    return settings.providers
      .map((provider) => ({
        provider,
        models: provider.models.filter((model) => model.capabilities.chat && model.id.trim())
      }))
      .filter((group) => group.models.length > 0)
  }, [settings])

  if (!open) return null

  const updateModelParam = <K extends keyof AssistantModelParams>(
    key: K,
    value: AssistantModelParams[K]
  ) => {
    setForm((prev) => ({
      ...prev,
      modelParams: { ...prev.modelParams, [key]: value }
    }))
  }

  const toggleKnowledgeBase = (kbId: string) => {
    setForm((prev) => ({
      ...prev,
      knowledgeBaseIds: prev.knowledgeBaseIds.includes(kbId)
        ? prev.knowledgeBaseIds.filter((id) => id !== kbId)
        : [...prev.knowledgeBaseIds, kbId]
    }))
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError('助手名称不能为空')
      return
    }
    setError(null)
    try {
      await onSave({ ...form, name: form.name.trim(), description: form.description.trim() })
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 no-drag">
      <div className="w-[min(760px,92vw)] max-h-[88vh] overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Pencil className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">助手设置</h2>
            <p className="text-xs text-gray-400 mt-0.5">配置提示词、模型参数和默认知识库。</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Bot className="h-4 w-4 text-purple-500" />
              基础信息
            </div>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">名称</span>
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="给助手起个名字"
                className="mt-1.5 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">描述</span>
              <input
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="例如：论文阅读、代码问答"
                className="mt-1.5 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300"
              />
            </label>
          </section>

          <section className="rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50/70 to-white p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-gray-700">系统提示词</div>
                <div className="text-[11px] text-gray-400">支持 Markdown，可在预览中检查排版。</div>
              </div>
              <div className="inline-flex rounded-lg border border-purple-100 bg-white p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setPromptMode('edit')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
                    promptMode === 'edit'
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Pencil className="h-3 w-3" />
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => setPromptMode('preview')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
                    promptMode === 'preview'
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Eye className="h-3 w-3" />
                  预览
                </button>
              </div>
            </div>
            {promptMode === 'edit' ? (
              <textarea
                value={form.prompt}
                onChange={(event) => setForm((prev) => ({ ...prev, prompt: event.target.value }))}
                rows={7}
                className="w-full resize-none rounded-xl border border-purple-100 bg-white/90 px-3 py-2 text-sm leading-relaxed focus:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-100"
              />
            ) : (
              <div className="min-h-[176px] rounded-xl border border-purple-100 bg-white px-3 py-2">
                {form.prompt.trim() ? (
                  <MessageMarkdown content={form.prompt} className="leading-relaxed" />
                ) : (
                  <div className="py-10 text-center text-xs text-gray-400">暂无提示词内容</div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Settings2 className="h-4 w-4 text-purple-500" />
              模型与参数
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500">模型</div>
              <select
                value={modelValue}
                onChange={(event) => {
                  const next = parseModelValue(event.target.value)
                  setForm((prev) => ({ ...prev, ...next }))
                }}
                className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300"
              >
                <option value="">使用全局默认聊天模型</option>
                {chatOptions.map((group) => (
                  <optgroup key={group.provider.id} label={group.provider.name}>
                    {group.models.map((model) => (
                      <option
                        key={`${group.provider.id}::${model.id}`}
                        value={`${group.provider.id}::${model.id}`}
                      >
                        {model.name ? `${model.id} · ${model.name}` : model.id}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <ParamField
                label="Temperature"
                enabled={form.modelParams.temperatureEnabled}
                value={form.modelParams.temperature ?? 0.7}
                min={0}
                max={2}
                step={0.1}
                onEnabledChange={(enabled) => updateModelParam('temperatureEnabled', enabled)}
                onValueChange={(value) => updateModelParam('temperature', value)}
              />
              <ParamField
                label="Top P"
                enabled={form.modelParams.topPEnabled}
                value={form.modelParams.topP ?? 1}
                min={0}
                max={1}
                step={0.05}
                onEnabledChange={(enabled) => updateModelParam('topPEnabled', enabled)}
                onValueChange={(value) => updateModelParam('topP', value)}
              />
              <ParamField
                label="Max Tokens"
                enabled={form.modelParams.maxTokensEnabled}
                value={form.modelParams.maxTokens ?? 2048}
                min={1}
                max={200000}
                step={1}
                onEnabledChange={(enabled) => updateModelParam('maxTokensEnabled', enabled)}
                onValueChange={(value) => updateModelParam('maxTokens', Math.round(value))}
              />
            </div>

            <CustomParametersEditor
              entries={form.modelParams.customParameters}
              onChange={(entries) => updateModelParam('customParameters', entries)}
            />
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-xs font-medium text-gray-500">默认知识库</div>
                <div className="text-[11px] text-gray-400">
                  未手动 @ 选择时，发送消息会使用这些知识库。
                </div>
              </div>
              <div className="text-[11px] text-gray-400">已选 {form.knowledgeBaseIds.length}</div>
            </div>
            {knowledgeBases.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
                暂无知识库
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {knowledgeBases.map((kb) => {
                  const selected = form.knowledgeBaseIds.includes(kb.id)
                  return (
                    <button
                      key={kb.id}
                      type="button"
                      onClick={() => toggleKnowledgeBase(kb.id)}
                      className={`inline-flex max-w-full items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all ${
                        selected
                          ? 'border-purple-200 bg-purple-50 text-purple-800'
                          : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <FileText className="w-4 h-4 shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-sm">{kb.name}</span>
                      {selected && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50/80">
          <div className="flex items-center gap-2">
            {assistant && assistants.length > 1 && (
              <button
                type="button"
                onClick={() => onDelete(assistant)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 bg-white border border-red-100 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                删除
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 transition-all"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ParamFieldProps {
  readonly label: string
  readonly enabled: boolean
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly onEnabledChange: (enabled: boolean) => void
  readonly onValueChange: (value: number) => void
}

function ParamField({
  label,
  enabled,
  value,
  min,
  max,
  step,
  onEnabledChange,
  onValueChange
}: ParamFieldProps) {
  return (
    <label className="block rounded-xl border border-gray-200 p-3 bg-white">
      <span className="flex items-center justify-between gap-2 text-xs font-medium text-gray-500">
        {label}
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="accent-purple-500"
        />
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={!enabled}
        onChange={(event) => onValueChange(Number(event.target.value))}
        className="mt-2 w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300"
      />
    </label>
  )
}

interface CustomParametersEditorProps {
  readonly entries: CustomParamEntry[]
  readonly onChange: (entries: CustomParamEntry[]) => void
}

const CUSTOM_PARAM_TYPE_OPTIONS: CustomParamType[] = ['string', 'number', 'boolean', 'json']

function defaultValueForType(type: CustomParamType): string | number | boolean {
  if (type === 'number') return 0
  if (type === 'boolean') return false
  return ''
}

function CustomParametersEditor({ entries, onChange }: CustomParametersEditorProps) {
  const keysRef = useRef<string[]>([])
  if (keysRef.current.length !== entries.length) {
    keysRef.current = entries.map((_, i) => keysRef.current[i] ?? crypto.randomUUID())
  }

  const addEntry = () => {
    keysRef.current = [...keysRef.current, crypto.randomUUID()]
    onChange([...entries, { name: '', type: 'string', value: '' }])
  }

  const updateEntry = (index: number, patch: Partial<CustomParamEntry>) => {
    onChange(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))
  }

  const removeEntry = (index: number) => {
    keysRef.current = keysRef.current.filter((_, i) => i !== index)
    onChange(entries.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-gray-500">自定义参数</div>
          <div className="text-[11px] text-gray-400">
            注入到请求体的额外字段（如 stream、effort、reasoning_effort）。同名参数会覆盖上方设置。
          </div>
        </div>
        <button
          type="button"
          onClick={addEntry}
          className="inline-flex shrink-0 items-center gap-1 px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
        >
          <Plus className="w-3 h-3" />
          添加
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="px-3 py-3 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
          暂无自定义参数
        </div>
      ) : (
        entries.map((entry, index) => (
          <CustomParameterRow
            key={keysRef.current[index]}
            entry={entry}
            onChange={(patch) => updateEntry(index, patch)}
            onRemove={() => removeEntry(index)}
          />
        ))
      )}
    </div>
  )
}

interface CustomParameterRowProps {
  readonly entry: CustomParamEntry
  readonly onChange: (patch: Partial<CustomParamEntry>) => void
  readonly onRemove: () => void
}

function CustomParameterRow({ entry, onChange, onRemove }: CustomParameterRowProps) {
  const [jsonError, setJsonError] = useState<string | null>(null)

  const handleTypeChange = (type: CustomParamType) => {
    onChange({ type, value: defaultValueForType(type) })
    setJsonError(null)
  }

  const handleJsonValueChange = (raw: string) => {
    onChange({ value: raw })
    if (raw.trim() === '') {
      setJsonError(null)
      return
    }
    try {
      JSON.parse(raw)
      setJsonError(null)
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'JSON 解析失败')
    }
  }

  const jsonValueString =
    typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value, null, 2)

  return (
    <div className="rounded-xl border border-gray-200 p-3 bg-white space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={entry.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="参数名，例如 stream"
          className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300"
        />
        <select
          value={entry.type}
          onChange={(event) => handleTypeChange(event.target.value as CustomParamType)}
          className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300"
        >
          {CUSTOM_PARAM_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
          aria-label="删除参数"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {entry.type === 'boolean' ? (
        <select
          value={entry.value === true ? 'true' : 'false'}
          onChange={(event) => onChange({ value: event.target.value === 'true' })}
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300"
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : entry.type === 'number' ? (
        <input
          type="number"
          value={typeof entry.value === 'number' ? entry.value : 0}
          onChange={(event) => {
            const num = Number(event.target.value)
            onChange({ value: Number.isFinite(num) ? num : 0 })
          }}
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300"
        />
      ) : entry.type === 'json' ? (
        <div>
          <textarea
            value={jsonValueString}
            onChange={(event) => handleJsonValueChange(event.target.value)}
            rows={3}
            placeholder='例如 {"key":"value"} 或 [1,2,3]'
            className="w-full resize-none px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300 font-mono"
          />
          {jsonError && <div className="mt-1 text-[11px] text-red-500">JSON 错误：{jsonError}</div>}
        </div>
      ) : (
        <input
          type="text"
          value={typeof entry.value === 'string' ? entry.value : String(entry.value ?? '')}
          onChange={(event) => onChange({ value: event.target.value })}
          placeholder="字符串值"
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300"
        />
      )}
    </div>
  )
}

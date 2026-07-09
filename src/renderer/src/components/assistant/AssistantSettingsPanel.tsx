import type {
  ActiveModelRef,
  AppSettings,
  Assistant,
  AssistantModelParams,
  CustomParamEntry,
  CustomParamType,
  KnowledgeBase
} from '@shared/types'
import { DEFAULT_ASSISTANT_MODEL_PARAMS, DEFAULT_ASSISTANT_PROMPT } from '@shared/types'
import { useTranslation } from '../../i18n'
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
import { ModelSelect } from './ModelSelect'

export type AssistantFormValue = {
  readonly name: string
  readonly description: string
  readonly prompt: string
  readonly providerId: string | null
  readonly modelId: string | null
  readonly rerankModelRef: ActiveModelRef | null
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

function initialForm(assistant: Assistant | null, defaultName: string): AssistantFormValue {
  return {
    name: assistant?.name ?? defaultName,
    description: assistant?.description ?? '',
    prompt: assistant?.prompt ?? DEFAULT_ASSISTANT_PROMPT,
    providerId: assistant?.providerId ?? null,
    modelId: assistant?.modelId ?? null,
    rerankModelRef: assistant?.rerankModelRef ?? null,
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
  const { t } = useTranslation()
  return (
    <div className="inline-flex items-center gap-1.5 bg-transparent no-drag">
      <span className="text-xs text-gray-400">{t('assistant.label')}</span>
      <select
        value={currentAssistant?.id ?? ''}
        onChange={(event) => onSelect(event.target.value)}
        className="h-6 max-w-[160px] rounded-md border border-transparent bg-transparent px-1.5 text-xs font-medium text-gray-700 outline-none transition-colors hover:border-gray-200 hover:bg-white focus:border-blue-200 focus:bg-white dark:text-gray-300 dark:hover:border-gray-700 dark:hover:bg-gray-900 dark:focus:bg-gray-900"
      >
        {assistants.length === 0 ? (
          <option value="">{t('assistant.default')}</option>
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors dark:text-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('assistant.create')}
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
          {t('sidebar.settings')}
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
  const { t } = useTranslation()
  const [form, setForm] = useState<AssistantFormValue>(() =>
    initialForm(assistant, t('assistant.newAssistant'))
  )
  const [error, setError] = useState<string | null>(null)
  const [promptMode, setPromptMode] = useState<'edit' | 'preview'>('edit')

  useEffect(() => {
    if (open) {
      setForm(initialForm(assistant, t('assistant.newAssistant')))
      setError(null)
      setPromptMode('edit')
    }
  }, [open, assistant])

  const modelValue = form.providerId && form.modelId ? `${form.providerId}::${form.modelId}` : ''
  const rerankValue = form.rerankModelRef
    ? `${form.rerankModelRef.providerId}::${form.rerankModelRef.modelId}`
    : ''
  const chatOptions = useMemo(() => {
    if (!settings) return []
    return settings.providers
      .map((provider) => ({
        provider,
        models: provider.models.filter((model) => model.capabilities.chat && model.id.trim())
      }))
      .filter((group) => group.models.length > 0)
  }, [settings])
  const rerankOptions = useMemo(() => {
    if (!settings) return []
    return settings.providers
      .map((provider) => ({
        provider,
        models: provider.models.filter((model) => model.capabilities.rerank && model.id.trim())
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
      setError(t('assistant.nameRequired'))
      return
    }
    setError(null)
    try {
      await onSave({ ...form, name: form.name.trim(), description: form.description.trim() })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('kbPage.saveFailed'))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 no-drag">
      <div className="w-[min(760px,92vw)] max-h-[88vh] overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center dark:bg-slate-800 dark:text-slate-300">
            <Pencil className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{t('settings.assistantSettings')}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{t('assistant.configHint')}</p>
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

          <section className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Bot className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              {t('assistant.basicInfo')}
            </div>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">{t('kbPage.name')}</span>
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder={t('assistant.namePlaceholder')}
                className="mt-1.5 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">{t('kbPage.description')}</span>
              <input
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder={t('assistant.promptPlaceholder')}
                className="mt-1.5 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
            </label>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50/70 to-white p-3 dark:border-slate-800 dark:from-slate-900/70 dark:to-gray-900">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-gray-700">{t('assistant.systemPrompt')}</div>
                <div className="text-[11px] text-gray-400">{t('assistant.markdownHint')}</div>
              </div>
              <div className="inline-flex rounded-lg border border-slate-100 bg-white p-0.5 text-xs dark:border-slate-700 dark:bg-gray-900">
                <button
                  type="button"
                  onClick={() => setPromptMode('edit')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
                    promptMode === 'edit'
                      ? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Pencil className="h-3 w-3" />
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => setPromptMode('preview')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
                    promptMode === 'preview'
                      ? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Eye className="h-3 w-3" />
                  {t('common.preview')}
                </button>
              </div>
            </div>
            {promptMode === 'edit' ? (
              <textarea
                value={form.prompt}
                onChange={(event) => setForm((prev) => ({ ...prev, prompt: event.target.value }))}
                rows={7}
                className="w-full resize-none rounded-xl border border-slate-100 bg-white/90 px-3 py-2 text-sm leading-relaxed focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-gray-900/90 dark:text-gray-100"
              />
            ) : (
              <div className="min-h-[176px] rounded-xl border border-slate-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-gray-900">
                {form.prompt.trim() ? (
                  <MessageMarkdown content={form.prompt} className="leading-relaxed" />
                ) : (
                  <div className="py-10 text-center text-xs text-gray-400">{t('assistant.noPrompt')}</div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Settings2 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              {t('assistant.modelAndParams')}
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500">{t('settings.model')}</div>
              <ModelSelect
                value={modelValue}
                onChange={(nextValue) => {
                  const next = parseModelValue(nextValue)
                  setForm((prev) => ({ ...prev, ...next }))
                }}
                groups={chatOptions}
                placeholder={t('assistant.useGlobalDefaultChatModel')}
              />
            </div>

            <div>
              <div className="text-xs font-medium text-gray-500">{t('assistant.rerankModel')}</div>
              <ModelSelect
                value={rerankValue}
                onChange={(nextValue) => {
                  const next = parseModelValue(nextValue)
                  setForm((prev) => ({
                    ...prev,
                    rerankModelRef:
                      next.providerId && next.modelId
                        ? { providerId: next.providerId, modelId: next.modelId }
                        : null
                  }))
                }}
                groups={rerankOptions}
                placeholder={t('assistant.useDefaultRerankModel')}
              />
              {rerankOptions.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">{t('assistant.noRerankCapability')}</p>
              )}
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
                <div className="text-xs font-medium text-gray-500">{t('assistant.defaultKb')}</div>
                <div className="text-[11px] text-gray-400">
                  {t('assistant.defaultKbHint')}
                </div>
              </div>
              <div className="text-[11px] text-gray-400">{t('assistant.selected', { n: form.knowledgeBaseIds.length })}</div>
            </div>
            {knowledgeBases.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
                {t('sidebar.noKnowledgeBases')}
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
                          ? 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100'
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

        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            {assistant && assistants.length > 1 && (
              <button
                type="button"
                onClick={() => onDelete(assistant)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 bg-white border border-red-100 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                {t('common.delete')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 transition-all"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('common.save')}
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
          className="accent-blue-500"
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
        className="mt-2 w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
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
  const { t } = useTranslation()
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
          <div className="text-xs font-medium text-gray-500">{t('assistant.customParams')}</div>
          <div className="text-[11px] text-gray-400">
            {t('assistant.customParamsPlaceholder')}
          </div>
        </div>
        <button
          type="button"
          onClick={addEntry}
          className="inline-flex shrink-0 items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors dark:text-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          <Plus className="w-3 h-3" />
          {t('common.add')}
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="px-3 py-3 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
          {t('assistant.noCustomParams')}
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
  const { t } = useTranslation()
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
      setJsonError(err instanceof Error ? err.message : t('assistant.jsonParseFailed'))
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
          placeholder={t('assistant.paramNamePlaceholder')}
          className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
        />
        <select
          value={entry.type}
          onChange={(event) => handleTypeChange(event.target.value as CustomParamType)}
          className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
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
          aria-label={t('assistant.deleteParam')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {entry.type === 'boolean' ? (
        <select
          value={entry.value === true ? 'true' : 'false'}
          onChange={(event) => onChange({ value: event.target.value === 'true' })}
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
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
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
        />
      ) : entry.type === 'json' ? (
        <div>
          <textarea
            value={jsonValueString}
            onChange={(event) => handleJsonValueChange(event.target.value)}
            rows={3}
            placeholder={t('assistant.paramValuePlaceholder')}
            className="w-full resize-none px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 font-mono"
          />
          {jsonError && <div className="mt-1 text-[11px] text-red-500">{t('assistant.jsonError')}{jsonError}</div>}
        </div>
      ) : (
        <input
          type="text"
          value={typeof entry.value === 'string' ? entry.value : String(entry.value ?? '')}
          onChange={(event) => onChange({ value: event.target.value })}
          placeholder={t('assistant.stringValue')}
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
        />
      )}
    </div>
  )
}

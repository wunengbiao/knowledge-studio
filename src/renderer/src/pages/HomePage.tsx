import type { KnowledgeBase } from '@shared/types'
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  FolderOpen,
  Globe,
  Library,
  Plus,
  Scale,
  Stethoscope
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { CreateKBModal } from '../components/CreateKBModal'
import { getKbIcon } from '../components/kb-icon'
import { type TranslationKey, useTranslation } from '../i18n'
import { useKBStore } from '../stores/kb-store'

const categoryConfig: Record<
  KnowledgeBase['category'],
  { icon: typeof Library; labelKey: TranslationKey; color: string; descKey: TranslationKey }
> = {
  general: {
    icon: BookOpen,
    labelKey: 'category.general',
    color: 'bg-blue-50 text-blue-600',
    descKey: 'category.desc.general'
  },
  technical: {
    icon: BrainCircuit,
    labelKey: 'category.technical',
    color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    descKey: 'category.desc.technical'
  },
  research: {
    icon: Globe,
    labelKey: 'category.research',
    color: 'bg-emerald-50 text-emerald-600',
    descKey: 'category.desc.research'
  },
  legal: {
    icon: Scale,
    labelKey: 'category.legal',
    color: 'bg-amber-50 text-amber-600',
    descKey: 'category.desc.legal'
  },
  medical: {
    icon: Stethoscope,
    labelKey: 'category.medical',
    color: 'bg-rose-50 text-rose-600',
    descKey: 'category.desc.medical'
  },
  custom: {
    icon: FolderOpen,
    labelKey: 'category.custom',
    color: 'bg-gray-50 text-gray-600',
    descKey: 'category.desc.custom'
  }
}

export function HomePage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { knowledgeBases, openCreateModal } = useKBStore()

  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      {/* Hero */}
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">{t('home.heroTitle')}</h1>
        <p className="text-gray-500 text-base leading-relaxed max-w-xl">{t('home.heroDesc')}</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        <button
          onClick={() => openCreateModal()}
          className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
            <Plus className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-gray-900">{t('home.createKb')}</div>
            <div className="text-xs text-gray-400">{t('home.createKbDesc')}</div>
          </div>
        </button>

        <div className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Library className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-gray-900">
              {t('home.kbCount', { n: knowledgeBases.length })}
            </div>
            <div className="text-xs text-gray-400">
              {t('home.docCount', {
                n: knowledgeBases.reduce((sum, kb) => sum + kb.documentCount, 0)
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Knowledge Bases */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('home.myKnowledgeBases')}</h2>
        {knowledgeBases.length === 0 ? (
          <div className="text-center py-16 bg-white border border-dashed border-gray-200 rounded-xl">
            <Library className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 text-sm mb-4">{t('home.noKbYet')}</p>
            <button
              onClick={() => openCreateModal()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('home.createKb')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {knowledgeBases.map((kb) => {
              const config = categoryConfig[kb.category]
              const Icon = getKbIcon(kb)
              return (
                <button
                  key={kb.id}
                  onClick={() => navigate(`/kb/${kb.id}`)}
                  className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all text-left group"
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${config.color}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 truncate">{kb.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                        {t(config.labelKey)}
                      </span>
                    </div>
                    {kb.description && (
                      <p className="text-xs text-gray-400 truncate mb-1">{kb.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>{t('home.documentCountShort', { n: kb.documentCount })}</span>
                      <span>{new Date(kb.updatedAt).toLocaleDateString('zh-CN')}</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all mt-2" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      <CreateKBModal />
    </div>
  )
}

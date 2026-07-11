import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import type { AppLanguage } from '../../../shared/types'
import { useKBStore } from '../stores/kb-store'
import de from './locales/de'
import en from './locales/en'
import fr from './locales/fr'
import ja from './locales/ja'
import ko from './locales/ko'
import ru from './locales/ru'
import zh from './locales/zh'

export type TranslationKey = keyof typeof zh

const dictionaries: Record<AppLanguage, Record<TranslationKey, string>> = {
  zh,
  en,
  ja,
  ko,
  fr,
  de,
  ru
}

type InterpolationParams = Record<string, string | number>

function interpolate(template: string, params?: InterpolationParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key]
    return value === undefined ? `{${key}}` : String(value)
  })
}

interface LanguageContextValue {
  language: AppLanguage
  setLanguage: (lang: AppLanguage) => void
  t: (key: TranslationKey, params?: InterpolationParams) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const FALLBACK_LANGUAGE: AppLanguage = 'zh'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const settings = useKBStore((s) => s.settings)
  const updateSettings = useKBStore((s) => s.updateSettings)

  const [language, setLanguageState] = useState<AppLanguage>(
    settings?.language ?? FALLBACK_LANGUAGE
  )

  useEffect(() => {
    if (settings?.language && settings.language !== language) {
      setLanguageState(settings.language)
    }
  }, [settings?.language, language])

  const setLanguage = useCallback(
    (lang: AppLanguage) => {
      setLanguageState(lang)
      void updateSettings({ language: lang })
    },
    [updateSettings]
  )

  const t = useCallback(
    (key: TranslationKey, params?: InterpolationParams) => {
      const dict = dictionaries[language] ?? dictionaries[FALLBACK_LANGUAGE]
      const template = dict[key] ?? dictionaries[FALLBACK_LANGUAGE][key] ?? (key as string)
      return interpolate(template, params)
    },
    [language]
  )

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t]
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    throw new Error('useTranslation must be used within a LanguageProvider')
  }
  return ctx
}

/**
 * Standalone translate function for non-React code (Zustand stores, utilities).
 * Reads the current language from the kb-store directly.
 */
export function translate(key: TranslationKey, params?: InterpolationParams): string {
  const lang = useKBStore.getState().settings?.language ?? FALLBACK_LANGUAGE
  const dict = dictionaries[lang] ?? dictionaries[FALLBACK_LANGUAGE]
  const template = dict[key] ?? dictionaries[FALLBACK_LANGUAGE][key] ?? (key as string)
  return interpolate(template, params)
}

export type { AppLanguage }

import type { KnowledgeBase } from '@shared/types'
import {
  Beaker,
  BookMarked,
  BookOpen,
  BrainCircuit,
  Briefcase,
  Code,
  Compass,
  Cpu,
  Database,
  FileStack,
  FlaskConical,
  FolderOpen,
  Globe,
  GraduationCap,
  Layers,
  Library,
  Lightbulb,
  type LucideIcon,
  Rocket,
  Scale,
  Stethoscope
} from 'lucide-react'

export const categoryIcons: Record<KnowledgeBase['category'], LucideIcon> = {
  general: BookOpen,
  technical: BrainCircuit,
  research: Globe,
  legal: Scale,
  medical: Stethoscope,
  custom: FolderOpen
}

export const KB_ICONS: Record<string, LucideIcon> = {
  BookOpen,
  BrainCircuit,
  Globe,
  Scale,
  Stethoscope,
  FolderOpen,
  Library,
  Database,
  FlaskConical,
  Code,
  Briefcase,
  GraduationCap,
  BookMarked,
  Lightbulb,
  Cpu,
  FileStack,
  Layers,
  Beaker,
  Compass,
  Rocket
}

export const KB_ICON_NAMES = Object.keys(KB_ICONS)

export function getKbIcon(kb: KnowledgeBase): LucideIcon {
  if (kb.icon && KB_ICONS[kb.icon]) {
    return KB_ICONS[kb.icon]
  }
  return categoryIcons[kb.category] ?? BookOpen
}

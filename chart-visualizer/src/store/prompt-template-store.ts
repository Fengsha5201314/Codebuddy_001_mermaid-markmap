import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  AI_PROMPT_TEMPLATES,
  type AiPromptTemplate,
  type AiPromptTemplateCategory,
} from '@/lib/ai-prompt-templates'

function templateId(): string {
  return `prompt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function cleanTemplate(value: Partial<AiPromptTemplate>, fallbackId = templateId()): AiPromptTemplate | null {
  const label = value.label?.trim()
  const prompt = value.prompt?.trim()
  if (!label || !prompt) return null
  const categories: AiPromptTemplateCategory[] = ['整理', '流程', '分析', '创作']
  return {
    id: value.id?.trim() || fallbackId,
    label: label.slice(0, 18),
    hint: value.hint?.trim().slice(0, 36) || '自定义任务指令',
    prompt: prompt.slice(0, 4000),
    category: categories.includes(value.category as AiPromptTemplateCategory)
      ? value.category as AiPromptTemplateCategory
      : '整理',
  }
}

interface PromptTemplateState {
  templates: AiPromptTemplate[]
  addTemplate: (template: Omit<AiPromptTemplate, 'id'>) => string
  updateTemplate: (id: string, patch: Partial<Omit<AiPromptTemplate, 'id'>>) => void
  removeTemplate: (id: string) => void
  restoreDefaults: () => void
}

export const usePromptTemplateStore = create<PromptTemplateState>()(
  persist(
    (set) => ({
      templates: [...AI_PROMPT_TEMPLATES],
      addTemplate: (input) => {
        const id = templateId()
        const template = cleanTemplate({ ...input, id }, id)
        if (template) set((state) => ({ templates: [...state.templates, template].slice(0, 30) }))
        return id
      },
      updateTemplate: (id, patch) => set((state) => ({
        templates: state.templates.map((template) => {
          if (template.id !== id) return template
          return cleanTemplate({ ...template, ...patch, id }, id) ?? template
        }),
      })),
      removeTemplate: (id) => set((state) => ({ templates: state.templates.filter((template) => template.id !== id) })),
      restoreDefaults: () => set({ templates: [...AI_PROMPT_TEMPLATES] }),
    }),
    {
      name: 'fengsha-ai-prompt-templates-v1',
      version: 1,
      merge: (persisted, current) => {
        const raw = (persisted as { templates?: unknown })?.templates
        if (!Array.isArray(raw)) return current
        const templates = raw.flatMap((item) => {
          if (!item || typeof item !== 'object') return []
          const template = cleanTemplate(item as Partial<AiPromptTemplate>)
          return template ? [template] : []
        }).slice(0, 30)
        return { ...current, templates: templates.length ? templates : current.templates }
      },
    },
  ),
)

import { beforeEach, describe, expect, it } from 'vitest'
import { AI_PROMPT_TEMPLATES } from '@/lib/ai-prompt-templates'
import { usePromptTemplateStore } from '@/store/prompt-template-store'

describe('prompt template store', () => {
  beforeEach(() => {
    localStorage.clear()
    usePromptTemplateStore.setState(usePromptTemplateStore.getInitialState(), true)
  })

  it('allows office prompt templates to be added, edited and removed', () => {
    const id = usePromptTemplateStore.getState().addTemplate({
      label: '日报转流程',
      hint: '识别每日工作交接',
      category: '整理',
      prompt: '分析日报中的角色、动作、交付物和阻塞点，先澄清歧义，再生成流程图。',
    })
    usePromptTemplateStore.getState().updateTemplate(id, { label: '周报转流程' })
    expect(usePromptTemplateStore.getState().templates.find((item) => item.id === id)?.label).toBe('周报转流程')
    usePromptTemplateStore.getState().removeTemplate(id)
    expect(usePromptTemplateStore.getState().templates.some((item) => item.id === id)).toBe(false)
  })

  it('can restore the professional built-in templates', () => {
    usePromptTemplateStore.setState({ templates: [] })
    usePromptTemplateStore.getState().restoreDefaults()
    expect(usePromptTemplateStore.getState().templates).toEqual(AI_PROMPT_TEMPLATES)
  })
})

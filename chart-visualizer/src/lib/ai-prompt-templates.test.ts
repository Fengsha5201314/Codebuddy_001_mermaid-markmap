import { describe, expect, it } from 'vitest'
import { AI_PROMPT_TEMPLATES, appendAiPrompt } from '@/lib/ai-prompt-templates'

describe('AI prompt templates', () => {
  it('offers distinct professional tasks instead of hidden action modes', () => {
    expect(AI_PROMPT_TEMPLATES).toHaveLength(6)
    expect(new Set(AI_PROMPT_TEMPLATES.map((item) => item.id)).size).toBe(6)
    expect(AI_PROMPT_TEMPLATES.every((item) => item.label && item.hint && item.prompt.length > 40)).toBe(true)
  })

  it('inserts a template into an empty input', () => {
    expect(appendAiPrompt('', '请优化当前图。')).toBe('请优化当前图。')
  })

  it('appends a template without discarding the user request', () => {
    expect(appendAiPrompt('保留付款节点', '请检查异常路径。'))
      .toBe('保留付款节点\n\n请检查异常路径。')
  })

  it('never exceeds the input limit', () => {
    expect(appendAiPrompt('a'.repeat(3999), '补充', 4000)).toHaveLength(4000)
  })
})

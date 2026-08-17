import { describe, expect, it } from 'vitest'
import { getAiLineStats, isAiAction, parseAiResponse } from '@/lib/ai-contract'

describe('AI contract', () => {
  it('validates a complete AI response', () => {
    expect(parseAiResponse({
      requestId: 'req-1',
      action: 'edit',
      summary: '增加审批节点',
      code: 'flowchart LR\n  A --> B',
      changes: ['增加 B 节点'],
      provider: 'cpa',
      model: 'gpt-test',
    }).action).toBe('edit')
  })

  it('rejects an incomplete AI response', () => {
    expect(() => parseAiResponse({ action: 'edit' })).toThrow('请求编号缺失')
  })

  it('accepts the unified context-aware request action', () => {
    expect(isAiAction('auto')).toBe(true)
  })

  it('summarizes a localized line change', () => {
    expect(getAiLineStats('a\nb\nc', 'a\nx\ny\nc')).toEqual({ added: 2, removed: 1, unchanged: 2 })
  })
})

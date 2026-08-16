import { describe, expect, it } from 'vitest'
import { findEditableTextMatches, normalizeRenderedText, replaceEditableText } from '@/lib/inline-edit'

describe('inline diagram text editing', () => {
  it('matches flowchart nodes and edge labels without matching structural ids', () => {
    const code = `flowchart LR\n  submit([提交订单]) --> verify{核对订单}\n  verify -->|通过| submit`
    const node = findEditableTextMatches(code, '提交订单', 'flowchart')
    const edge = findEditableTextMatches(code, '通过', 'flowchart')

    expect(node).toHaveLength(1)
    expect(node[0]).toMatchObject({ line: 2, context: 'delimited' })
    expect(edge).toHaveLength(1)
    expect(findEditableTextMatches(code, 'submit', 'flowchart')).toHaveLength(0)
  })

  it('matches sequence aliases, messages, and control headings', () => {
    const code = `sequenceDiagram\n  actor U as 用户\n  U->>S: 提交查询\n  alt 缓存命中`

    expect(findEditableTextMatches(code, '用户', 'sequence')[0].context).toBe('alias')
    expect(findEditableTextMatches(code, '提交查询', 'sequence')[0].context).toBe('message')
    expect(findEditableTextMatches(code, '缓存命中', 'sequence')[0].context).toBe('heading')
  })

  it('returns every editable occurrence with line information', () => {
    const code = `flowchart LR\n  a[审核] --> b[审核]`
    const matches = findEditableTextMatches(code, '审核', 'flowchart')

    expect(matches).toHaveLength(2)
    expect(matches.map((match) => match.column)).toEqual([5, 15])
  })

  it('updates only the selected source token and protects its delimiter', () => {
    const code = `flowchart LR\n  a[审核] --> b[审核]`
    const match = findEditableTextMatches(code, '审核', 'flowchart')[1]

    expect(replaceEditableText(code, match, '复核]完成')).toBe(`flowchart LR\n  a[审核] --> b[复核］完成]`)
  })

  it('supports architecture quoted labels and normalizes rendered whitespace', () => {
    const code = `architecture-beta\n  service api(server)["API 网关"]`
    const match = findEditableTextMatches(code, ' API\u00a0 网关 ', 'architecture')

    expect(normalizeRenderedText(' API\u00a0 网关 ')).toBe('API 网关')
    expect(match).toHaveLength(1)
    expect(match[0].context).toBe('quoted')
  })

  it('matches gantt tasks and mindmap lines', () => {
    expect(findEditableTextMatches('gantt\n  需求澄清 :done, req, 2026-08-17, 5d', '需求澄清', 'gantt')).toHaveLength(1)
    expect(findEditableTextMatches('mindmap\n  用户\n    产品经理', '产品经理', 'mindmap')).toHaveLength(1)
  })
})

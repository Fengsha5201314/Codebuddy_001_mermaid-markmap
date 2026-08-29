import { describe, expect, it } from 'vitest'
import { compileFengshaPlanToMermaid, fengshaPlanToLegacyDrawioSource, parseFengshaPlan } from './fengsha-plan'

const validPlan = JSON.stringify({
  schemaVersion: 'fengsha.plan/v1',
  diagramType: 'workflow',
  title: '审批流程',
  direction: 'LR',
  lanes: [{ id: 'applicant', label: '申请人' }, { id: 'approver', label: '审批人' }],
  nodes: [
    { id: 'start', type: 'start', label: '开始', lane: 'applicant', column: 0 },
    { id: 'submit', type: 'process', label: '提交申请', lane: 'applicant', column: 1 },
    { id: 'approved', type: 'decision', label: '审批通过？', lane: 'approver', column: 2 },
    { id: 'end', type: 'end', label: '完成', lane: 'applicant', column: 3 },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'submit', kind: 'normal' },
    { id: 'e2', source: 'submit', target: 'approved', kind: 'normal' },
    { id: 'e3', source: 'approved', target: 'end', label: '通过', kind: 'yes' },
  ],
})

describe('fengsha.plan/v1', () => {
  it('parses a strict workflow plan and compiles deterministic Mermaid', () => {
    const plan = parseFengshaPlan(validPlan)
    expect(plan.nodes).toHaveLength(4)
    const mermaid = compileFengshaPlanToMermaid(plan)
    expect(mermaid).toContain('flowchart LR')
    expect(mermaid).toContain('subgraph applicant["申请人"]')
    expect(mermaid).toContain('approved{"审批通过？"}')
    expect(mermaid).toContain('approved -->|"通过"| end')
  })

  it('compiles to the existing deterministic draw.io replacement plan', () => {
    const legacy = JSON.parse(fengshaPlanToLegacyDrawioSource(validPlan))
    expect(legacy).toMatchObject({ version: 1, mode: 'replace', title: '审批流程' })
    expect(legacy.nodes).toHaveLength(4)
  })

  it('rejects unknown fields and dangling references', () => {
    const unknown = JSON.parse(validPlan)
    unknown.nodes[0].invented = true
    expect(() => parseFengshaPlan(JSON.stringify(unknown))).toThrow(/未知字段/)

    const dangling = JSON.parse(validPlan)
    dangling.edges[0].target = 'missing'
    expect(() => parseFengshaPlan(JSON.stringify(dangling))).toThrow(/不存在的终点/)
  })

  it('escapes HTML-like labels and applies columns deterministically', () => {
    const value = JSON.parse(validPlan)
    value.nodes = [
      { id: 'later', type: 'manual', label: '<b>后一步</b>', column: 2 },
      { id: 'earlier', type: 'document', label: '先一步', column: 1 },
    ]
    value.edges = [{ id: 'e1', source: 'earlier', target: 'later', kind: 'normal' }]
    const mermaid = compileFengshaPlanToMermaid(JSON.stringify(value))
    expect(mermaid.indexOf('earlier')).toBeLessThan(mermaid.indexOf('later'))
    expect(mermaid).toContain('&lt;b&gt;后一步&lt;/b&gt;')
    expect(mermaid).not.toContain('@{ shape:')
  })
})

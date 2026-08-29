import { describe, expect, it } from 'vitest'
import { compileAiDrawioCode } from '@/lib/ai-drawio-plan'
import { validateDrawioXml } from '@/lib/drawio-xml'

const replacementPlan = JSON.stringify({
  version: 1,
  mode: 'replace',
  title: 'SAP MM 采购审批',
  direction: 'LR',
  lanes: [
    { id: 'oa', label: 'OA 申请人' },
    { id: 'sap', label: 'SAP MM' },
  ],
  nodes: [
    { id: 'start', type: 'start', label: '开始', lane: 'oa', column: 0 },
    { id: 'request', type: 'process', label: '提交 A&B <采购>申请', lane: 'oa', column: 1 },
    { id: 'approved', type: 'decision', label: '审批通过？', lane: 'oa', column: 2 },
    { id: 'po', type: 'document', label: '创建采购订单 "PO"', lane: 'sap', column: 3 },
    { id: 'end', type: 'end', label: '完成', lane: 'sap', column: 4 },
  ],
  edges: [
    { source: 'start', target: 'request' },
    { source: 'request', target: 'approved' },
    { source: 'approved', target: 'po', label: '是' },
    { source: 'po', target: 'end' },
    { source: 'approved', target: 'request', label: '否', kind: 'return' },
  ],
})

describe('AI draw.io plan compiler', () => {
  it('deterministically compiles a professional plan without XML escaping failures', () => {
    const first = compileAiDrawioCode(replacementPlan, '')
    const second = compileAiDrawioCode(replacementPlan, '')

    expect(first).toBe(second)
    expect(validateDrawioXml(first)).toBeNull()
    const parsed = new DOMParser().parseFromString(first, 'application/xml')
    expect(parsed.querySelector('parsererror')).toBeNull()
    expect(parsed.querySelectorAll('mxCell[vertex="1"]')).toHaveLength(7)
    expect(parsed.querySelectorAll('mxCell[edge="1"]')).toHaveLength(5)
    expect([...parsed.querySelectorAll('mxCell')].some((cell) => cell.getAttribute('value') === '提交 A&B <采购>申请')).toBe(true)
  })

  it('rejects duplicate ids and dangling connections with actionable messages', () => {
    const invalid = JSON.stringify({
      version: 1,
      mode: 'replace',
      nodes: [
        { id: 'same', type: 'process', label: '节点一' },
        { id: 'same', type: 'process', label: '节点二' },
      ],
      edges: [{ source: 'same', target: 'missing' }],
    })

    expect(() => compileAiDrawioCode(invalid, '')).toThrow(/重复节点 ID：same/)
    expect(() => compileAiDrawioCode('{"version":1,"mode":"patch","operations":[{"op":"moveNode","id":"same","y":20}]}', '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>')).toThrow(/x不能为空/)
  })

  it('applies small patches while preserving untouched styles and geometry', () => {
    const source = '<mxfile host="embedded"><diagram id="page-1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="approve" value="审批" style="rounded=1;fillColor=#fff2cc;" vertex="1" parent="1"><mxGeometry x="240" y="80" width="120" height="56" as="geometry"/></mxCell><mxCell id="pay" value="付款" style="rounded=1;fillColor=#d5e8d4;" vertex="1" parent="1"><mxGeometry x="440" y="80" width="120" height="56" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>'
    const patch = JSON.stringify({
      version: 1,
      mode: 'patch',
      operations: [
        { op: 'updateNode', id: 'approve', label: '财务复核' },
        { op: 'addEdge', edge: { id: 'review-to-pay', source: 'approve', target: 'pay', label: '通过' } },
      ],
    })

    const result = compileAiDrawioCode(patch, source)
    expect(validateDrawioXml(result)).toBeNull()
    const parsed = new DOMParser().parseFromString(result, 'application/xml')
    const approve = parsed.querySelector('mxCell[id="approve"]')
    expect(approve?.getAttribute('value')).toBe('财务复核')
    expect(approve?.getAttribute('style')).toBe('rounded=1;fillColor=#fff2cc;')
    expect(approve?.querySelector('mxGeometry')?.getAttribute('x')).toBe('240')
    expect(parsed.querySelector('mxCell[id="review-to-pay"]')?.getAttribute('target')).toBe('pay')
  })

  it('keeps valid legacy XML compatible during rollout', () => {
    const legacy = '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>'
    expect(compileAiDrawioCode(legacy, '')).toBe(legacy)
  })

  it('stress-compiles a large multilingual business flow without broken references', () => {
    const nodes = Array.from({ length: 80 }, (_, index) => ({
      id: `step-${index + 1}`,
      type: index === 0 ? 'start' : index === 79 ? 'end' : index % 9 === 0 ? 'decision' : 'process',
      label: `步骤 ${index + 1}：采购 & OA <复核> "确认"`,
      lane: `lane-${index % 5}`,
      column: index,
    }))
    const edges = Array.from({ length: 79 }, (_, index) => ({
      id: `edge-${index + 1}`,
      source: `step-${index + 1}`,
      target: `step-${index + 2}`,
      label: index % 9 === 8 ? '通过 & 继续' : undefined,
    }))
    const plan = JSON.stringify({
      version: 1,
      mode: 'replace',
      title: '大型 SAP MM 与 OA 协同流程',
      direction: 'LR',
      lanes: Array.from({ length: 5 }, (_, index) => ({ id: `lane-${index}`, label: `责任部门 ${index + 1}` })),
      nodes,
      edges,
    })

    const xml = compileAiDrawioCode(plan, '')
    expect(validateDrawioXml(xml)).toBeNull()
    const parsed = new DOMParser().parseFromString(xml, 'application/xml')
    expect(parsed.querySelectorAll('mxCell[vertex="1"]')).toHaveLength(85)
    expect(parsed.querySelectorAll('mxCell[edge="1"]')).toHaveLength(79)
  })

  it('grows lanes and nodes instead of placing dense content outside the lane', () => {
    const plan = JSON.stringify({
      version: 1,
      mode: 'replace',
      lanes: [{ id: 'lane', label: '业务部门' }],
      nodes: Array.from({ length: 3 }, (_, index) => ({
        id: `node-${index}`,
        type: 'process',
        label: index === 0 ? '这是一个需要多行完整显示的超长中文业务节点内容，用来验证高度会自动增长' : `节点 ${index}`,
        lane: 'lane',
        column: 0,
      })),
      edges: [],
    })
    const parsed = new DOMParser().parseFromString(compileAiDrawioCode(plan, ''), 'application/xml')
    const lane = parsed.querySelector('mxCell[id^="lane-lane"] mxGeometry')!
    const laneHeight = Number(lane.getAttribute('height'))
    const nodes = [...parsed.querySelectorAll('mxCell[id^="node-"]')].map((cell) => cell.querySelector('mxGeometry')!)
    const bottom = Math.max(...nodes.map((geometry) => Number(geometry.getAttribute('y')) + Number(geometry.getAttribute('height'))))
    expect(laneHeight).toBeGreaterThan(176)
    expect(bottom).toBeLessThan(laneHeight)
    expect(Number(nodes[0].getAttribute('height'))).toBeGreaterThan(68)
  })
})

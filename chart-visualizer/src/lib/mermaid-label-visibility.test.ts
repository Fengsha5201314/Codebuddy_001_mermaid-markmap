import { describe, expect, it } from 'vitest'
import { findOverflowingNodeLabels, repairMermaidLabelVisibility } from '@/lib/mermaid-label-visibility'

describe('Mermaid label visibility repair', () => {
  it('detects native SVG node text that is wider than its cell', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g class="node"><rect class="label-container" width="272" height="60"/>
        <text font-size="16"><tspan>边界：P1 3L内锅未在C053建立自制视图／BOM</tspan></text>
      </g>
    </svg>`

    expect(findOverflowingNodeLabels(svg)).toEqual(['边界：P1 3L内锅未在C053建立自制视图／BOM'])
  })

  it('detects Mermaid foreignObject text before it is converted for export', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g class="node"><rect class="label-container" width="272" height="60"/>
        <foreignObject width="200" height="24"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel">边界：P1 3L内锅未在C053建立自制视图／BOM</span></div></foreignObject>
      </g>
    </svg>`

    expect(findOverflowingNodeLabels(svg)).toEqual(['边界：P1 3L内锅未在C053建立自制视图／BOM'])
  })

  it('repairs only overflowing flowchart cells and preserves all label text', () => {
    const code = `flowchart TB
  NP1["边界：P1 3L内锅未在C053建立自制视图／BOM"]
  OK["审批完成"]`
    const repaired = repairMermaidLabelVisibility(code, ['边界：P1 3L内锅未在C053建立自制视图／BOM'])

    expect(repaired.changedLabels).toBe(1)
    expect(repaired.code).toContain('边界：P1 3L内锅未在C053<br/>建立自制视图／BOM')
    expect(repaired.code).toContain('OK["审批完成"]')
    expect(repaired.code.replace(/<br\s*\/?>/gi, '')).toContain('边界：P1 3L内锅未在C053建立自制视图／BOM')
  })

  it('rewraps already multiline labels when one existing line still overflows', () => {
    const code = 'flowchart TB\n  OTHER["其他外购件<br/>IH线圈盘／传感器／阀组／硅胶件／紧固件等"]'
    const repaired = repairMermaidLabelVisibility(code, ['其他外购件IH线圈盘／传感器／阀组／硅胶件／紧固件等'])

    expect(repaired.changedLabels).toBe(1)
    expect((repaired.code.match(/<br\/>/g) ?? []).length).toBeGreaterThan(1)
  })

  it('uses each rendered cell width instead of one global wrapping width', () => {
    const code = 'flowchart TB\n  N["窄单元格需要更短换行"]'
    const repaired = repairMermaidLabelVisibility(code, [{ text: '窄单元格需要更短换行', maximumLineUnits: 5 }])

    expect(repaired.code).toContain('窄单元格需<br/>要更短换行')
  })

  it('repairs every repeated instance without losing an unbroken CJK character', () => {
    const label = '这是一个没有任何分隔符但仍然必须完整保留并自动换行的超长中文标签'
    const code = `flowchart TB\n  A["${label}"]\n  B["${label}"]`
    const repaired = repairMermaidLabelVisibility(code, [{ text: label, maximumLineUnits: 8 }])

    expect(repaired.changedLabels).toBe(2)
    expect((repaired.code.match(/<br\/>/g) ?? []).length).toBeGreaterThan(2)
    expect(repaired.code.replace(/<br\/>/g, '')).toContain(`A["${label}"]`)
    expect(repaired.code.replace(/<br\/>/g, '')).toContain(`B["${label}"]`)
  })
})

import { describe, expect, it } from 'vitest'
import { visualAiStreamPreview } from '@/lib/ai-stream-preview'

describe('visual AI streaming preview', () => {
  it('shows live progress for partial draw.io XML instead of a frozen summary', () => {
    const first = visualAiStreamPreview('{"summary":"新增复核","code":"<mxfile><diagram>')
    const second = visualAiStreamPreview('{"summary":"新增复核","code":"<mxfile><diagram><mxGraphModel><root><mxCell id=\\"review\\"')
    expect(first).toContain('新增复核')
    expect(first).toContain('<mxfile><diagram>')
    expect(second).toContain('<mxCell id="review"')
    expect(second).not.toBe(first)
  })

  it('shows the current Mermaid tail while a new visual canvas is generated', () => {
    const preview = visualAiStreamPreview('{"summary":"生成流程","code":"flowchart LR\\nA --> B')
    expect(preview).toContain('正在生成 Mermaid 源码')
    expect(preview).toContain('A --> B')
  })

  it('shows structural progress when visual AI returns an object plan', () => {
    const preview = visualAiStreamPreview('{"summary":"生成采购流程","code":{"version":1,"mode":"replace","nodes":[{"id":"start","type":"start","label":"开始"},{"id":"approve","type":"decision","label":"审批？"}],"edges":[{"source":"start","target":"approve"}]')
    expect(preview).toContain('正在生成结构化画布计划')
    expect(preview).toContain('2 个节点、1 条连线')
    expect(preview).not.toContain('Mermaid')
  })
})

import { describe, expect, it } from 'vitest'
import { visualAiStreamPreview } from '@/lib/ai-stream-preview'

describe('visual AI streaming preview', () => {
  it('shows live progress for partial draw.io XML instead of a frozen summary', () => {
    const first = visualAiStreamPreview('{"summary":"新增复核","code":"<mxfile><diagram>')
    const second = visualAiStreamPreview('{"summary":"新增复核","code":"<mxfile><diagram><mxGraphModel>')
    expect(first).toContain('新增复核')
    expect(first).toContain('正在生成画布结构')
    expect(second).not.toBe(first)
  })

  it('shows the current Mermaid tail while a new visual canvas is generated', () => {
    const preview = visualAiStreamPreview('{"summary":"生成流程","code":"flowchart LR\\nA --> B')
    expect(preview).toContain('正在生成 Mermaid 源码')
    expect(preview).toContain('A --> B')
  })
})

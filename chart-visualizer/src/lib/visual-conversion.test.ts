import { describe, expect, it } from 'vitest'
import { toDrawioCompatibleMermaid } from './visual-conversion'

describe('toDrawioCompatibleMermaid', () => {
  it('keeps standard Mermaid unchanged', () => {
    const source = 'flowchart LR\n  a --> b'
    expect(toDrawioCompatibleMermaid(source)).toEqual({ source, normalized: false })
  })

  it('lowers Mermaid 11.16 swimlane beta syntax to grouped flowchart syntax', () => {
    const result = toDrawioCompatibleMermaid('swimlane-beta TB\nsubgraph sales [销售]\n  a[审核]\nend')
    expect(result.source).toContain('flowchart TB')
    expect(result.source).toContain('subgraph sales [销售]')
    expect(result.normalized).toBe(true)
  })
})

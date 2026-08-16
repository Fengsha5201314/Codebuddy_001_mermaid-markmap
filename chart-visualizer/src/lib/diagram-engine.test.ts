import { describe, expect, it } from 'vitest'
import { detectDiagramKind } from '@/lib/diagram-engine'

describe('detectDiagramKind', () => {
  it.each([
    ['flowchart LR\nA --> B', 'flowchart'],
    ['graph TD\nA --> B', 'flowchart'],
    ['swimlane-beta LR', 'swimlane'],
    ['architecture-beta', 'architecture'],
    ['sequenceDiagram', 'sequence'],
    ['classDiagram', 'class'],
    ['stateDiagram-v2', 'state'],
    ['erDiagram', 'er'],
    ['gantt', 'gantt'],
    ['mindmap', 'mindmap'],
    ['journey', 'journey'],
    ['C4Context', 'c4'],
  ] as const)('识别 %s', (code, expected) => {
    expect(detectDiagramKind(code)).toBe(expected)
  })

  it('跳过前置配置和注释', () => {
    expect(detectDiagramKind('---\ntheme: neutral\n---\n%% comment\nflowchart LR\nA --> B')).toBe('flowchart')
  })
})

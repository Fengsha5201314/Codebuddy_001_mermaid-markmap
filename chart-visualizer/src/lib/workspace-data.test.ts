import { describe, expect, it } from 'vitest'
import { createWorkspaceBackup, normalizeWorkspaceDocuments, parseWorkspaceBackup } from '@/lib/workspace-data'
import type { DiagramDocument } from '@/types'

const document: DiagramDocument = {
  id: 'diagram-1',
  projectId: 'project-1',
  order: 0,
  title: '审批流程',
  description: '测试图表',
  engine: 'mermaid',
  code: 'flowchart LR\nA --> B',
  kind: 'flowchart',
  themeId: 'paper',
  favorite: false,
  tags: ['流程'],
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
  versions: [],
}

describe('workspace data', () => {
  it('可完整备份并恢复工作区', () => {
    const backup = createWorkspaceBackup([document])
    const restored = parseWorkspaceBackup(JSON.stringify(backup))
    expect(restored.documents).toEqual([document])
  })

  it('恢复时修正可恢复字段并重新识别图种', () => {
    const [normalized] = normalizeWorkspaceDocuments([{
      ...document,
      title: '  ',
      kind: 'other',
      themeId: 'unknown',
      tags: ['流程', '流程', '', 1],
    }])
    expect(normalized.title).toBe('导入图表 1')
    expect(normalized.kind).toBe('flowchart')
    expect(normalized.themeId).toBe('paper')
    expect(normalized.tags).toEqual(['流程'])
  })

  it('把旧文档和旧版本自动迁移为 Mermaid 引擎', () => {
    const legacyDocument = {
      ...document,
      engine: undefined,
      versions: [{
        id: 'version-1',
        code: 'flowchart LR\nA --> C',
        createdAt: document.createdAt,
        label: '旧版本',
      }],
    }
    const [normalized] = normalizeWorkspaceDocuments([legacyDocument])
    expect(normalized.engine).toBe('mermaid')
    expect(normalized.versions[0]).toMatchObject({
      engine: 'mermaid',
      code: 'flowchart LR\nA --> C',
    })
  })

  it('完整保存并恢复 draw.io XML 和来源 Mermaid', () => {
    const visualDocument: DiagramDocument = {
      ...document,
      id: 'visual-1',
      engine: 'drawio',
      drawioXml: '<mxfile><diagram>visual</diagram></mxfile>',
      sourceMermaid: document.code,
      sourceDocumentId: document.id,
      versions: [{
        id: 'visual-version-1',
        engine: 'drawio',
        code: document.code,
        drawioXml: '<mxfile><diagram>snapshot</diagram></mxfile>',
        sourceMermaid: document.code,
        sourceDocumentId: document.id,
        createdAt: document.createdAt,
        label: '画布版本',
      }],
    }
    const restored = parseWorkspaceBackup(JSON.stringify(createWorkspaceBackup([visualDocument])))
    expect(restored.version).toBe(3)
    expect(restored.documents[0]).toEqual(visualDocument)
  })

  it('仍可读取版本 1 的工作区备份', () => {
    const legacyDocument = { ...document, engine: undefined }
    const restored = parseWorkspaceBackup(JSON.stringify({
      schema: 'mermaid-workbench',
      version: 1,
      exportedAt: document.createdAt,
      documents: [legacyDocument],
    }))
    expect(restored.version).toBe(3)
    expect(restored.documents[0].engine).toBe('mermaid')
  })

  it('拒绝损坏记录，避免覆盖当前工作区', () => {
    expect(() => parseWorkspaceBackup(JSON.stringify({
      schema: 'mermaid-workbench',
      version: 1,
      documents: [{ id: 'broken' }],
    }))).toThrow('损坏')
  })

  it('拒绝未知备份版本', () => {
    expect(() => parseWorkspaceBackup(JSON.stringify({
      schema: 'mermaid-workbench',
      version: 99,
      documents: [document],
    }))).toThrow('暂不受支持')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_DRAWIO_XML } from '@/lib/workspace-data'
import { useWorkspaceStore } from '@/store/workspace-store'

describe('workspace store visual documents', () => {
  beforeEach(() => {
    localStorage.clear()
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  })

  it('创建独立的可视化文档并保存原生 XML', () => {
    const xml = '<mxfile><diagram>created</diagram></mxfile>'
    const id = useWorkspaceStore.getState().createVisualDocument('客户旅程', xml)
    const state = useWorkspaceStore.getState()
    const document = state.documents.find((item) => item.id === id)

    expect(state.activeDocumentId).toBe(id)
    expect(document).toMatchObject({
      title: '客户旅程',
      engine: 'drawio',
      code: '',
      drawioXml: xml,
      versions: [],
    })
    expect(document).not.toHaveProperty('sourceMermaid')
  })

  it('同一项目可以创建多张有父子关系的图表', () => {
    const source = useWorkspaceStore.getState().documents[0]
    const originalProjectCount = useWorkspaceStore.getState().projects.length
    const childId = useWorkspaceStore.getState().createDocument(undefined, source.projectId, source.id)
    const state = useWorkspaceStore.getState()
    const child = state.documents.find((item) => item.id === childId)

    expect(state.projects).toHaveLength(originalProjectCount)
    expect(child).toMatchObject({ projectId: source.projectId, parentDocumentId: source.id })
    expect(state.activeProjectId).toBe(source.projectId)
  })

  it('项目重命名不会破坏子图和双画布关联', () => {
    const source = useWorkspaceStore.getState().documents[0]
    const childId = useWorkspaceStore.getState().createDocument(undefined, source.projectId, source.id)
    useWorkspaceStore.getState().renameProject(source.projectId, '采购协同项目')

    const state = useWorkspaceStore.getState()
    expect(state.projects.find((item) => item.id === source.projectId)?.title).toBe('采购协同项目')
    expect(state.documents.find((item) => item.id === childId)?.projectId).toBe(source.projectId)
  })

  it('把 Mermaid 活动文档转换为可视化副本并保留原文档', () => {
    const before = useWorkspaceStore.getState()
    const source = before.documents.find((item) => item.id === before.activeDocumentId)!
    const originalCount = before.documents.length
    const xml = '<mxfile><diagram>converted</diagram></mxfile>'

    const convertedId = before.convertActiveToVisual(xml)
    const after = useWorkspaceStore.getState()
    const converted = after.documents.find((item) => item.id === convertedId)

    expect(after.documents).toHaveLength(originalCount + 1)
    expect(after.documents.find((item) => item.id === source.id)).toEqual(source)
    expect(converted).toMatchObject({
      engine: 'drawio',
      title: source.title,
      code: source.code,
      sourceMermaid: source.code,
      drawioXml: xml,
      favorite: false,
    })
    expect(after.activeDocumentId).toBe(convertedId)
  })

  it('双画布共享同一个项目标题', () => {
    const sourceId = useWorkspaceStore.getState().activeDocumentId
    const visualId = useWorkspaceStore.getState().convertActiveToVisual()!
    useWorkspaceStore.getState().updateActiveDocument({ title: '统一项目标题' })

    expect(useWorkspaceStore.getState().documents.find((item) => item.id === sourceId)?.title).toBe('统一项目标题')
    expect(useWorkspaceStore.getState().documents.find((item) => item.id === visualId)?.title).toBe('统一项目标题')
  })

  it('同一 Mermaid 图表重复进入可视化画布时复用已有画布', () => {
    const sourceId = useWorkspaceStore.getState().activeDocumentId
    const originalCount = useWorkspaceStore.getState().documents.length
    const firstVisualId = useWorkspaceStore.getState().convertActiveToVisual('<mxfile><diagram>first</diagram></mxfile>')

    useWorkspaceStore.getState().setActiveDocument(sourceId)
    const secondVisualId = useWorkspaceStore.getState().convertActiveToVisual('<mxfile><diagram>second</diagram></mxfile>')
    const after = useWorkspaceStore.getState()

    expect(secondVisualId).toBe(firstVisualId)
    expect(after.documents).toHaveLength(originalCount + 1)
    expect(after.activeDocumentId).toBe(firstVisualId)
    expect(after.documents.find((item) => item.id === firstVisualId)?.drawioXml).toContain('first')
  })

  it('明确确认后用最新 Mermaid 源码刷新关联画布', () => {
    const sourceId = useWorkspaceStore.getState().activeDocumentId
    const visualId = useWorkspaceStore.getState().convertActiveToVisual('<mxfile><diagram>old</diagram></mxfile>')!
    useWorkspaceStore.getState().setActiveDocument(sourceId)
    useWorkspaceStore.getState().updateCode('flowchart LR\nNew --> Source')

    expect(useWorkspaceStore.getState().convertActiveToVisual(undefined, true)).toBe(visualId)
    expect(useWorkspaceStore.getState().documents.find((item) => item.id === visualId)).toMatchObject({
      drawioXml: EMPTY_DRAWIO_XML,
      sourceMermaid: 'flowchart LR\nNew --> Source',
      code: 'flowchart LR\nNew --> Source',
    })
  })

  it('可视化 AI 生成 Mermaid 时同步回同一项目源码', () => {
    const sourceId = useWorkspaceStore.getState().activeDocumentId
    const visualId = useWorkspaceStore.getState().convertActiveToVisual()!
    const generated = 'flowchart TD\nAI --> Synced'
    useWorkspaceStore.getState().updateVisualSource('<mxfile><diagram>ai</diagram></mxfile>', generated)

    expect(useWorkspaceStore.getState().documents.find((item) => item.id === sourceId)?.code).toBe(generated)
    expect(useWorkspaceStore.getState().documents.find((item) => item.id === visualId)?.sourceMermaid).toBe(generated)
  })

  it('只通过可视化更新接口修改 draw.io 文档', () => {
    const id = useWorkspaceStore.getState().createVisualDocument()
    const updatedXml = '<mxfile><diagram>updated</diagram></mxfile>'
    const sourceMermaid = 'flowchart TD\nStart --> Finish'

    useWorkspaceStore.getState().updateVisualSource(updatedXml, sourceMermaid)
    let document = useWorkspaceStore.getState().documents.find((item) => item.id === id)!
    expect(document).toMatchObject({
      drawioXml: updatedXml,
      sourceMermaid,
      code: sourceMermaid,
      kind: 'flowchart',
    })

    useWorkspaceStore.getState().updateCode('flowchart LR\nX --> Y')
    document = useWorkspaceStore.getState().documents.find((item) => item.id === id)!
    expect(document.code).toBe(sourceMermaid)
  })

  it('可视化版本快照保存并恢复对应 XML', () => {
    const firstXml = '<mxfile><diagram>first</diagram></mxfile>'
    const secondXml = '<mxfile><diagram>second</diagram></mxfile>'
    const id = useWorkspaceStore.getState().createVisualDocument('版本测试', firstXml)
    useWorkspaceStore.getState().createVersion('第一版')
    const version = useWorkspaceStore.getState().documents.find((item) => item.id === id)!.versions[0]

    expect(version).toMatchObject({ engine: 'drawio', drawioXml: firstXml })
    useWorkspaceStore.getState().updateVisualSource(secondXml)
    useWorkspaceStore.getState().restoreVersion(version.id)
    expect(useWorkspaceStore.getState().documents.find((item) => item.id === id)!.drawioXml).toBe(firstXml)
  })

  it('可视化文档缺少 XML 时使用安全空画布', () => {
    const id = useWorkspaceStore.getState().createVisualDocument('空画布', '   ')
    expect(useWorkspaceStore.getState().documents.find((item) => item.id === id)!.drawioXml).toBe(EMPTY_DRAWIO_XML)
  })

  it('切换文档后仍把迟到的自动保存写回原文档', () => {
    const firstId = useWorkspaceStore.getState().createVisualDocument('第一张')
    const secondId = useWorkspaceStore.getState().createVisualDocument('第二张')
    const lateXml = '<mxfile><diagram>late-save</diagram></mxfile>'
    expect(useWorkspaceStore.getState().activeDocumentId).toBe(secondId)
    useWorkspaceStore.getState().updateVisualDocument(firstId, lateXml)
    expect(useWorkspaceStore.getState().documents.find((item) => item.id === firstId)?.drawioXml).toBe(lateXml)
    expect(useWorkspaceStore.getState().documents.find((item) => item.id === secondId)?.drawioXml).toBe(EMPTY_DRAWIO_XML)
  })

  it('在一次状态提交中创建回滚版本并记录最后有效图', () => {
    const documentId = useWorkspaceStore.getState().activeDocumentId
    const before = useWorkspaceStore.getState().documents.find((item) => item.id === documentId)!
    const source = 'flowchart LR\nA[已验证] --> B[完成]'
    const committed = useWorkspaceStore.getState().commitValidatedCandidate(documentId, source, {
      engine: 'mermaid',
      source,
      sourceSha256: 'A'.repeat(64),
      quality: 'professional',
      verifiedAt: '2026-08-29T00:00:00.000Z',
      checksPassed: 6,
      checksTotal: 6,
    })
    const after = useWorkspaceStore.getState().documents.find((item) => item.id === documentId)!
    expect(committed).toBe(true)
    expect(after.code).toBe(source)
    expect(after.versions[0].code).toBe(before.code)
    expect(after.lastGood).toMatchObject({ sourceSha256: 'A'.repeat(64), checksPassed: 6 })
  })
})

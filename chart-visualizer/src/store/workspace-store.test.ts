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
      code: source.code,
      sourceMermaid: source.code,
      drawioXml: xml,
      favorite: false,
    })
    expect(after.activeDocumentId).toBe(convertedId)
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
})

import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrawioBridgeOptions } from '@/lib/drawio-bridge'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { DiagramDocument } from '@/types'
import { VisualCanvas, type VisualCanvasHandle } from './VisualCanvas'

const bridgeMocks = vi.hoisted(() => ({
  create: vi.fn(),
  options: null as unknown,
  bridge: {
    state: 'ready',
    url: 'http://localhost/drawio/',
    origin: 'http://localhost',
    load: vi.fn(),
    invokeAction: vi.fn(),
    layout: vi.fn(),
    exportDiagram: vi.fn(),
    destroy: vi.fn(),
  },
}))

const qualityMocks = vi.hoisted(() => ({ assess: vi.fn() }))

vi.mock('@/lib/drawio-bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drawio-bridge')>()
  return { ...actual, createDrawioBridge: bridgeMocks.create }
})

vi.mock('@/lib/reliable-diagram-delivery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/reliable-diagram-delivery')>()
  return { ...actual, assessDrawioDiagram: qualityMocks.assess }
})

vi.mock('@/lib/portable-drawio-svg', () => ({ makePortableDrawioSvg: (svg: string) => svg }))

const baseXml = '<mxfile><diagram id="base"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="base-node" value="原画布" vertex="1" parent="1"><mxGeometry x="20" y="20" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>'
const olderLastGoodXml = '<mxfile><diagram id="older"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="older-node" value="更早版本" vertex="1" parent="1"><mxGeometry x="20" y="20" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>'
const candidateXml = '<mxfile><diagram id="candidate"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="candidate-node" value="AI 候选" vertex="1" parent="1"><mxGeometry x="20" y="20" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>'
const meaningfulSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="100" height="50"/><rect x="120" width="100" height="50"/><text x="10" y="20">AI 候选</text><!--${'x'.repeat(900)}--></svg>`

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  bridgeMocks.options = null
  bridgeMocks.create.mockImplementation((options) => {
    bridgeMocks.options = options
    return bridgeMocks.bridge
  })
  bridgeMocks.bridge.load.mockReset()
  bridgeMocks.bridge.exportDiagram.mockReset()
  bridgeMocks.bridge.destroy.mockReset()
  bridgeMocks.bridge.exportDiagram.mockImplementation(async (format: string) => format === 'xml'
    ? { format, xml: candidateXml }
    : { format, data: meaningfulSvg })
  qualityMocks.assess.mockResolvedValue({
    receiptVersion: 1,
    engine: 'drawio',
    quality: 'professional',
    ok: true,
    acceptance: 'provisional',
    generatedAt: '2026-08-30T00:00:00.000Z',
    inputSha256: 'candidate-sha',
    counts: { nodes: 2, edges: 1, lanes: 0 },
    checks: [{ id: 'render', label: '渲染', status: 'passed', message: '通过' }],
    diagnostics: [],
    visualReview: 'pending',
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

function createDocument(): DiagramDocument {
  const id = useWorkspaceStore.getState().createVisualDocument('候选事务图', baseXml)
  return useWorkspaceStore.getState().documents.find((item) => item.id === id) as DiagramDocument
}

describe('VisualCanvas candidate transaction', () => {
  it('resolves only after the exact XML snapshot SVG passes and commits', async () => {
    const diagram = createDocument()
    const canvasRef = createRef<VisualCanvasHandle>()
    await act(async () => {
      root.render(<VisualCanvas ref={canvasRef} document={diagram} onConvertInfo={() => undefined} onNotice={() => undefined} />)
      await Promise.resolve()
    })

    let application!: Promise<void>
    let settled = false
    await act(async () => {
      application = canvasRef.current!.loadXml(candidateXml)
      application.then(() => { settled = true }, () => { settled = true })
      await Promise.resolve()
    })
    expect(settled).toBe(false)
    expect(bridgeMocks.bridge.load).toHaveBeenCalledWith({ type: 'xml', xml: candidateXml })

    await act(async () => {
      ;(bridgeMocks.options as DrawioBridgeOptions).onLoad?.({})
      await application
    })

    expect(bridgeMocks.bridge.exportDiagram).toHaveBeenCalledWith('svg', { xml: candidateXml })
    expect(qualityMocks.assess).toHaveBeenCalledWith(candidateXml, 'professional', meaningfulSvg)
    const committed = useWorkspaceStore.getState().documents.find((item) => item.id === diagram.id)
    expect(committed?.drawioXml).toBe(candidateXml)
    expect(committed?.versions[0]?.label).toBe('候选应用前')
  })

  it('rejects a pending application when the canvas is closed and keeps the original XML', async () => {
    const diagram = createDocument()
    const canvasRef = createRef<VisualCanvasHandle>()
    await act(async () => {
      root.render(<VisualCanvas ref={canvasRef} document={diagram} onConvertInfo={() => undefined} onNotice={() => undefined} />)
      await Promise.resolve()
    })

    const application = canvasRef.current!.loadXml(candidateXml)
    const rejection = expect(application).rejects.toThrow('画布已切换或关闭')
    await act(async () => root.unmount())
    root = createRoot(host)
    await rejection
    expect(useWorkspaceStore.getState().documents.find((item) => item.id === diagram.id)?.drawioXml).toBe(baseXml)
  })

  it('rejects a pending application when the user switches to another diagram', async () => {
    const firstDiagram = createDocument()
    const secondDiagram = createDocument()
    const canvasRef = createRef<VisualCanvasHandle>()
    await act(async () => {
      root.render(<VisualCanvas ref={canvasRef} document={firstDiagram} onConvertInfo={() => undefined} onNotice={() => undefined} />)
      await Promise.resolve()
    })

    const application = canvasRef.current!.loadXml(candidateXml)
    const rejection = expect(application).rejects.toThrow('画布已切换或关闭')
    await act(async () => {
      root.render(<VisualCanvas ref={canvasRef} document={secondDiagram} onConvertInfo={() => undefined} onNotice={() => undefined} />)
      await Promise.resolve()
    })
    await rejection
    expect(useWorkspaceStore.getState().documents.find((item) => item.id === firstDiagram.id)?.drawioXml).toBe(baseXml)
  })

  it('invalidates an older initial conversion before validating a newer AI candidate', async () => {
    const visualId = useWorkspaceStore.getState().convertActiveToVisual()
    const diagram = useWorkspaceStore.getState().documents.find((item) => item.id === visualId) as DiagramDocument
    const canvasRef = createRef<VisualCanvasHandle>()
    let resolveInitialQuality!: (value: Awaited<ReturnType<typeof qualityMocks.assess>>) => void
    const initialQuality = new Promise<Awaited<ReturnType<typeof qualityMocks.assess>>>((resolve) => {
      resolveInitialQuality = resolve
    })
    qualityMocks.assess
      .mockReturnValueOnce(initialQuality)
      .mockResolvedValue({
        receiptVersion: 1,
        engine: 'drawio',
        quality: 'professional',
        ok: true,
        acceptance: 'provisional',
        generatedAt: '2026-08-30T00:00:00.000Z',
        inputSha256: 'candidate-sha',
        counts: { nodes: 2, edges: 1, lanes: 0 },
        checks: [{ id: 'render', label: '渲染', status: 'passed', message: '通过' }],
        diagnostics: [],
        visualReview: 'pending',
      })

    await act(async () => {
      root.render(<VisualCanvas ref={canvasRef} document={diagram} onConvertInfo={() => undefined} onNotice={() => undefined} />)
      await Promise.resolve()
    })
    await act(async () => {
      ;(bridgeMocks.options as DrawioBridgeOptions).onLoad?.({})
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(qualityMocks.assess).toHaveBeenCalledTimes(1))

    let settled = false
    const application = canvasRef.current!.loadXml(candidateXml)
    application.then(() => { settled = true }, () => { settled = true })
    resolveInitialQuality({
      receiptVersion: 1,
      engine: 'drawio',
      quality: 'standard',
      ok: true,
      acceptance: 'provisional',
      generatedAt: '2026-08-30T00:00:00.000Z',
      inputSha256: 'initial-sha',
      counts: { nodes: 2, edges: 1, lanes: 0 },
      checks: [{ id: 'render', label: '渲染', status: 'passed', message: '通过' }],
      diagnostics: [],
      visualReview: 'pending',
    })
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(settled).toBe(false)

    await act(async () => {
      ;(bridgeMocks.options as DrawioBridgeOptions).onLoad?.({})
      await application
    })
    expect(useWorkspaceStore.getState().documents.find((item) => item.id === diagram.id)?.drawioXml).toBe(candidateXml)
  })

  it('rolls a rejected candidate back to the transaction snapshot instead of an older last-good version', async () => {
    const original = createDocument()
    useWorkspaceStore.getState().markLastGood(original.id, {
      engine: 'drawio',
      source: olderLastGoodXml,
      sourceSha256: 'older-sha',
      quality: 'professional',
      verifiedAt: '2026-08-30T00:00:00.000Z',
      checksPassed: 1,
      checksTotal: 1,
    })
    const diagram = useWorkspaceStore.getState().documents.find((item) => item.id === original.id) as DiagramDocument
    const canvasRef = createRef<VisualCanvasHandle>()
    qualityMocks.assess.mockRejectedValueOnce(new Error('专业检查失败'))
    await act(async () => {
      root.render(<VisualCanvas ref={canvasRef} document={diagram} onConvertInfo={() => undefined} onNotice={() => undefined} />)
      await Promise.resolve()
    })

    const application = canvasRef.current!.loadXml(candidateXml)
    const rejection = expect(application).rejects.toThrow('专业检查失败')
    await act(async () => {
      ;(bridgeMocks.options as DrawioBridgeOptions).onLoad?.({})
      await Promise.resolve()
      await Promise.resolve()
    })
    await rejection

    expect(bridgeMocks.bridge.load).toHaveBeenLastCalledWith({ type: 'xml', xml: baseXml })
    expect(useWorkspaceStore.getState().documents.find((item) => item.id === diagram.id)?.drawioXml).toBe(baseXml)
  })
})

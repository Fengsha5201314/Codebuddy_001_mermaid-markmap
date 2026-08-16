import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DrawioBridgeError,
  createDrawioBridge,
  type DrawioBridge,
  type DrawioBridgeOptions,
} from '@/lib/drawio-bridge'

const bridges: DrawioBridge[] = []

function createHarness(options: Partial<DrawioBridgeOptions> = {}) {
  const iframe = document.createElement('iframe')
  const editorWindow = { postMessage: vi.fn() } as unknown as Window
  Object.defineProperty(iframe, 'contentWindow', { configurable: true, value: editorWindow })

  const bridge = createDrawioBridge({
    iframe,
    source: { type: 'xml', xml: '<mxfile />' },
    ...options,
  })
  bridges.push(bridge)

  const receive = (data: unknown, origin = bridge.origin, source: MessageEventSource = editorWindow) => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source }))
  }
  const sent = (index = 0) => JSON.parse(vi.mocked(editorWindow.postMessage).mock.calls[index][0] as string)

  return { bridge, iframe, editorWindow, receive, sent }
}

afterEach(() => {
  for (const bridge of bridges.splice(0)) bridge.destroy()
  vi.useRealTimers()
})

describe('draw.io bridge', () => {
  it('builds a configurable embed URL while enforcing the JSON protocol', () => {
    const { bridge, iframe } = createHarness({
      editorUrl: 'https://draw.example.test/editor?proto=xml',
      urlParams: { lang: 'zh', plugins: false },
    })

    const url = new URL(iframe.src)
    expect(bridge.origin).toBe('https://draw.example.test')
    expect(url.searchParams.get('embed')).toBe('1')
    expect(url.searchParams.get('proto')).toBe('json')
    expect(url.searchParams.get('lang')).toBe('zh')
    expect(url.searchParams.get('plugins')).toBe('0')
  })

  it('rejects unsafe editor URLs', () => {
    const iframe = document.createElement('iframe')
    expect(() =>
      createDrawioBridge({ iframe, source: { type: 'xml', xml: '<mxfile />' }, editorUrl: 'javascript:alert(1)' }),
    ).toThrowError(DrawioBridgeError)
  })

  it('loads XML only after a trusted init event', () => {
    const onReady = vi.fn()
    const { bridge, editorWindow, receive, sent } = createHarness({
      source: { type: 'xml', xml: '<mxfile id="safe" />' },
      load: { autosave: true, title: '业务流程', fit: true },
      onReady,
    })
    const foreignWindow = { postMessage: vi.fn() } as unknown as Window

    receive(JSON.stringify({ event: 'init' }), 'https://evil.example')
    receive(JSON.stringify({ event: 'init' }), bridge.origin, foreignWindow)
    expect(editorWindow.postMessage).not.toHaveBeenCalled()

    receive(JSON.stringify({ event: 'init' }))
    expect(sent()).toEqual({
      action: 'load',
      autosave: 1,
      exportProtocol: true,
      xml: '<mxfile id="safe" />',
      title: '业务流程',
      fit: 1,
    })
    expect(editorWindow.postMessage).toHaveBeenLastCalledWith(expect.any(String), bridge.origin)
    expect(bridge.state).toBe('loading')
    expect(onReady).toHaveBeenCalledOnce()
  })

  it('loads Mermaid through a descriptor and can preserve its source metadata', () => {
    const mermaid = 'flowchart LR\nA --> B'
    const { receive, sent } = createHarness({
      source: { type: 'mermaid', mermaid, wrap: false, sourceMetadataKey: 'mermaidSource' },
    })

    receive({ event: 'init' })
    expect(sent()).toMatchObject({
      action: 'load',
      descriptor: { format: 'mermaid', data: mermaid, wrap: false },
      sourceMetadata: { key: 'mermaidSource', value: mermaid },
    })
  })

  it('reports load, autosave and save events from the bound editor', () => {
    const onLoad = vi.fn()
    const onAutosave = vi.fn()
    const onSave = vi.fn()
    const { bridge, receive } = createHarness({ onLoad, onAutosave, onSave })

    receive({ event: 'init' })
    receive(JSON.stringify({ event: 'load', checksum: 'c1', scale: 0.8, currentPage: 1 }))
    receive({ event: 'autosave', xml: '<mxfile id="auto" />', checksum: 'c2', patch: { u: {} } })
    receive({ event: 'save', xml: '<mxfile id="save" />', exit: true })

    expect(bridge.state).toBe('ready')
    expect(onLoad).toHaveBeenCalledWith({ checksum: 'c1', scale: 0.8, currentPage: 1 })
    expect(onAutosave).toHaveBeenCalledWith({
      xml: '<mxfile id="auto" />',
      checksum: 'c2',
      patch: { u: {} },
      exit: false,
    })
    expect(onSave).toHaveBeenCalledWith({
      xml: '<mxfile id="save" />',
      checksum: undefined,
      patch: undefined,
      exit: true,
    })
  })

  it('maps undo, redo, fit and layout to the official actions', () => {
    const { bridge, receive, sent, editorWindow } = createHarness()
    receive({ event: 'init' })
    receive({ event: 'load' })
    vi.mocked(editorWindow.postMessage).mockClear()

    bridge.invokeAction('undo')
    bridge.invokeAction('redo')
    bridge.invokeAction('fit', { border: 24, maxScale: 1.5 })
    bridge.layout({ layout: 'elkLayered', config: { 'elk.direction': 'RIGHT' } })

    expect(sent(0)).toEqual({ action: 'invokeAction', actionName: 'undo' })
    expect(sent(1)).toEqual({ action: 'invokeAction', actionName: 'redo' })
    expect(sent(2)).toEqual({ action: 'fit', border: 24, maxScale: 1.5 })
    expect(sent(3)).toEqual({
      action: 'layout',
      layouts: [{ layout: 'elkLayered', config: { 'elk.direction': 'RIGHT' } }],
    })
  })

  it('serializes export requests and resolves each matching response', async () => {
    const { bridge, receive, sent, editorWindow } = createHarness()
    receive({ event: 'init' })
    receive({ event: 'load' })
    vi.mocked(editorWindow.postMessage).mockClear()

    const svgPromise = bridge.exportDiagram('svg', { border: 8 })
    const pngPromise = bridge.exportDiagram('png', { transparent: true })
    expect(sent()).toEqual({ action: 'export', format: 'svg', border: 8 })
    expect(editorWindow.postMessage).toHaveBeenCalledTimes(1)

    receive({ event: 'export', format: 'svg', data: 'data:image/svg+xml;base64,AAA', xml: '<mxfile />' })
    await expect(svgPromise).resolves.toEqual({
      format: 'svg',
      data: 'data:image/svg+xml;base64,AAA',
      xml: '<mxfile />',
      filename: undefined,
    })
    expect(sent(1)).toEqual({ action: 'export', format: 'png', transparent: true })

    receive({ event: 'export', format: 'png', data: 'data:image/png;base64,BBB' })
    await expect(pngPromise).resolves.toMatchObject({ format: 'png', data: 'data:image/png;base64,BBB' })
  })

  it('rejects an export error returned by the editor', async () => {
    const { bridge, receive } = createHarness()
    receive({ event: 'init' })
    receive({ event: 'load' })

    const failed = expect(bridge.exportDiagram('pdf')).rejects.toMatchObject({ code: 'editor-error' })
    receive({ event: 'export', format: 'pdf', error: 'export server unavailable' })
    await failed
  })

  it('times out exports and rejects pending work on destroy', async () => {
    vi.useFakeTimers()
    const { bridge, receive } = createHarness({ requestTimeoutMs: 25 })
    receive({ event: 'init' })
    receive({ event: 'load' })

    const timedOut = expect(bridge.exportDiagram('svg')).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(25)
    await timedOut

    const destroyed = expect(bridge.exportDiagram('png')).rejects.toMatchObject({ code: 'destroyed' })
    bridge.destroy()
    await destroyed
  })

  it('removes the global listener when destroyed', () => {
    const onReady = vi.fn()
    const { bridge, receive } = createHarness({ onReady })

    bridge.destroy()
    receive({ event: 'init' })
    expect(onReady).not.toHaveBeenCalled()
    expect(bridge.state).toBe('destroyed')
  })
})

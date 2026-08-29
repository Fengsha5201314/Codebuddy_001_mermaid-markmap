import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrawioExportFormat } from '@/lib/drawio-bridge'
import { VisualExportDialog } from './VisualExportDialog'

const qualityMocks = vi.hoisted(() => ({ assess: vi.fn() }))

vi.mock('@/lib/reliable-diagram-delivery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/reliable-diagram-delivery')>()
  return { ...actual, assessDrawioDiagram: qualityMocks.assess }
})

const latestXml = '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="node" value="最新快照" vertex="1" parent="1"><mxGeometry width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>'
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="120" height="60"/><text x="10" y="20">最新快照</text></svg>'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test-export') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  qualityMocks.assess.mockResolvedValue({
    receiptVersion: 1,
    engine: 'drawio',
    quality: 'professional',
    ok: true,
    acceptance: 'provisional',
    generatedAt: '2026-08-30T00:00:00.000Z',
    inputSha256: 'latest-sha',
    counts: { nodes: 1, edges: 0, lanes: 0 },
    checks: [],
    diagnostics: [],
    visualReview: 'pending',
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('VisualExportDialog snapshot binding', () => {
  it('exports SVG from the exact XML snapshot captured for professional assessment', async () => {
    const onExport = vi.fn(async (format: DrawioExportFormat) => format === 'xml'
      ? { format, xml: latestXml }
      : { format, data: svg })
    const onSuccess = vi.fn()
    await act(async () => {
      root.render(
        <VisualExportDialog
          open
          onClose={() => undefined}
          onSuccess={onSuccess}
          title="快照导出"
          fallbackXml="<mxfile/>"
          onExport={onExport}
        />,
      )
      await Promise.resolve()
    })

    const svgButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.visual-export-formats button'))
      .find((button) => button.textContent?.includes('SVG 矢量图'))
    expect(svgButton).toBeDefined()
    await act(async () => {
      svgButton!.click()
      await Promise.resolve()
    })
    const download = Array.from(document.querySelectorAll<HTMLButtonElement>('.visual-export-summary button'))
      .find((button) => button.textContent?.includes('下载文件'))
    await act(async () => {
      download!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onExport).toHaveBeenNthCalledWith(1, 'xml')
    expect(onExport).toHaveBeenNthCalledWith(2, 'svg', { xml: latestXml })
    expect(qualityMocks.assess).toHaveBeenCalledWith(latestXml, 'professional', expect.stringContaining('最新快照'))
    expect(onSuccess).toHaveBeenCalledWith('快照导出.svg')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { copySvg, prepareSvgForExport } from '@/lib/export'

describe('diagram export regression', () => {
  it('keeps the rendered light-theme node colors when preparing an SVG download', async () => {
    const result = {
      svg: `<svg id="diagram-export" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 72">
        <style>#diagram-export .node rect{fill:#eaf0ff;stroke:#2864dc;color:#172033;filter:url(#soft-shadow)}</style>
        <filter id="soft-shadow"><feDropShadow dx="1" dy="1" stdDeviation="1"/></filter>
        <g class="node"><rect class="label-container" x="10" y="10" width="160" height="52"/></g>
      </svg>`,
      width: 180,
      height: 72,
      kind: 'flowchart' as const,
    }
    const writeText = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })

    await copySvg(result, 32, 'white')

    const exported = String(writeText.mock.calls[0]?.[0] ?? '')
    const parsed = new DOMParser().parseFromString(exported, 'text/html')
    const nodeShape = parsed.querySelector('.node .label-container')
    expect(exported).toContain('#eaf0ff')
    expect(nodeShape?.getAttribute('fill')).toBe('rgb(234, 240, 255)')
    expect(nodeShape?.getAttribute('filter')).toBe('url(#soft-shadow)')
    expect(exported).not.toContain(`${window.location.origin}/#soft-shadow`)
  })

  it('replaces foreignObject labels before canvas rasterization', () => {
    const result = {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40">
        <g transform="translate(10 5)"><foreignObject width="80" height="30"><div xmlns="http://www.w3.org/1999/xhtml" style="color:#172033;font-size:14px"><span class="nodeLabel">审批完成</span></div></foreignObject></g>
      </svg>`,
      width: 100,
      height: 40,
      kind: 'flowchart' as const,
    }

    const exported = prepareSvgForExport(result, 0, 'white', true)

    expect(exported).not.toContain('<foreignObject')
    expect(exported).not.toContain('http://www.w3.org/1999/xhtml')
    expect(exported).toContain('>审批完成</text>')
  })
})

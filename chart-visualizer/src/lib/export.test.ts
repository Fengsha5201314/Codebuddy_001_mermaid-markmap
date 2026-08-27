import { describe, expect, it, vi } from 'vitest'
import { copySvg, getExportDimensions, normalizeExportBackground, prepareSvgForExport, recommendedRasterScale } from '@/lib/export'

describe('diagram export regression', () => {
  it('uses a white background when exporting a transparent JPEG', () => {
    expect(normalizeExportBackground('jpeg', 'transparent')).toBe('white')
    expect(normalizeExportBackground('png', 'transparent')).toBe('transparent')
    expect(normalizeExportBackground('jpeg', '#f7f8fa')).toBe('#f7f8fa')
  })

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
    expect(exported).toContain('>审批完成</tspan>')
    expect(exported).toContain("'Microsoft YaHei'")
  })

  it('replaces foreignObject labels in the downloaded SVG itself', () => {
    const result = {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60">
        <g transform="translate(20 10)"><foreignObject width="200" height="40"><div xmlns="http://www.w3.org/1999/xhtml" style="color:#172033;font-size:14px"><span class="nodeLabel">三单匹配 PO GR Invoice</span></div></foreignObject></g>
      </svg>`,
      width: 240,
      height: 60,
      kind: 'flowchart' as const,
    }

    const exported = prepareSvgForExport(result, 0, 'white')

    expect(exported).not.toContain('<foreignObject')
    expect(exported).not.toContain('http://www.w3.org/1999/xhtml')
    expect(exported).toContain('>三单匹配 PO GR Invoice</tspan>')
    expect(exported).not.toContain('dominant-baseline="middle"')
  })

  it('keeps HTML label text un-stroked when the Mermaid node color class strokes every SVG child', () => {
    const result = {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60">
        <style>.accent &gt; * { stroke:#9333ea; stroke-width:1.5px }</style>
        <g class="node accent"><rect class="label-container" width="240" height="60"/>
          <foreignObject width="240" height="60"><div xmlns="http://www.w3.org/1999/xhtml" style="font-weight:400"><span class="nodeLabel">正常细体文字</span></div></foreignObject>
        </g>
      </svg>`,
      width: 240,
      height: 60,
      kind: 'flowchart' as const,
    }

    const exported = prepareSvgForExport(result, 0, 'white')
    const host = document.createElement('div')
    host.innerHTML = exported
    document.body.appendChild(host)
    const text = host.querySelector('.node text')

    expect(text?.getAttribute('font-weight')).toBe('400')
    expect(text?.getAttribute('stroke')).toBe('none')
    expect(text?.getAttribute('stroke-width')).toBe('0')
    host.remove()
  })

  it('preserves multiline Mermaid labels as native SVG tspans', () => {
    const result = {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 70">
        <foreignObject x="10" y="10" width="160" height="50"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel">订单审批<br/>创建采购订单</span></div></foreignObject>
      </svg>`,
      width: 180,
      height: 70,
      kind: 'flowchart' as const,
    }

    const exported = prepareSvgForExport(result, 0, 'white')
    const parsed = new DOMParser().parseFromString(exported, 'image/svg+xml')
    const lines = [...parsed.querySelectorAll('text tspan')].map((node) => node.textContent)
    const positions = [...parsed.querySelectorAll('text tspan')].map((node) => Number(node.getAttribute('y')))

    expect(lines).toEqual(['订单审批', '创建采购订单'])
    expect(positions.every(Number.isFinite)).toBe(true)
    expect(positions[1] - positions[0]).toBeGreaterThanOrEqual(18)
    expect(parsed.querySelector('text tspan[dy]')).toBeNull()
    expect(parsed.querySelector('foreignObject')).toBeNull()
  })

  it('wraps an overlong native SVG node label inside its cell during export', () => {
    const result = {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 90">
        <g class="node" transform="translate(160 45)">
          <rect class="label-container" x="-136" y="-30" width="272" height="60"/>
          <g class="label"><text x="0" y="0" font-size="16px"><tspan x="0">实线：SAP 800资料已确认的主数据关系或业务角色</tspan></text></g>
        </g>
      </svg>`,
      width: 1200,
      height: 800,
      kind: 'flowchart' as const,
    }

    const exported = prepareSvgForExport(result, 0, 'white')
    const parsed = new DOMParser().parseFromString(exported, 'image/svg+xml')
    const lines = [...parsed.querySelectorAll('.node text tspan')].map((node) => node.textContent)

    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join('')).toBe('实线：SAP 800资料已确认的主数据关系或业务角色')
  })

  it('uses the SVG viewBox rather than the preview viewport for raster dimensions', () => {
    const result = {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -20 4002 1766"></svg>',
      width: 1200,
      height: 800,
      kind: 'flowchart' as const,
    }

    expect(getExportDimensions(result, 32)).toEqual({ width: 4066, height: 1830 })
  })

  it('reads a Mermaid viewBox even when embedded CSS is not strict XML', () => {
    const result = {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -2.25 3319.45 4421.63"><style>.node{font-family:"A&B"}</style></svg>`,
      width: 1200,
      height: 800,
      kind: 'flowchart' as const,
    }

    expect(getExportDimensions(result, 32)).toEqual({ width: 3383.45, height: 4485.63 })
  })

  it('targets the proven 4800px long edge instead of blindly doubling huge diagrams', () => {
    const scale = recommendedRasterScale(3600.58, 3702)

    expect(scale).toBeCloseTo(1.29, 2)
    expect(Math.ceil(3702 * scale)).toBeGreaterThanOrEqual(4700)
    expect(Math.ceil(3702 * scale)).toBeLessThanOrEqual(4800)
  })

  it('does not blindly enlarge an extreme panorama that already exceeds the target edge', () => {
    expect(recommendedRasterScale(12_000, 500)).toBe(1)
    expect(recommendedRasterScale(500, 12_000)).toBe(1)
  })
})

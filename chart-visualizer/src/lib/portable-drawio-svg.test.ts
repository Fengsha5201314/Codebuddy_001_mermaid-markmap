import { describe, expect, it } from 'vitest'
import { makePortableDrawioSvg, resolveLightDarkStyles } from '@/lib/portable-drawio-svg'

const drawioSvg = `<svg xmlns="http://www.w3.org/2000/svg" style="background:transparent;color-scheme: light dark">
  <rect width="120" height="40" fill="#ececff" style="fill: light-dark(rgb(236, 236, 255), rgb(31, 32, 32));"/>
  <switch>
    <foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">确认收货</div></foreignObject>
    <text x="60" y="25" fill="#333333" style="fill: light-dark(rgb(51, 51, 51), rgb(204, 204, 204));">确认收货</text>
  </switch>
  <switch><g requiredFeatures="http://www.w3.org/TR/SVG11/feature#Extensibility"/><a xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="https://www.drawio.com/doc/faq/svg-export-text-problems"><text>Text is not SVG</text></a></switch>
</svg>`

describe('portable draw.io SVG', () => {
  it('keeps the light value of nested light-dark colors', () => {
    expect(resolveLightDarkStyles('fill: light-dark(rgb(1, 2, 3), rgb(4, 5, 6)); color: light-dark(#111, #eee)'))
      .toBe('fill: rgb(1, 2, 3); color: #111')
  })

  it('replaces unsupported XHTML labels with native SVG text', () => {
    const result = makePortableDrawioSvg(drawioSvg)

    expect(result).toContain('确认收货')
    expect(result).toContain('<text')
    expect(result).not.toContain('foreignObject')
    expect(result).not.toContain('light-dark(')
    expect(result).not.toContain('svg-export-text-problems')
  })

  it('accepts base64 SVG responses from the draw.io embed protocol', () => {
    const encoded = btoa(unescape(encodeURIComponent(drawioSvg)))
    expect(makePortableDrawioSvg(`data:image/svg+xml;base64,${encoded}`)).toContain('确认收货')
  })

  it('adds a real opaque white background across the complete viewBox', () => {
    const result = makePortableDrawioSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -8 640 360"><path d="M0 0L1 1"/></svg>')
    const document = new DOMParser().parseFromString(result, 'image/svg+xml')
    const background = document.querySelector('[data-fengsha-export-background="true"]')

    expect(background?.localName).toBe('rect')
    expect(background?.getAttribute('x')).toBe('-12')
    expect(background?.getAttribute('y')).toBe('-8')
    expect(background?.getAttribute('width')).toBe('640')
    expect(background?.getAttribute('height')).toBe('360')
    expect(background?.getAttribute('fill')).toBe('#ffffff')
    expect(background?.nextElementSibling?.localName).toBe('path')
  })

  it('recovers HTML-only multiline labels when draw.io provides no text fallback', () => {
    const result = makePortableDrawioSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
      <g transform="translate(10 20)">
        <foreignObject x="0" y="0" width="120" height="40">
          <div xmlns="http://www.w3.org/1999/xhtml" style="font-size:14px;color:#17406d;text-align:center">审批<br/>完成</div>
        </foreignObject>
      </g>
    </svg>`)

    expect(result).not.toContain('foreignObject')
    expect(result).toContain('审批')
    expect(result).toContain('完成')
    expect(result).toContain('<tspan')
    expect(result).toContain('fill="#17406d"')
    expect(result).toContain('font-size="14px"')
  })
})

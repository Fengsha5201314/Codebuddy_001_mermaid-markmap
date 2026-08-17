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
})

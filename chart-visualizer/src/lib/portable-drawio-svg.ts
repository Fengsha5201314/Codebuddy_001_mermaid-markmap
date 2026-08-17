const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink'

function decodeSvgData(data: string): string {
  const match = data.match(/^data:image\/svg\+xml(?:;charset=[^;,]+)?(;base64)?,(.*)$/is)
  if (!match) return data
  if (!match[1]) return decodeURIComponent(match[2])

  const binary = atob(match[2].replace(/\s+/g, ''))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Resolves CSS light-dark() to its light value for viewers that do not support it. */
export function resolveLightDarkStyles(value: string): string {
  let output = value
  let start = output.indexOf('light-dark(')
  while (start >= 0) {
    const contentStart = start + 'light-dark('.length
    let depth = 1
    let comma = -1
    let end = -1
    for (let index = contentStart; index < output.length; index += 1) {
      const character = output[index]
      if (character === '(') depth += 1
      else if (character === ')') {
        depth -= 1
        if (depth === 0) {
          end = index
          break
        }
      } else if (character === ',' && depth === 1 && comma < 0) {
        comma = index
      }
    }
    if (comma < 0 || end < 0) break
    const lightValue = output.slice(contentStart, comma).trim()
    output = `${output.slice(0, start)}${lightValue}${output.slice(end + 1)}`
    start = output.indexOf('light-dark(', start + lightValue.length)
  }
  return output
}

function removeCompatibilityWarning(svg: SVGSVGElement) {
  svg.querySelectorAll('a').forEach((anchor) => {
    const href = anchor.getAttribute('href')
      ?? anchor.getAttribute('xlink:href')
      ?? anchor.getAttributeNS(XLINK_NAMESPACE, 'href')
    if (href?.includes('svg-export-text-problems')) anchor.closest('switch')?.remove()
  })
}

/**
 * Converts draw.io's HTML-label SVG into portable SVG text.
 *
 * draw.io emits a <switch> containing an XHTML foreignObject and a native
 * <text> fallback. Some Windows viewers choose the XHTML branch but cannot
 * paint it. Keeping the native fallback only makes the file readable in those
 * viewers while preserving vector shapes, links and Chinese labels.
 */
export function makePortableDrawioSvg(data: string): string {
  const source = decodeSvgData(data).trim()
  if (!source || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('画布返回的 SVG 内容不安全或为空。')

  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  if (document.querySelector('parsererror')) throw new Error('画布返回的 SVG 格式不正确。')
  const svg = document.documentElement
  if (svg.localName.toLowerCase() !== 'svg') throw new Error('画布没有返回有效的 SVG。')

  svg.querySelectorAll('foreignObject').forEach((foreignObject) => {
    const switchElement = foreignObject.closest('switch')
    if (!switchElement) {
      foreignObject.remove()
      return
    }
    const fallbackText = Array.from(switchElement.children)
      .find((child) => child.localName.toLowerCase() === 'text')
    if (fallbackText) switchElement.replaceWith(fallbackText.cloneNode(true))
    else foreignObject.remove()
  })

  removeCompatibilityWarning(svg as unknown as SVGSVGElement)
  svg.querySelectorAll('[style]').forEach((element) => {
    const style = element.getAttribute('style')
    if (!style) return
    const portable = resolveLightDarkStyles(style)
      .replace(/(?:^|;)\s*color-scheme\s*:\s*light\s+dark\s*;?/gi, ';')
      .replace(/^;+|;{2,}/g, ';')
    if (portable === ';' || !portable.trim()) element.removeAttribute('style')
    else element.setAttribute('style', portable)
  })

  return new XMLSerializer().serializeToString(svg)
}

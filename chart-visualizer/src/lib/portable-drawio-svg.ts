const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink'
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const DEFAULT_TEXT_COLOR = '#333333'
const DEFAULT_CJK_FONT_FALLBACK = "'Microsoft YaHei', 'Noto Sans CJK SC', Arial, sans-serif"
const ACTIVE_SVG_ELEMENTS = [
  'script',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'audio',
  'video',
  'source',
  'animate',
  'animateMotion',
  'animateTransform',
  'set',
  'discard',
].join(',')
const SAFE_RASTER_DATA_URL = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i
const UNSAFE_CSS = /@import|expression\s*\(|(?:javascript|vbscript)\s*:|behavior\s*:|-moz-binding\s*:/i

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

function readCssProperty(style: string, property: string): string | undefined {
  const match = style.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'))
  return match?.[1]?.trim()
}

function extractHtmlLabelLines(root: Element): string[] {
  const lines = ['']
  const blockElements = new Set(['div', 'p', 'li', 'section', 'article', 'header', 'footer'])
  const nextLine = () => {
    if (lines[lines.length - 1].trim()) lines.push('')
  }
  const visit = (node: Node, isRoot = false) => {
    if (node.nodeType === 3) {
      lines[lines.length - 1] += node.textContent ?? ''
      return
    }
    if (!(node instanceof Element)) return
    const name = node.localName.toLowerCase()
    if (name === 'br') {
      nextLine()
      return
    }
    const block = !isRoot && blockElements.has(name)
    if (block) nextLine()
    Array.from(node.childNodes).forEach((child) => visit(child))
    if (block) nextLine()
  }
  visit(root, true)
  return lines
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function numericAttribute(element: Element, name: string): number {
  const parsed = Number.parseFloat(element.getAttribute(name) ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

function createNativeTextFallback(foreignObject: Element): SVGTextElement | undefined {
  const content = foreignObject.querySelector('[style]') ?? foreignObject.firstElementChild ?? foreignObject
  const lines = extractHtmlLabelLines(content)
  if (!lines.length) return undefined

  const style = content.getAttribute('style') ?? ''
  const fontSizeValue = readCssProperty(style, 'font-size') ?? '12px'
  const parsedFontSize = Number.parseFloat(fontSizeValue)
  const fontSize = Number.isFinite(parsedFontSize) && parsedFontSize > 0 ? parsedFontSize : 12
  const left = numericAttribute(foreignObject, 'x')
  const top = numericAttribute(foreignObject, 'y')
  const width = numericAttribute(foreignObject, 'width')
  const height = numericAttribute(foreignObject, 'height')
  const x = left + width / 2
  const lineHeight = fontSize * 1.2
  const y = top + height / 2 - ((lines.length - 1) * lineHeight) / 2
  const text = foreignObject.ownerDocument.createElementNS(SVG_NAMESPACE, 'text')
  text.setAttribute('x', String(x))
  text.setAttribute('y', String(y))
  text.setAttribute('text-anchor', 'middle')
  text.setAttribute('dominant-baseline', 'middle')
  text.setAttribute('fill', readCssProperty(style, 'color') ?? DEFAULT_TEXT_COLOR)
  text.setAttribute('font-size', fontSizeValue)
  text.setAttribute('font-family', readCssProperty(style, 'font-family') ?? DEFAULT_CJK_FONT_FALLBACK)
  text.setAttribute('stroke', 'none')
  text.setAttribute('stroke-width', '0')
  text.setAttribute('paint-order', 'normal')
  const fontWeight = readCssProperty(style, 'font-weight')
  const fontStyle = readCssProperty(style, 'font-style')
  if (fontWeight) text.setAttribute('font-weight', fontWeight)
  if (fontStyle) text.setAttribute('font-style', fontStyle)

  lines.forEach((line, index) => {
    const tspan = foreignObject.ownerDocument.createElementNS(SVG_NAMESPACE, 'tspan')
    tspan.setAttribute('x', String(x))
    if (index > 0) tspan.setAttribute('dy', '1.2em')
    tspan.textContent = line
    text.appendChild(tspan)
  })
  return text
}

function copyContainerPresentation(container: Element, target: Element) {
  for (const attribute of ['transform', 'opacity', 'visibility', 'display', 'clip-path', 'mask', 'filter']) {
    const value = container.getAttribute(attribute)
    if (value && !target.hasAttribute(attribute)) target.setAttribute(attribute, value)
  }
}

function isSafeCssValue(value: string): boolean {
  if (UNSAFE_CSS.test(value)) return false
  const urls = value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)
  return [...urls].every((match) => match[2].trim().startsWith('#'))
}

function sanitizeHref(element: Element, value: string): boolean {
  const href = value.trim()
  if (href.startsWith('#')) return true
  const name = element.localName.toLowerCase()
  if (name === 'image') return SAFE_RASTER_DATA_URL.test(href)
  if (name !== 'a') return false
  try {
    const protocol = new URL(href).protocol.toLowerCase()
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:'
  } catch {
    return false
  }
}

function sanitizeSvg(svg: Element) {
  svg.querySelectorAll(ACTIVE_SVG_ELEMENTS).forEach((element) => element.remove())
  svg.querySelectorAll('style').forEach((element) => {
    if (!isSafeCssValue(element.textContent ?? '')) element.remove()
  })
  ;[svg, ...Array.from(svg.querySelectorAll('*'))].forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.localName.toLowerCase()
      const qualifiedName = attribute.name.toLowerCase()
      if (name.startsWith('on')) {
        element.removeAttributeNode(attribute)
        continue
      }
      if (name === 'href' || qualifiedName === 'xlink:href') {
        if (!sanitizeHref(element, attribute.value)) element.removeAttributeNode(attribute)
        continue
      }
      if ((name === 'style' || attribute.value.includes('url(')) && !isSafeCssValue(attribute.value)) {
        element.removeAttributeNode(attribute)
      }
    }
  })
}

function ensurePortableTextPaint(svg: Element) {
  svg.querySelectorAll('text').forEach((text) => {
    const style = text.getAttribute('style') ?? ''
    const styleFill = readCssProperty(style, 'fill')
    const attributeFill = text.getAttribute('fill')
    const effectiveFill = styleFill ?? attributeFill
    if (!effectiveFill || /^(?:none|transparent|inherit|currentColor)$/i.test(effectiveFill)) {
      if (styleFill) {
        text.setAttribute('style', style.replace(/((?:^|;)\s*fill\s*:)\s*[^;]+/i, `$1 ${DEFAULT_TEXT_COLOR}`))
      } else {
        text.setAttribute('fill', DEFAULT_TEXT_COLOR)
      }
    }

    if (/[\u3400-\u9fff]/u.test(text.textContent ?? '')) {
      const family = text.getAttribute('font-family')
      if (!family) text.setAttribute('font-family', DEFAULT_CJK_FONT_FALLBACK)
      else if (!/(?:Microsoft YaHei|Noto Sans CJK)/i.test(family)) {
        text.setAttribute('font-family', `${family}, 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif`)
      }
    }

    // A draw.io fallback text can sit inside a group whose stroke belongs to
    // the cell border. HTML preview labels do not inherit that SVG stroke.
    const ownStroke = readCssProperty(style, 'stroke') ?? text.getAttribute('stroke')
    if (!ownStroke || /^(?:inherit|currentColor)$/i.test(ownStroke)) {
      text.setAttribute('stroke', 'none')
      text.setAttribute('stroke-width', '0')
      text.setAttribute('paint-order', 'normal')
    }
    const ownWeight = readCssProperty(style, 'font-weight') ?? text.getAttribute('font-weight')
    if (!ownWeight) text.setAttribute('font-weight', '400')
  })
}

function addOpaqueWhiteBackground(svg: SVGSVGElement) {
  const existing = svg.querySelector(':scope > [data-fengsha-export-background="true"]')
  existing?.remove()
  const background = svg.ownerDocument.createElementNS(SVG_NAMESPACE, 'rect')
  background.setAttribute('data-fengsha-export-background', 'true')
  background.setAttribute('fill', '#ffffff')
  background.setAttribute('stroke', 'none')
  background.setAttribute('pointer-events', 'none')

  const values = (svg.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
    background.setAttribute('x', String(values[0]))
    background.setAttribute('y', String(values[1]))
    background.setAttribute('width', String(values[2]))
    background.setAttribute('height', String(values[3]))
  } else {
    background.setAttribute('x', '0')
    background.setAttribute('y', '0')
    background.setAttribute('width', '100%')
    background.setAttribute('height', '100%')
  }

  const nonPainting = new Set(['defs', 'title', 'desc', 'metadata', 'style'])
  const firstPaintingNode = Array.from(svg.children)
    .find((child) => !nonPainting.has(child.localName.toLowerCase()))
  svg.insertBefore(background, firstPaintingNode ?? null)
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
    const providedFallback = switchElement
      ? Array.from(switchElement.children).find((child) => child.localName.toLowerCase() === 'text')
      : undefined
    const nativeText = providedFallback?.cloneNode(true) as Element | undefined
      ?? createNativeTextFallback(foreignObject)
    if (!nativeText) {
      if (switchElement) switchElement.remove()
      else foreignObject.remove()
      return
    }
    if (switchElement) {
      copyContainerPresentation(switchElement, nativeText)
      switchElement.replaceWith(nativeText)
    } else {
      foreignObject.replaceWith(nativeText)
    }
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
  ensurePortableTextPaint(svg)
  addOpaqueWhiteBackground(svg as unknown as SVGSVGElement)
  sanitizeSvg(svg)

  return new XMLSerializer().serializeToString(svg)
}

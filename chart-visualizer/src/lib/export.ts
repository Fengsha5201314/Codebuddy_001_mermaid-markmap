import type { ExportOptions, RenderResult } from '@/types'
import { estimateSvgTextWidth, wrapTextToPixelWidth } from '@/lib/mermaid-label-visibility'

export const MAX_RASTER_DIMENSION = 32767
export const MAX_RASTER_PIXELS = 64_000_000

function safeFileName(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').replace(/\s+/g, ' ') || 'diagram'
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** JPEG has no alpha channel; transparent pixels would otherwise render black. */
export function normalizeExportBackground(format: ExportOptions['format'], background: string): string {
  return format === 'jpeg' && background === 'transparent' ? 'white' : background
}

const SVG_PRESENTATION_PROPERTIES = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'marker-start',
  'marker-mid',
  'marker-end',
  'opacity',
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
  'stop-color',
  'stop-opacity',
  'filter',
  'paint-order',
  'shape-rendering',
] as const

const HTML_TEXT_PROPERTIES = [
  'background-color',
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'line-height',
  'text-align',
  'white-space',
] as const

function portableSvgValue(value: string): string {
  return value.replace(/url\((['"]?)(.*?)\1\)/g, (match, _quote: string, target: string) => {
    const hash = target.indexOf('#')
    if (hash < 0) return match
    const fragment = target.slice(hash + 1)
    if (!fragment) return match
    const base = target.slice(0, hash)
    if (!base) return `url(#${fragment})`
    try {
      const resolved = new URL(target, document.baseURI)
      const page = new URL(document.location.href)
      return resolved.origin === page.origin && resolved.pathname === page.pathname
        ? `url(#${fragment})`
        : match
    } catch {
      return match
    }
  })
}

/**
 * Mermaid keeps most theme colors in a scoped <style> element. Chromium can
 * display that SVG in the page but lose parts of the stylesheet when the SVG
 * is decoded as an Image for canvas export. Persist the computed presentation
 * values on every painted element before rasterising it.
 */
function inlineComputedStyles(svg: SVGSVGElement): void {
  const elements = [svg, ...svg.querySelectorAll<SVGElement | HTMLElement>('*')]
  elements.forEach((element) => {
    const computed = window.getComputedStyle(element)
    if (element.namespaceURI === 'http://www.w3.org/2000/svg') {
      SVG_PRESENTATION_PROPERTIES.forEach((property) => {
        const value = computed.getPropertyValue(property).trim()
        if (value) element.setAttribute(property, portableSvgValue(value))
      })
      return
    }
    HTML_TEXT_PROPERTIES.forEach((property) => {
      const value = computed.getPropertyValue(property).trim()
      if (value) element.style.setProperty(property, value)
    })
  })
}

function foreignObjectTextLines(foreignObject: SVGForeignObjectElement): string[] {
  const root = foreignObject.querySelector<HTMLElement>('.nodeLabel, .edgeLabel')
    ?? foreignObject.firstElementChild
    ?? foreignObject
  const lines = ['']
  const blocks = new Set(['div', 'p', 'li', 'section'])
  const nextLine = () => {
    if (lines[lines.length - 1].trim()) lines.push('')
  }
  const visit = (node: Node, isRoot = false) => {
    if (node.nodeType === Node.TEXT_NODE) {
      lines[lines.length - 1] += node.textContent ?? ''
      return
    }
    if (!(node instanceof Element)) return
    const name = node.localName.toLowerCase()
    if (name === 'br') {
      nextLine()
      return
    }
    const block = !isRoot && blocks.has(name)
    if (block) nextLine()
    node.childNodes.forEach((child) => visit(child))
    if (block) nextLine()
  }
  visit(root, true)
  return lines.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

function replaceForeignObjectsWithText(svg: SVGSVGElement): void {
  svg.querySelectorAll<SVGForeignObjectElement>('foreignObject').forEach((foreignObject) => {
    const lines = foreignObjectTextLines(foreignObject)
    if (!lines.length) {
      foreignObject.remove()
      return
    }
    const x = Number.parseFloat(foreignObject.getAttribute('x') || '0') || 0
    const y = Number.parseFloat(foreignObject.getAttribute('y') || '0') || 0
    const width = Number.parseFloat(foreignObject.getAttribute('width') || '0') || 0
    const height = Number.parseFloat(foreignObject.getAttribute('height') || '0') || 0
    const textSource = foreignObject.querySelector<HTMLElement>('.nodeLabel, .edgeLabel, span, div')
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    const centerX = x + width / 2
    const computed = textSource ? window.getComputedStyle(textSource) : null
    const parsedFontSize = Number.parseFloat(computed?.fontSize || '')
    const fontSize = Number.isFinite(parsedFontSize) && parsedFontSize > 0 ? parsedFontSize : 14
    const wrappedLines = lines
    const parsedLineHeight = Number.parseFloat(computed?.lineHeight || '')
    const lineHeight = Number.isFinite(parsedLineHeight) && parsedLineHeight > 0
      ? parsedLineHeight
      : Math.max(fontSize * 1.35, height / Math.max(1, wrappedLines.length))
    const firstLineY = y + height / 2 - ((wrappedLines.length - 1) * lineHeight) / 2
    text.setAttribute('x', String(centerX))
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('xml:space', 'preserve')
    // Mermaid color classes often stroke every direct SVG child. The preview
    // label is HTML and does not inherit that stroke, but this native SVG text
    // does unless we explicitly neutralize it. That made exports look bold.
    text.setAttribute('stroke', 'none')
    text.setAttribute('stroke-width', '0')
    text.setAttribute('paint-order', 'normal')
    if (computed) {
      const color = computed.color.trim()
      text.setAttribute('fill', color && !/^(?:none|transparent|rgba\(0, 0, 0, 0\))$/i.test(color) ? color : '#172033')
      for (const property of ['font-family', 'font-size', 'font-style', 'font-weight'] as const) {
        const value = computed.getPropertyValue(property).trim()
        if (value) text.setAttribute(property, value)
      }
    } else {
      text.setAttribute('fill', '#172033')
      text.setAttribute('font-size', `${fontSize}px`)
    }
    const content = wrappedLines.join('')
    if (/[\u3400-\u9fff]/u.test(content)) {
      const family = text.getAttribute('font-family')
      const cjkFallback = "'Microsoft YaHei', 'Noto Sans CJK SC', Arial, sans-serif"
      text.setAttribute('font-family', family ? `${family}, ${cjkFallback}` : cjkFallback)
    }
    wrappedLines.forEach((line, index) => {
      const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
      tspan.setAttribute('x', String(centerX))
      tspan.setAttribute('y', String(firstLineY + index * lineHeight + fontSize * 0.35))
      tspan.textContent = line
      text.appendChild(tspan)
    })
    foreignObject.replaceWith(text)
  })
}

function numericAttribute(element: Element | null, name: string): number {
  const value = Number.parseFloat(element?.getAttribute(name) ?? '')
  return Number.isFinite(value) ? value : 0
}

function nodeShapeSize(node: Element): { width: number; height: number } | null {
  const rect = node.querySelector('.label-container[width], rect.label-container[width]')
  const rectWidth = numericAttribute(rect, 'width')
  const rectHeight = numericAttribute(rect, 'height')
  if (rectWidth > 0 && rectHeight > 0) return { width: rectWidth, height: rectHeight }

  const ellipse = node.querySelector('ellipse.label-container, ellipse')
  const radiusX = numericAttribute(ellipse, 'rx')
  const radiusY = numericAttribute(ellipse, 'ry')
  if (radiusX > 0 && radiusY > 0) return { width: radiusX * 2, height: radiusY * 2 }

  const polygon = node.querySelector('polygon.label-container, polygon')
  const points = polygon?.getAttribute('points')?.trim().split(/\s+/).map((point) => point.split(',').map(Number))
    .filter((point) => point.length === 2 && point.every(Number.isFinite))
  if (points?.length) {
    const xs = points.map(([x]) => x)
    const ys = points.map(([, y]) => y)
    return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
  }
  return null
}

/**
 * Native Mermaid SVG labels can still exceed their shapes when a viewer does
 * not reproduce Mermaid's browser-only text layout. Rewrap those labels as
 * explicit tspans so the downloaded SVG remains readable everywhere.
 */
function wrapNativeNodeText(svg: SVGSVGElement): void {
  svg.querySelectorAll('.node').forEach((node) => {
    const shape = nodeShapeSize(node)
    const text = node.querySelector<SVGTextElement>('text')
    if (!shape || !text) return

    const parsedFontSize = Number.parseFloat(text.getAttribute('font-size') ?? node.getAttribute('font-size') ?? '')
    const originalFontSize = Number.isFinite(parsedFontSize) && parsedFontSize > 0 ? parsedFontSize : 16
    const originalTspans = [...text.querySelectorAll<SVGTSpanElement>('tspan')]
    const originalLines = originalTspans.length
      ? originalTspans.map((tspan) => tspan.textContent ?? '')
      : [text.textContent ?? '']
    const maximumWidth = Math.max(24, shape.width - 24)
    if (!originalLines.some((line) => estimateSvgTextWidth(line, originalFontSize) > maximumWidth)) return

    const lines = originalLines.flatMap((line) => wrapTextToPixelWidth(line, originalFontSize, maximumWidth))
    if (lines.length <= originalLines.length) return
    const maximumFontSize = (shape.height - 8) / Math.max(1, lines.length * 1.15)
    const fontSize = Math.max(10, Math.min(originalFontSize, maximumFontSize))
    const lineHeight = fontSize * 1.15
    const centerY = numericAttribute(text, 'y') || numericAttribute(originalTspans[0] ?? null, 'y')
    const firstLineY = centerY - ((lines.length - 1) * lineHeight) / 2
    const centerX = text.getAttribute('x') ?? originalTspans[0]?.getAttribute('x') ?? '0'
    const template = originalTspans[0]

    text.replaceChildren()
    text.removeAttribute('y')
    text.removeAttribute('dominant-baseline')
    if (fontSize < originalFontSize) text.setAttribute('font-size', `${fontSize}px`)
    lines.forEach((line, index) => {
      const tspan = template
        ? template.cloneNode(false) as SVGTSpanElement
        : document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
      tspan.setAttribute('x', centerX)
      tspan.setAttribute('y', String(firstLineY + index * lineHeight + fontSize * 0.35))
      tspan.removeAttribute('dy')
      tspan.removeAttribute('dominant-baseline')
      tspan.textContent = line
      text.appendChild(tspan)
    })
  })
}

export function getExportDimensions(result: RenderResult, padding: number): { width: number; height: number } {
  // Mermaid SVG contains XHTML/CSS that is valid in the browser but can make
  // strict XML DOMParser return <parsererror>. Read the root viewBox directly
  // so a complex diagram never falls back to the preview viewport dimensions.
  const rootTag = result.svg.match(/<svg\b[^>]*>/i)?.[0] ?? ''
  const rawViewBox = rootTag.match(/\bviewBox\s*=\s*(["'])(.*?)\1/i)?.[2]
  const viewBox = rawViewBox?.trim().split(/[ ,]+/).map(Number)
  const sourceWidth = viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0
    ? viewBox[2]
    : result.width
  const sourceHeight = viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[3] > 0
    ? viewBox[3]
    : result.height
  return {
    width: Math.max(1, sourceWidth + padding * 2),
    height: Math.max(1, sourceHeight + padding * 2),
  }
}

export function rasterDimensionsSupported(width: number, height: number, scale: number): boolean {
  const outputWidth = Math.ceil(width * scale)
  const outputHeight = Math.ceil(height * scale)
  return outputWidth <= MAX_RASTER_DIMENSION
    && outputHeight <= MAX_RASTER_DIMENSION
    && outputWidth * outputHeight <= MAX_RASTER_PIXELS
}

export function recommendedRasterScale(width: number, height: number, targetLongEdge = 4800): number {
  const longest = Math.max(1, width, height)
  let scale = Math.min(16, Math.max(1, targetLongEdge / longest))
  while (scale > 1 && !rasterDimensionsSupported(width, height, scale)) scale -= 0.05
  return Math.max(1, Math.floor(scale * 100) / 100)
}

export function getSvgMarkupDimensions(svgMarkup: string): { width: number; height: number } {
  const rootTag = svgMarkup.match(/<svg\b[^>]*>/i)?.[0] ?? ''
  const rawViewBox = rootTag.match(/\bviewBox\s*=\s*(["'])(.*?)\1/i)?.[2]
  const viewBox = rawViewBox?.trim().split(/[ ,]+/).map(Number)
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    return { width: viewBox[2], height: viewBox[3] }
  }
  const readLength = (name: string) => Number.parseFloat(rootTag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] ?? '')
  const width = readLength('width')
  const height = readLength('height')
  if (width > 0 && height > 0) return { width, height }
  throw new Error('SVG 缺少有效的画布尺寸，无法生成高清图片。')
}

export async function rasterizeSvgMarkup(
  svgMarkup: string,
  targetLongEdge = 4800,
): Promise<{ blob: Blob; width: number; height: number; scale: number }> {
  const source = getSvgMarkupDimensions(svgMarkup)
  const scale = recommendedRasterScale(source.width, source.height, targetLongEdge)
  const blob = await renderPreparedSvgToRaster(svgMarkup, source.width, source.height, scale, 'png')
  return {
    blob,
    width: Math.ceil(source.width * scale),
    height: Math.ceil(source.height * scale),
    scale,
  }
}

export function prepareSvgForExport(
  result: RenderResult,
  padding: number,
  background: string,
  rasterSafe = false,
): string {
  const staging = document.createElement('div')
  staging.setAttribute('aria-hidden', 'true')
  staging.style.cssText = 'position:fixed;left:-100000px;top:-100000px;visibility:hidden;pointer-events:none;contain:strict;'
  staging.innerHTML = result.svg
  document.body.appendChild(staging)

  try {
    const svg = staging.querySelector('svg')
    if (!(svg instanceof SVGSVGElement)) throw new Error('当前预览不是有效的 SVG，无法导出。')
    const styleMirrors = [...svg.querySelectorAll('style')].map((source) => {
      const mirror = document.createElement('style')
      mirror.textContent = source.textContent
      document.head.appendChild(mirror)
      return mirror
    })
    try {
      inlineComputedStyles(svg)
      // SVG downloads must be as portable as raster exports. Many Windows,
      // Office and document viewers ignore Mermaid's XHTML foreignObject text.
      if (rasterSafe || svg.querySelector('foreignObject')) replaceForeignObjectsWithText(svg)
      wrapNativeNodeText(svg)
    } finally {
      styleMirrors.forEach((style) => style.remove())
    }

    const originalViewBox = svg.getAttribute('viewBox')?.split(/[ ,]+/).map(Number)
    const x = originalViewBox?.[0] ?? 0
    const y = originalViewBox?.[1] ?? 0
    const width = originalViewBox?.[2] ?? result.width
    const height = originalViewBox?.[3] ?? result.height

    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    svg.setAttribute('viewBox', `${x - padding} ${y - padding} ${width + padding * 2} ${height + padding * 2}`)
    svg.setAttribute('width', String(width + padding * 2))
    svg.setAttribute('height', String(height + padding * 2))

    if (background !== 'transparent') {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      rect.setAttribute('x', String(x - padding))
      rect.setAttribute('y', String(y - padding))
      rect.setAttribute('width', String(width + padding * 2))
      rect.setAttribute('height', String(height + padding * 2))
      rect.setAttribute('fill', background)
      svg.insertBefore(rect, svg.firstChild)
    }

    return new XMLSerializer().serializeToString(svg)
  } finally {
    staging.remove()
  }
}

export async function renderPreparedSvgToRaster(
  svg: string,
  width: number,
  height: number,
  scale: number,
  format: 'png' | 'jpeg',
): Promise<Blob> {
  // Validate before decoding and, crucially, before assigning canvas width and
  // height: browsers may allocate the backing buffer immediately.
  if (!rasterDimensionsSupported(width, height, scale)) {
    throw new Error('图片尺寸超过浏览器限制，请降低清晰度或留白后重试。')
  }
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  try {
    await image.decode()

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(width * scale))
    canvas.height = Math.max(1, Math.ceil(height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器无法创建图片画布。')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (output) => (output ? resolve(output) : reject(new Error('图片生成失败。'))),
        `image/${format}`,
        format === 'jpeg' ? 0.94 : undefined,
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function exportDiagram(
  result: RenderResult,
  code: string,
  options: ExportOptions,
): Promise<void> {
  const base = safeFileName(options.fileName)
  if (options.format === 'mmd') {
    downloadBlob(new Blob([code], { type: 'text/plain;charset=utf-8' }), `${base}.mmd`)
    return
  }
  if (options.format === 'markdown') {
    const markdown = `\`\`\`mermaid\n${code.trim()}\n\`\`\`\n`
    downloadBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), `${base}.md`)
    return
  }

  const rasterFormat = options.format === 'png' || options.format === 'jpeg'
  const background = normalizeExportBackground(options.format, options.background)
  const svg = prepareSvgForExport(result, options.padding, background, rasterFormat)
  const { width, height } = getExportDimensions(result, options.padding)

  if (options.format === 'svg') {
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${base}.svg`)
    return
  }

  const raster = await renderPreparedSvgToRaster(svg, width, height, options.scale, options.format)
  downloadBlob(raster, `${base}.${options.format === 'jpeg' ? 'jpg' : 'png'}`)
}

export async function copySvg(result: RenderResult, padding = 24, background = 'transparent'): Promise<void> {
  await navigator.clipboard.writeText(prepareSvgForExport(result, padding, background))
}

export async function copyMarkdown(code: string): Promise<void> {
  await navigator.clipboard.writeText(`\`\`\`mermaid\n${code.trim()}\n\`\`\``)
}

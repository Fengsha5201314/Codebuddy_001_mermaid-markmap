import type { ExportOptions, RenderResult } from '@/types'

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

function replaceForeignObjectsWithText(svg: SVGSVGElement): void {
  svg.querySelectorAll('foreignObject').forEach((foreignObject) => {
    const content = foreignObject.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (!content) {
      foreignObject.remove()
      return
    }
    const x = Number.parseFloat(foreignObject.getAttribute('x') || '0') || 0
    const y = Number.parseFloat(foreignObject.getAttribute('y') || '0') || 0
    const width = Number.parseFloat(foreignObject.getAttribute('width') || '0') || 0
    const height = Number.parseFloat(foreignObject.getAttribute('height') || '0') || 0
    const textSource = foreignObject.querySelector<HTMLElement>('.nodeLabel, .edgeLabel, span, div')
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.textContent = content
    text.setAttribute('x', String(x + width / 2))
    text.setAttribute('y', String(y + height / 2))
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('dominant-baseline', 'central')
    if (textSource) {
      const computed = window.getComputedStyle(textSource)
      const color = computed.color.trim()
      if (color) text.setAttribute('fill', color)
      for (const property of ['font-family', 'font-size', 'font-style', 'font-weight'] as const) {
        const value = computed.getPropertyValue(property).trim()
        if (value) text.setAttribute(property, value)
      }
    }
    foreignObject.replaceWith(text)
  })
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
      if (rasterSafe) replaceForeignObjectsWithText(svg)
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

async function svgToRaster(
  svg: string,
  width: number,
  height: number,
  scale: number,
  format: 'png' | 'jpeg',
): Promise<Blob> {
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
    if (canvas.width > 32767 || canvas.height > 32767 || canvas.width * canvas.height > 100_000_000) {
      throw new Error('图片尺寸超过浏览器限制，请降低清晰度或留白后重试。')
    }
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
  const width = result.width + options.padding * 2
  const height = result.height + options.padding * 2

  if (options.format === 'svg') {
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${base}.svg`)
    return
  }

  const raster = await svgToRaster(svg, width, height, options.scale, options.format)
  downloadBlob(raster, `${base}.${options.format === 'jpeg' ? 'jpg' : 'png'}`)
}

export async function copySvg(result: RenderResult, padding = 24, background = 'transparent'): Promise<void> {
  await navigator.clipboard.writeText(prepareSvgForExport(result, padding, background))
}

export async function copyMarkdown(code: string): Promise<void> {
  await navigator.clipboard.writeText(`\`\`\`mermaid\n${code.trim()}\n\`\`\``)
}

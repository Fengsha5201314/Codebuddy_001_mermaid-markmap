import { jsPDF } from 'jspdf'
import { createDrawioBridge, type DrawioBridge } from '@/lib/drawio-bridge'
import { resolveDrawioRuntime } from '@/lib/drawio-runtime'
import {
  getSvgMarkupDimensions,
  rasterDimensionsSupported,
  recommendedRasterScale,
  renderPreparedSvgToRaster,
} from '@/lib/export'
import { makePortableDrawioSvg } from '@/lib/portable-drawio-svg'
import type { CliRenderFormat, CliRenderOptions } from '@/cli-contracts'

export interface DrawioCliArtifact {
  data: string | Blob
  canonicalSvg: string
  mimeType: string
  extension: string
  width: number
  height: number
  outputWidth: number
  outputHeight: number
  scale: number
}

const DRAWIO_LOAD_TIMEOUT_MS = 30_000

function formatDetails(format: CliRenderFormat) {
  if (format === 'svg') return { mimeType: 'image/svg+xml', extension: 'svg' }
  if (format === 'png') return { mimeType: 'image/png', extension: 'png' }
  if (format === 'jpeg') return { mimeType: 'image/jpeg', extension: 'jpg' }
  return { mimeType: 'application/pdf', extension: 'pdf' }
}

function applyBackground(svgMarkup: string, background: string): string {
  const parsed = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml')
  const svg = parsed.documentElement
  if (parsed.querySelector('parsererror') || svg.localName.toLowerCase() !== 'svg') {
    throw new Error('draw.io 没有返回可解析的 SVG。')
  }
  const backgroundNode = svg.querySelector(':scope > [data-fengsha-export-background="true"]')
  if (background === 'transparent') {
    backgroundNode?.remove()
  } else if (backgroundNode) {
    backgroundNode.setAttribute('fill', background)
  }
  return new XMLSerializer().serializeToString(svg)
}

async function exportBoundDrawioSvg(xml: string, options: CliRenderOptions): Promise<string> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;left:-100000px;top:0;width:1280px;height:800px;visibility:hidden;pointer-events:none;'
  document.body.appendChild(iframe)
  let bridge: DrawioBridge | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const runtime = resolveDrawioRuntime('local', window.location.href)
    const rawSvg = await new Promise<string>((resolve, reject) => {
      let settled = false
      const finish = (callback: () => void) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        callback()
      }
      timer = setTimeout(() => finish(() => reject(new Error('本地 draw.io 引擎加载超时。'))), DRAWIO_LOAD_TIMEOUT_MS)
      bridge = createDrawioBridge({
        iframe,
        source: { type: 'xml', xml },
        editorUrl: runtime.editorUrl,
        urlParams: { ui: 'kennedy', noSaveBtn: 1, noExitBtn: 1, saveAndExit: 0, dark: 0 },
        load: { autosave: false, exportProtocol: true, fit: true, title: 'Fengsha CLI' },
        requestTimeoutMs: DRAWIO_LOAD_TIMEOUT_MS,
        onLoad: () => {
          void bridge?.exportDiagram('svg', {
            xml,
            border: options.padding,
            transparent: options.background === 'transparent',
            background: options.background === 'transparent' ? undefined : options.background,
            currentPage: true,
            includeData: false,
          }).then((result) => {
            const value = typeof result.data === 'string' ? result.data : result.xml ?? ''
            if (!value) throw new Error('draw.io 没有返回 SVG 内容。')
            finish(() => resolve(value))
          }).catch((error) => finish(() => reject(error)))
        },
        onError: (error) => finish(() => reject(error)),
      })
    })
    return applyBackground(makePortableDrawioSvg(rawSvg), options.background)
  } finally {
    if (timer) clearTimeout(timer)
    ;(bridge as DrawioBridge | null)?.destroy()
    iframe.remove()
  }
}

async function pngToPdf(png: Blob, width: number, height: number): Promise<Blob> {
  const dataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('无法读取 PNG 数据。'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(png)
  })
  const maximumPageSize = 14_000
  const pageScale = Math.min(1, maximumPageSize / width, maximumPageSize / height)
  const pageWidth = Math.max(1, width * pageScale)
  const pageHeight = Math.max(1, height * pageScale)
  const pdf = new jsPDF({
    orientation: pageWidth >= pageHeight ? 'landscape' : 'portrait',
    unit: 'px',
    format: [pageWidth, pageHeight],
    compress: true,
    hotfixes: ['px_scaling'],
  })
  pdf.setProperties({ title: 'Fengsha draw.io CLI Export' })
  pdf.addImage(dataUri, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST')
  return pdf.output('blob')
}

/** Renders a draw.io source through the bundled local engine and binds SVG export to the exact XML snapshot. */
export async function generateDrawioCliArtifact(xml: string, options: CliRenderOptions): Promise<DrawioCliArtifact> {
  if (options.background !== 'transparent' && !CSS.supports('color', options.background)) {
    throw new Error('--background 必须是 transparent 或有效的 CSS 颜色。')
  }
  const canonicalSvg = await exportBoundDrawioSvg(xml, options)
  const dimensions = getSvgMarkupDimensions(canonicalSvg)
  const scale = options.scale === 'auto'
    ? recommendedRasterScale(dimensions.width, dimensions.height)
    : options.scale
  const rasterFormat = options.format === 'png' || options.format === 'jpeg' || options.format === 'pdf'
  if (rasterFormat && !rasterDimensionsSupported(dimensions.width, dimensions.height, scale)) {
    throw new Error('图片尺寸超过安全上限，请降低 --scale 或 --padding。')
  }
  const details = formatDetails(options.format)
  if (options.format === 'svg') {
    return {
      data: canonicalSvg,
      canonicalSvg,
      ...details,
      ...dimensions,
      outputWidth: Math.ceil(dimensions.width),
      outputHeight: Math.ceil(dimensions.height),
      scale: 1,
    }
  }
  const raster = await renderPreparedSvgToRaster(
    canonicalSvg,
    dimensions.width,
    dimensions.height,
    scale,
    options.format === 'jpeg' ? 'jpeg' : 'png',
  )
  const outputWidth = Math.ceil(dimensions.width * scale)
  const outputHeight = Math.ceil(dimensions.height * scale)
  const data = options.format === 'pdf' ? await pngToPdf(raster, outputWidth, outputHeight) : raster
  return {
    data,
    canonicalSvg,
    ...details,
    ...dimensions,
    outputWidth,
    outputHeight,
    scale,
  }
}

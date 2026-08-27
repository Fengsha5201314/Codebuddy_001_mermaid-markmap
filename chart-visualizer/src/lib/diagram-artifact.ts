import { jsPDF } from 'jspdf'
import { getDiagramTheme } from '@/data/themes'
import { renderDiagram } from '@/lib/diagram-engine'
import {
  getExportDimensions,
  normalizeExportBackground,
  prepareSvgForExport,
  rasterDimensionsSupported,
  recommendedRasterScale,
  renderPreparedSvgToRaster,
} from '@/lib/export'
import type { CliRenderFormat, CliRenderOptions } from '@/cli-contracts'
import type { RenderResult } from '@/types'

export interface GeneratedDiagramArtifact {
  data: string | Blob
  mimeType: string
  extension: string
  result: RenderResult
  outputWidth: number
  outputHeight: number
  scale: number
}

function formatDetails(format: CliRenderFormat) {
  if (format === 'svg') return { mimeType: 'image/svg+xml', extension: 'svg' }
  if (format === 'png') return { mimeType: 'image/png', extension: 'png' }
  if (format === 'jpeg') return { mimeType: 'image/jpeg', extension: 'jpg' }
  return { mimeType: 'application/pdf', extension: 'pdf' }
}

async function pngBlobToPdf(png: Blob, width: number, height: number): Promise<Blob> {
  const pngData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('无法读取生成的 PNG 数据。'))
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
  pdf.setProperties({ title: 'Fengsha Diagram CLI Export' })
  pdf.addImage(pngData, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST')
  return pdf.output('blob')
}

/**
 * Shared Mermaid delivery module used by non-interactive callers. It hides
 * browser rendering, label repair, portable SVG conversion and raster/PDF
 * generation behind one deterministic interface.
 */
export async function generateDiagramArtifact(source: string, options: CliRenderOptions): Promise<GeneratedDiagramArtifact> {
  if (options.background !== 'transparent' && !CSS.supports('color', options.background)) {
    throw new Error('--background 必须是 transparent 或有效的 CSS 颜色。')
  }
  const result = await renderDiagram(source, getDiagramTheme(options.theme))
  const rasterFormat = options.format === 'png' || options.format === 'jpeg' || options.format === 'pdf'
  const background = normalizeExportBackground(options.format === 'pdf' ? 'png' : options.format, options.background)
  const svg = prepareSvgForExport(result, options.padding, background, rasterFormat)
  const dimensions = getExportDimensions(result, options.padding)
  const scale = options.scale === 'auto'
    ? recommendedRasterScale(dimensions.width, dimensions.height)
    : options.scale
  if (rasterFormat && !rasterDimensionsSupported(dimensions.width, dimensions.height, scale)) {
    throw new Error('图片尺寸超过安全上限，请降低 --scale 或 --padding。')
  }

  const details = formatDetails(options.format)
  if (options.format === 'svg') {
    return {
      data: svg,
      ...details,
      result,
      outputWidth: Math.ceil(dimensions.width),
      outputHeight: Math.ceil(dimensions.height),
      scale: 1,
    }
  }

  const raster = await renderPreparedSvgToRaster(
    svg,
    dimensions.width,
    dimensions.height,
    scale,
    options.format === 'jpeg' ? 'jpeg' : 'png',
  )
  const outputWidth = Math.ceil(dimensions.width * scale)
  const outputHeight = Math.ceil(dimensions.height * scale)
  const data = options.format === 'pdf'
    ? await pngBlobToPdf(raster, outputWidth, outputHeight)
    : raster

  return { data, ...details, result, outputWidth, outputHeight, scale }
}

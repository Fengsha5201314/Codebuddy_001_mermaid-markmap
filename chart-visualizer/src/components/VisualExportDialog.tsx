import { useEffect, useState } from 'react'
import { Check, Download, FileImage, FileType2, LoaderCircle, Network } from 'lucide-react'
import type { DrawioExportFormat, DrawioExportOptions, DrawioExportResult } from '@/lib/drawio-bridge'
import { makePortableDrawioSvg } from '@/lib/portable-drawio-svg'
import { rasterizeSvgMarkup } from '@/lib/export'
import { assessDrawioDiagram, qualityFailureMessage, type DiagramQualityProfile, type DiagramQualityReceipt } from '@/lib/reliable-diagram-delivery'
import { Modal } from './Modal'
import { QualityReceiptSummary } from './QualityReceiptSummary'

type VisualDeliveryFormat = 'xml' | 'svg' | 'png' | 'pdf'

interface VisualExportDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: (fileName: string) => void
  title: string
  fallbackXml: string
  onExport: (format: DrawioExportFormat, options?: DrawioExportOptions) => Promise<DrawioExportResult>
}

const formats: Array<{
  id: VisualDeliveryFormat
  name: string
  description: string
  icon: typeof Network
}> = [
  { id: 'xml', name: 'draw.io 源文件', description: '可再次编辑，推荐长期保存', icon: Network },
  { id: 'svg', name: 'SVG 矢量图', description: '适合文档与高清印刷', icon: FileType2 },
  { id: 'png', name: 'PNG 图片', description: '兼容办公软件与聊天工具', icon: FileImage },
  { id: 'pdf', name: 'PDF 文档', description: '适合审阅、归档和交付', icon: FileType2 },
]

function safeName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ') || '可视化图表'
}

const MAX_DOWNLOAD_DATA_URI_LENGTH = 80_000_000

function isExpectedDataUri(data: string, mime: string): boolean {
  const escapedMime = mime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const prefix = data.match(new RegExp(`^data:${escapedMime};base64,`, 'i'))?.[0]
  if (!prefix || data.length > MAX_DOWNLOAD_DATA_URI_LENGTH) return false
  const payload = data.slice(prefix.length)
  return payload.length > 0 && payload.length % 4 === 0 && /^[a-z0-9+/]+={0,2}$/i.test(payload)
}

async function blobToDataUri(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('无法读取图片数据。'))
    reader.onerror = () => reject(reader.error ?? new Error('无法读取图片数据。'))
    reader.readAsDataURL(blob)
  })
}

async function createPdfFromPng(data: string | Blob, title: string): Promise<Blob> {
  const pngData = data instanceof Blob ? await blobToDataUri(data) : data
  if (!isExpectedDataUri(pngData, 'image/png')) {
    throw new Error('画布没有返回可用于 PDF 的有效 PNG 数据。')
  }
  const { jsPDF } = await import('jspdf')
  const probe = new jsPDF()
  const image = probe.getImageProperties(pngData)
  if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width <= 0 || image.height <= 0) {
    throw new Error('无法读取画布图片尺寸，PDF 未生成。')
  }
  const maximumPageSize = 14_000
  const scale = Math.min(1, maximumPageSize / image.width, maximumPageSize / image.height)
  const width = Math.max(1, image.width * scale)
  const height = Math.max(1, image.height * scale)
  const pdf = new jsPDF({
    orientation: width >= height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [width, height],
    compress: true,
    hotfixes: ['px_scaling'],
  })
  pdf.setProperties({ title: /^[\x20-\x7e]{1,200}$/.test(title) ? title : 'Fengsha Diagram Export' })
  pdf.addImage(pngData, 'PNG', 0, 0, width, height, undefined, 'FAST')
  return pdf.output('blob')
}

function triggerDownload(data: string | Blob, fileName: string, mime: string) {
  const anchor = document.createElement('a')
  if (typeof data === 'string' && /^data:/i.test(data)) {
    if (!isExpectedDataUri(data, mime)) {
      throw new Error('画布返回的下载数据类型与所选格式不一致。')
    }
    anchor.href = data
  } else {
    anchor.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: mime }))
  }
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  if (anchor.href.startsWith('blob:')) window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000)
}

export function VisualExportDialog({ open, onClose, onSuccess, title, fallbackXml, onExport }: VisualExportDialogProps) {
  const [format, setFormat] = useState<VisualDeliveryFormat>('xml')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quality, setQuality] = useState<DiagramQualityProfile>('professional')
  const [qualityReceipt, setQualityReceipt] = useState<DiagramQualityReceipt | null>(null)

  useEffect(() => {
    if (!open) {
      setExporting(false)
      setError(null)
      setQualityReceipt(null)
    }
  }, [open])

  const download = async () => {
    setExporting(true)
    setError(null)
    let qualityRejected = false
    try {
      // Use one normalized SVG as the canonical source for SVG, PNG and PDF.
      // This keeps text weight, line breaks, colors and compatibility identical.
      const xmlResult = await onExport('xml')
      const latestXml = xmlResult.xml || (typeof xmlResult.data === 'string' ? xmlResult.data : '') || fallbackXml
      const requestFormat: DrawioExportFormat = format === 'xml' ? 'xml' : 'svg'
      // Export the delivery SVG from the exact XML snapshot that is assessed.
      // This prevents an autosave/user edit race from pairing XML A with SVG B.
      const result = format === 'xml' ? xmlResult : await onExport(requestFormat, { xml: latestXml })
      const extensions: Record<VisualDeliveryFormat, string> = { xml: 'drawio', svg: 'svg', png: 'png', pdf: 'pdf' }
      const mimes: Record<VisualDeliveryFormat, string> = {
        xml: 'application/vnd.jgraph.mxfile',
        svg: 'image/svg+xml',
        png: 'image/png',
        pdf: 'application/pdf',
      }
      const raw = format === 'xml'
        ? latestXml
        : typeof result.data === 'string'
          ? result.data
          : result.xml
      if (!raw) throw new Error('画布没有返回可下载内容，请稍后重试。')
      const portableSvg = format === 'xml' ? '' : makePortableDrawioSvg(raw)
      const receipt = await assessDrawioDiagram(latestXml, quality, format === 'xml' ? latestXml : portableSvg)
      setQualityReceipt(receipt)
      if (!receipt.ok) {
        qualityRejected = true
        throw new Error(qualityFailureMessage(receipt))
      }
      const raster = format === 'png' || format === 'pdf'
        ? await rasterizeSvgMarkup(portableSvg)
        : null
      const downloadData = format === 'svg'
        ? portableSvg
        : format === 'png'
          ? raster!.blob
          : format === 'pdf'
            ? await createPdfFromPng(raster!.blob, title)
            : raw
      const fileName = `${safeName(title)}.${extensions[format]}`
      triggerDownload(downloadData, fileName, mimes[format])
      onClose()
      onSuccess(fileName)
    } catch (downloadError) {
      if (!qualityRejected && format === 'xml' && fallbackXml.trim()) {
        const fileName = `${safeName(title)}.drawio`
        triggerDownload(fallbackXml, fileName, 'application/vnd.jgraph.mxfile')
        onClose()
        onSuccess(fileName)
      } else {
        setError(downloadError instanceof Error ? downloadError.message : '导出失败，请稍后重试。')
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="导出可视化画布" description="源文件用于继续编辑，图片与 PDF 用于交付。" size="medium">
      <div className="visual-export-layout">
        <div className="visual-export-formats" role="radiogroup" aria-label="导出格式">
          {formats.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} className={format === item.id ? 'active' : ''} onClick={() => setFormat(item.id)} role="radio" aria-checked={format === item.id}>
                <span><Icon size={18} /></span>
                <span><strong>{item.name}</strong><small>{item.description}</small></span>
                {format === item.id && <Check size={15} />}
              </button>
            )
          })}
        </div>
        <div className="visual-export-summary">
          <Network size={24} />
          <strong>{title}</strong>
          <p>{format === 'xml' ? '保留图形、连接线、样式和页面结构，可在本工具或 diagrams.net 中继续编辑。' : '导出前会读取画布中的最新内容，确保修改已包含在交付文件中。'}</p>
          <label className="visual-export-quality"><span>验收档位</span><select value={quality} onChange={(event) => setQuality(event.target.value as DiagramQualityProfile)}><option value="professional">专业 · 问题阻止导出</option><option value="standard">标准 · 不确定项提示</option></select></label>
          <button onClick={download} disabled={exporting}>
            {exporting ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}
            {exporting ? '正在生成…' : '下载文件'}
          </button>
          <QualityReceiptSummary receipt={qualityReceipt} />
          {error && <small className="visual-export-error">{error}</small>}
        </div>
      </div>
    </Modal>
  )
}

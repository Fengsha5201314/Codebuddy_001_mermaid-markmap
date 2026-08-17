import { useEffect, useState } from 'react'
import { Check, Download, FileImage, FileType2, LoaderCircle, Network } from 'lucide-react'
import type { DrawioExportFormat, DrawioExportResult } from '@/lib/drawio-bridge'
import { makePortableDrawioSvg } from '@/lib/portable-drawio-svg'
import { Modal } from './Modal'

type VisualDeliveryFormat = 'xml' | 'svg' | 'png' | 'pdf'

interface VisualExportDialogProps {
  open: boolean
  onClose: () => void
  title: string
  fallbackXml: string
  onExport: (format: DrawioExportFormat) => Promise<DrawioExportResult>
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

function triggerDownload(data: string, fileName: string, mime: string) {
  const anchor = document.createElement('a')
  if (/^data:/i.test(data)) {
    anchor.href = data
  } else {
    anchor.href = URL.createObjectURL(new Blob([data], { type: mime }))
  }
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  if (anchor.href.startsWith('blob:')) window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000)
}

export function VisualExportDialog({ open, onClose, title, fallbackXml, onExport }: VisualExportDialogProps) {
  const [format, setFormat] = useState<VisualDeliveryFormat>('xml')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setExporting(false)
      setError(null)
    }
  }, [open])

  const download = async () => {
    setExporting(true)
    setError(null)
    try {
      const result = await onExport(format)
      const extensions: Record<VisualDeliveryFormat, string> = { xml: 'drawio', svg: 'svg', png: 'png', pdf: 'pdf' }
      const mimes: Record<VisualDeliveryFormat, string> = {
        xml: 'application/vnd.jgraph.mxfile',
        svg: 'image/svg+xml',
        png: 'image/png',
        pdf: 'application/pdf',
      }
      let raw = format === 'xml'
        ? result.xml ?? (typeof result.data === 'string' ? result.data : fallbackXml)
        : typeof result.data === 'string'
          ? result.data
          : result.xml
      if (!raw) throw new Error('画布没有返回可下载内容，请稍后重试。')
      if (format === 'svg') raw = makePortableDrawioSvg(raw)
      triggerDownload(raw, `${safeName(title)}.${extensions[format]}`, mimes[format])
      onClose()
    } catch (downloadError) {
      if (format === 'xml' && fallbackXml.trim()) {
        triggerDownload(fallbackXml, `${safeName(title)}.drawio`, 'application/vnd.jgraph.mxfile')
        onClose()
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
          <button onClick={download} disabled={exporting}>
            {exporting ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}
            {exporting ? '正在生成…' : '下载文件'}
          </button>
          {error && <small className="visual-export-error">{error}</small>}
        </div>
      </div>
    </Modal>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Check, Clipboard, Download, FileCode2, FileImage, FileText, LoaderCircle } from 'lucide-react'
import { copyMarkdown, copySvg, exportDiagram, normalizeExportBackground } from '@/lib/export'
import type { ExportOptions, RenderResult } from '@/types'
import { Modal } from './Modal'

interface ExportDialogProps {
  open: boolean
  title: string
  code: string
  result: RenderResult | null
  onClose: () => void
}

const formats: Array<{ id: ExportOptions['format']; label: string; hint: string; icon: typeof FileImage }> = [
  { id: 'png', label: 'PNG', hint: 'PPT / Word / 飞书', icon: FileImage },
  { id: 'svg', label: 'SVG', hint: '矢量与网页', icon: FileCode2 },
  { id: 'jpeg', label: 'JPG', hint: '轻量图片', icon: FileImage },
  { id: 'mmd', label: 'MMD', hint: 'Mermaid 源文件', icon: FileText },
  { id: 'markdown', label: 'Markdown', hint: '文档代码块', icon: FileText },
]

export function ExportDialog({ open, title, code, result, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportOptions['format']>('png')
  const [scale, setScale] = useState(2)
  const [padding, setPadding] = useState(32)
  const [background, setBackground] = useState<string>('white')
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setCopied(null)
      setError(null)
    }
  }, [open])
  const requiresRender = !['mmd', 'markdown'].includes(format)
  const effectiveBackground = normalizeExportBackground(format, background)
  const estimated = useMemo(() => result ? `${Math.round((result.width + padding * 2) * scale)} × ${Math.round((result.height + padding * 2) * scale)} px` : '等待有效预览', [padding, result, scale])

  const handleExport = async () => {
    if (!result && requiresRender) return
    setExporting(true)
    setError(null)
    try {
      await exportDiagram(result ?? { svg: '', width: 0, height: 0, kind: 'other' }, code, {
        format,
        fileName: title,
        scale,
        padding,
        background: effectiveBackground,
      })
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导出失败，请降低清晰度后重试。')
    } finally {
      setExporting(false)
    }
  }

  const handleCopy = async (type: 'svg' | 'markdown') => {
    setError(null)
    try {
      if (type === 'svg' && result) await copySvg(result, padding, background)
      if (type === 'markdown') await copyMarkdown(code)
      setCopied(type)
      window.setTimeout(() => setCopied(null), 1800)
    } catch {
      setError('浏览器未允许访问剪贴板，请使用下载文件。')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="导出正式成果" description="按交付场景选择格式，图片默认使用 2× 高清输出。" size="large">
      <div className="export-layout">
        <div className="export-settings">
          <h3>1. 选择格式</h3>
          <div className="format-grid">
            {formats.map((item) => {
              const Icon = item.icon
              return <button key={item.id} className={format === item.id ? 'active' : ''} onClick={() => setFormat(item.id)}><Icon size={18} /><span><strong>{item.label}</strong><small>{item.hint}</small></span>{format === item.id && <Check size={15} />}</button>
            })}
          </div>

          {requiresRender && (
            <>
              <h3>2. 输出质量</h3>
              <div className="export-control-row">
                <label><span>清晰度</span><select value={scale} onChange={(event) => setScale(Number(event.target.value))}><option value={1}>1× 标准</option><option value={2}>2× 高清</option><option value={3}>3× 超清</option><option value={4}>4× 印刷</option></select></label>
                <label><span>留白</span><select value={padding} onChange={(event) => setPadding(Number(event.target.value))}><option value={0}>无</option><option value={16}>紧凑</option><option value={32}>标准</option><option value={64}>宽松</option></select></label>
              </div>
              <div className="background-options">
                <span>背景</span>
                {['white', '#f7f8fa', 'transparent'].map((color) => <button key={color} className={background === color ? 'active' : ''} onClick={() => setBackground(color)} disabled={format === 'jpeg' && color === 'transparent'} title={format === 'jpeg' && color === 'transparent' ? 'JPG 不支持透明背景' : undefined}><i style={{ background: color === 'transparent' ? 'repeating-conic-gradient(#ddd 0 25%, white 0 50%) 0 / 10px 10px' : color }} />{color === 'white' ? '白色' : color === 'transparent' ? '透明' : '浅灰'}</button>)}
              </div>
              {format === 'jpeg' && background === 'transparent' && <p className="export-inline-note">JPG 不支持透明通道，本次将自动使用白色背景。</p>}
            </>
          )}
        </div>

        <aside className="export-summary">
          <div className="export-preview-card">
            {result ? <div dangerouslySetInnerHTML={{ __html: result.svg }} /> : <FileImage size={40} />}
          </div>
          <dl>
            <div><dt>文件名</dt><dd>{title}.{format === 'jpeg' ? 'jpg' : format === 'markdown' ? 'md' : format}</dd></div>
            {requiresRender && <div><dt>预计尺寸</dt><dd>{estimated}</dd></div>}
            <div><dt>数据范围</dt><dd>仅当前图表</dd></div>
          </dl>
          <button className="export-primary" onClick={handleExport} disabled={exporting || (requiresRender && !result)}>
            {exporting ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}
            {exporting ? '正在生成…' : `下载 ${format.toUpperCase()}`}
          </button>
          <div className="copy-row">
            <button onClick={() => handleCopy('svg')} disabled={!result}><Clipboard size={14} />{copied === 'svg' ? '已复制' : '复制 SVG'}</button>
            <button onClick={() => handleCopy('markdown')}><Clipboard size={14} />{copied === 'markdown' ? '已复制' : '复制 Markdown'}</button>
          </div>
          {!result && requiresRender && <p className="export-warning">请先修正语法错误，再导出图片。</p>}
          {error && <p className="export-warning" role="alert">{error}</p>}
        </aside>
      </div>
    </Modal>
  )
}

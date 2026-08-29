import { useEffect, useMemo, useState } from 'react'
import { Check, Clipboard, Download, FileCode2, FileImage, FileText, LoaderCircle } from 'lucide-react'
import {
  copyMarkdown,
  copySvg,
  exportDiagram,
  getExportDimensions,
  normalizeExportBackground,
  rasterDimensionsSupported,
  recommendedRasterScale,
  prepareSvgForExport,
} from '@/lib/export'
import { assessMermaidDiagram, qualityFailureMessage, type DiagramQualityProfile, type DiagramQualityReceipt } from '@/lib/reliable-diagram-delivery'
import type { ExportOptions, RenderResult } from '@/types'
import { Modal } from './Modal'
import { QualityReceiptSummary } from './QualityReceiptSummary'

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
  const [scale, setScale] = useState(0)
  const [padding, setPadding] = useState(32)
  const [background, setBackground] = useState<string>('white')
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [quality, setQuality] = useState<DiagramQualityProfile>('professional')
  const [qualityReceipt, setQualityReceipt] = useState<DiagramQualityReceipt | null>(null)

  useEffect(() => {
    if (!open) {
      setCopied(null)
      setError(null)
      setQualityReceipt(null)
    }
  }, [open])
  const requiresRender = !['mmd', 'markdown'].includes(format)
  const rasterFormat = format === 'png' || format === 'jpeg'
  const effectiveBackground = normalizeExportBackground(format, background)
  const baseDimensions = useMemo(() => result ? getExportDimensions(result, padding) : null, [padding, result])
  const smartScale = baseDimensions ? recommendedRasterScale(baseDimensions.width, baseDimensions.height) : 1
  const outputScale = rasterFormat ? (scale === 0 ? smartScale : scale) : 1
  const outputWidth = baseDimensions ? Math.ceil(baseDimensions.width * outputScale) : 0
  const outputHeight = baseDimensions ? Math.ceil(baseDimensions.height * outputScale) : 0
  const rasterSupported = !rasterFormat || !baseDimensions || rasterDimensionsSupported(baseDimensions.width, baseDimensions.height, outputScale)
  const estimated = baseDimensions
    ? `${outputWidth} × ${outputHeight} px${rasterFormat ? ` · ${(outputWidth * outputHeight / 1_000_000).toFixed(1)} MP` : ' · 矢量'}`
    : '等待有效预览'

  const handleExport = async () => {
    if (!result && requiresRender) return
    setExporting(true)
    setError(null)
    try {
      if (result && requiresRender) {
        const canonicalSvg = prepareSvgForExport(result, padding, effectiveBackground, rasterFormat)
        const receipt = await assessMermaidDiagram(code, result, quality, canonicalSvg)
        setQualityReceipt(receipt)
        if (!receipt.ok) throw new Error(qualityFailureMessage(receipt))
      }
      await exportDiagram(result ?? { svg: '', width: 0, height: 0, kind: 'other' }, code, {
        format,
        fileName: title,
        scale: outputScale,
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
    <Modal open={open} onClose={onClose} title="导出正式成果" description="按交付场景选择格式，PNG 默认按约 4800px 长边智能高清输出。" size="large">
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
                <label><span>验收档位</span><select value={quality} onChange={(event) => setQuality(event.target.value as DiagramQualityProfile)}><option value="professional">专业 · 问题阻止导出</option><option value="standard">标准 · 不确定项提示</option></select></label>
                {rasterFormat && <label><span>清晰度（按完整画布）</span><select value={scale} onChange={(event) => setScale(Number(event.target.value))}><option value={0}>智能高清 · 长边约 4800px</option>{[1, 2, 3, 4].map((value) => <option key={value} value={value} disabled={Boolean(baseDimensions && !rasterDimensionsSupported(baseDimensions.width, baseDimensions.height, value))}>{value}× {value === 1 ? '标准' : value === 2 ? '高清' : value === 3 ? '超清' : '印刷'}</option>)}</select></label>}
                <label><span>留白</span><select value={padding} onChange={(event) => setPadding(Number(event.target.value))}><option value={0}>无</option><option value={16}>紧凑</option><option value={32}>标准</option><option value={64}>宽松</option></select></label>
              </div>
              <div className="background-options">
                <span>背景</span>
                {['white', '#f7f8fa', 'transparent'].map((color) => <button key={color} className={background === color ? 'active' : ''} onClick={() => setBackground(color)} disabled={format === 'jpeg' && color === 'transparent'} title={format === 'jpeg' && color === 'transparent' ? 'JPG 不支持透明背景' : undefined}><i style={{ background: color === 'transparent' ? 'repeating-conic-gradient(#ddd 0 25%, white 0 50%) 0 / 10px 10px' : color }} />{color === 'white' ? '白色' : color === 'transparent' ? '透明' : '浅灰'}</button>)}
              </div>
              {format === 'jpeg' && background === 'transparent' && <p className="export-inline-note">JPG 不支持透明通道，本次将自动使用白色背景。</p>}
              {rasterFormat && !rasterSupported && <p className="export-inline-note">当前档位超过安全像素上限，请选择可用的较低档位；完整 SVG 画布不会被裁切或缩回预览尺寸。</p>}
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
          <button className="export-primary" onClick={handleExport} disabled={exporting || (requiresRender && !result) || !rasterSupported}>
            {exporting ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}
            {exporting ? '正在生成…' : `下载 ${format.toUpperCase()}`}
          </button>
          <QualityReceiptSummary receipt={qualityReceipt} />
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

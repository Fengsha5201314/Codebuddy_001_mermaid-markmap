import { useMemo, useState } from 'react'
import { ArrowRight, Beaker, Boxes, PenTool, Search, Star, Workflow } from 'lucide-react'
import { diagramTemplates } from '@/data/templates'
import { Modal } from './Modal'

interface TemplateGalleryProps {
  open: boolean
  onClose: () => void
  onSelect: (templateId: string) => void
  onCreateVisual: (preset: VisualCanvasPreset) => void
}

export type VisualCanvasPreset = 'blank' | 'flowchart' | 'swimlane'

const categories = ['全部', '业务流程', '系统架构', '研发设计', '项目管理'] as const

const visualPresets: Array<{
  id: VisualCanvasPreset
  title: string
  description: string
  meta: string
  icon: typeof PenTool
}> = [
  { id: 'blank', title: '空白专业画布', description: '从零放置图形、连接线、文字和容器，适合自由设计。', meta: '自由绘制', icon: PenTool },
  { id: 'flowchart', title: '标准流程图', description: '以基础流程图形开始，适合审批、业务和操作流程。', meta: '推荐入门', icon: Workflow },
  { id: 'swimlane', title: '跨部门泳道', description: '以职责分区开始，适合端到端流程和协作梳理。', meta: '业务协作', icon: Boxes },
]

export function TemplateGallery({ open, onClose, onSelect, onCreateVisual }: TemplateGalleryProps) {
  const [engine, setEngine] = useState<'mermaid' | 'drawio'>('mermaid')
  const [category, setCategory] = useState<(typeof categories)[number]>('全部')
  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const search = query.trim().toLowerCase()
    return diagramTemplates.filter((template) =>
      (category === '全部' || template.category === category)
      && (!search || `${template.title} ${template.description} ${template.category}`.toLowerCase().includes(search)),
    )
  }, [category, query])

  return (
    <Modal open={open} onClose={onClose} title="创建新图表" description="先选择编辑方式；两类文档独立保存，可按任务自由切换。" size="wide">
      <div className="template-engine-switch" role="tablist" aria-label="图表编辑方式">
        <button className={engine === 'mermaid' ? 'active' : ''} onClick={() => setEngine('mermaid')} role="tab" aria-selected={engine === 'mermaid'}>
          <span className="template-engine-icon"><Beaker size={17} /></span>
          <span><strong>代码图表</strong><small>AI 生成快 · 结构清晰 · Mermaid</small></span>
        </button>
        <button className={engine === 'drawio' ? 'active' : ''} onClick={() => setEngine('drawio')} role="tab" aria-selected={engine === 'drawio'}>
          <span className="template-engine-icon"><PenTool size={17} /></span>
          <span><strong>可视化画布</strong><small>自由拖拽 · 精细排版 · Visio 式编辑</small></span>
        </button>
      </div>

      {engine === 'mermaid' ? (
        <>
          <div className="template-toolbar">
            <div className="category-tabs">
              {categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}
            </div>
            <label className="template-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索审批、泳道、架构……" /></label>
          </div>
          <div className="template-grid">
            {visible.map((template) => (
              <button key={template.id} className="template-card" onClick={() => onSelect(template.id)}>
                <span className="template-visual" style={{ '--template-accent': template.accent } as React.CSSProperties}>
                  <i /><i /><i /><b /><b />
                  {template.featured && <em><Star size={11} fill="currentColor" />推荐</em>}
                  {template.beta && <small><Beaker size={11} />11.16</small>}
                </span>
                <span className="template-copy">
                  <span className="template-meta">{template.category} · {template.kind}</span>
                  <strong>{template.title}</strong>
                  <p>{template.description}</p>
                  <span className="template-action">使用模板 <ArrowRight size={14} /></span>
                </span>
              </button>
            ))}
          </div>
          {!visible.length && <div className="template-empty">没有找到匹配模板，换个关键词试试。</div>}
        </>
      ) : (
        <div className="visual-preset-grid">
          {visualPresets.map((preset) => {
            const Icon = preset.icon
            return (
              <button key={preset.id} className="visual-preset-card" onClick={() => onCreateVisual(preset.id)}>
                <span className="visual-preset-preview"><Icon size={29} /><i /><i /><b /></span>
                <span><small>{preset.meta}</small><strong>{preset.title}</strong><p>{preset.description}</p><em>打开画布 <ArrowRight size={14} /></em></span>
              </button>
            )
          })}
          <div className="visual-preset-note"><Workflow size={17} /><span><strong>已有 Mermaid 图？</strong> 可在图表右上角“更多”中转为可视化副本，原图不会改变。</span></div>
        </div>
      )}
    </Modal>
  )
}

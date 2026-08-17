import { Sparkles, X } from 'lucide-react'
import { VisualAiAssistant } from '@/components/VisualAiAssistant'
import type { DiagramDocument } from '@/types'

interface VisualInspectorProps {
  document: DiagramDocument
  onApplyXml: (xml: string) => void
  onApplyMermaid: (mermaid: string) => void
  onClose: () => void
  onOpenSettings: () => void
}

export function VisualInspector(props: VisualInspectorProps) {
  return (
    <aside className="inspector visual-inspector">
      <div className="inspector-tabs visual-inspector-tabs">
        <button className="active ai-tab" type="button"><Sparkles size={15} />AI 画布</button>
        <span>当前可视化图</span>
        <button className="inspector-close" onClick={props.onClose} aria-label="关闭画布 AI" title="关闭画布 AI"><X size={16} /></button>
      </div>
      <div className="inspector-content ai-inspector-content">
        <VisualAiAssistant document={props.document} onApplyXml={props.onApplyXml} onApplyMermaid={props.onApplyMermaid} onOpenSettings={props.onOpenSettings} />
      </div>
    </aside>
  )
}

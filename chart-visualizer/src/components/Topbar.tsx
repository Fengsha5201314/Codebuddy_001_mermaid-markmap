import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Code2,
  Columns2,
  Download,
  FileDown,
  FileUp,
  Keyboard,
  Maximize2,
  MoreHorizontal,
  PanelRightClose,
  Settings,
  Sparkles,
  Workflow,
} from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { WorkspaceView } from '@/types'

interface TopbarProps {
  view: WorkspaceView
  onViewChange: (view: WorkspaceView) => void
  onExport: () => void
  onImport: () => void
  onBackup: () => void
  onShortcuts: () => void
  onResearch: () => void
  onSettings: () => void
  onConvertToVisual: () => void
  onReturnToSource?: () => void
}

export function Topbar({
  view,
  onViewChange,
  onExport,
  onImport,
  onBackup,
  onShortcuts,
  onResearch,
  onSettings,
  onConvertToVisual,
  onReturnToSource,
}: TopbarProps) {
  const documents = useWorkspaceStore((state) => state.documents)
  const activeId = useWorkspaceStore((state) => state.activeDocumentId)
  const update = useWorkspaceStore((state) => state.updateActiveDocument)
  const preferences = useWorkspaceStore((state) => state.preferences)
  const updatePreferences = useWorkspaceStore((state) => state.updatePreferences)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const active = documents.find((document) => document.id === activeId)

  useEffect(() => {
    if (!moreOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [moreOpen])

  if (!active) return null

  const runMoreAction = (action: () => void) => {
    setMoreOpen(false)
    action()
  }

  return (
    <header className="topbar" data-view={view} data-engine={active.engine}>
      <div className="title-editor">
        <input
          value={active.title}
          onChange={(event) => update({ title: event.target.value })}
          aria-label="图表标题"
        />
        <div className="save-state"><span />已自动保存</div>
      </div>

      {active.engine === 'mermaid' ? (
        <div className="workspace-view-switch" role="tablist" aria-label="工作区视图">
          <button
            className={`view-button view-button-canvas ${view === 'canvas' ? 'active' : ''}`}
            onClick={() => onViewChange('canvas')}
            role="tab"
            aria-selected={view === 'canvas'}
            title="专注画布"
          >
            <Maximize2 size={14} /><span>仅画布</span>
          </button>
          <button
            className={`view-button view-button-split ${view === 'split' ? 'active' : ''}`}
            onClick={() => onViewChange('split')}
            role="tab"
            aria-selected={view === 'split'}
            title="源码和画布分栏"
          >
            <Columns2 size={14} /><span>画布 + 源码</span>
          </button>
          <button
            className={`view-button view-button-source ${view === 'source' ? 'active' : ''}`}
            onClick={() => onViewChange('source')}
            role="tab"
            aria-selected={view === 'source'}
            title="专注源码"
          >
            <Code2 size={14} /><span>仅源码</span>
          </button>
        </div>
      ) : (
        <div className="visual-mode-switch">
          {onReturnToSource && (
            <button type="button" className="visual-return-source" onClick={onReturnToSource} aria-label="切换到源码画布" title="切换到同一图表的 Mermaid 源码画布">
              <ArrowLeft size={15} /><span>源码画布</span>
            </button>
          )}
          <div className="visual-mode-chip" aria-label="当前为可视化画布模式">
            <Workflow size={15} />
            <span>可视化画布</span>
            <small>自由编辑</small>
          </div>
        </div>
      )}

      <nav className="top-actions" aria-label="图表操作">
        {active.engine === 'mermaid' && (
          <button
            className="toolbar-button visual-convert-action"
            onClick={onConvertToVisual}
            title="进入当前图表的可视化画布；再次进入会复用同一画布"
            aria-label="进入可视化画布"
          >
            <Workflow size={17} />
            <span>可视化画布</span>
          </button>
        )}
        <button
          className={`toolbar-button subtle tool-toggle ${preferences.inspectorOpen ? 'active' : ''}`}
          onClick={() => updatePreferences({ inspectorOpen: !preferences.inspectorOpen })}
          title={preferences.inspectorOpen ? '关闭 AI 与工具面板' : active.engine === 'drawio' ? '打开可视化画布 AI' : '打开 AI 助手'}
          aria-label={preferences.inspectorOpen ? '关闭 AI 与工具面板' : '打开 AI 助手'}
          aria-pressed={preferences.inspectorOpen}
        >
          {preferences.inspectorOpen ? <PanelRightClose size={17} /> : <Sparkles size={17} />}
          <span>AI 助手</span>
        </button>

        <button className="toolbar-button subtle settings-entry" onClick={onSettings} title="打开设置中心" aria-label="打开设置中心">
          <Settings size={17} /><span>设置</span>
        </button>

        <div className="topbar-more" ref={moreRef}>
          <button
            className={`toolbar-button subtle compact ${moreOpen ? 'active' : ''}`}
            onClick={() => setMoreOpen((open) => !open)}
            title="更多操作"
            aria-label="更多操作"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal size={18} />
          </button>
          {moreOpen && (
            <div className="topbar-more-menu">
              <button onClick={() => runMoreAction(onImport)}><FileUp size={15} /><span><strong>导入</strong><small>图表或工作区备份</small></span></button>
              <button onClick={() => runMoreAction(onBackup)}><FileDown size={15} /><span><strong>备份</strong><small>下载全部本地项目</small></span></button>
              <button onClick={() => runMoreAction(onShortcuts)}><Keyboard size={15} /><span><strong>快捷键</strong><small>查看高效操作方式</small></span></button>
              <button onClick={() => runMoreAction(onResearch)}><BookOpen size={15} /><span><strong>产品路线</strong><small>查看后续能力规划</small></span></button>
            </div>
          )}
        </div>

        <button className="toolbar-button primary" onClick={onExport} title="导出当前图表" aria-label="导出当前图表">
          <Download size={16} /><span>导出交付</span>
        </button>
      </nav>
    </header>
  )
}

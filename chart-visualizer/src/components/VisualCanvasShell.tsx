import type { RefObject } from 'react'
import {
  CheckCircle2,
  Focus,
  Info,
  LoaderCircle,
  Maximize2,
  Redo2,
  RefreshCw,
  TriangleAlert,
  Undo2,
  WandSparkles,
  Workflow,
} from 'lucide-react'
import './VisualCanvasShell.css'

export interface VisualCanvasShellProps {
  iframeRef: RefObject<HTMLIFrameElement | null>
  iframeSrc: string
  ready: boolean
  saving: boolean
  error?: string | null
  status?: string
  title?: string
  runtimeLabel?: string
  loadingTitle?: string
  loadingDescription?: string
  canUndo?: boolean
  canRedo?: boolean
  onUndo: () => void
  onRedo: () => void
  onFit: () => void
  onAutoLayout: () => void
  onFullscreen: () => void
  onConvertInfo: () => void
  onRetry?: () => void
}

export function VisualCanvasShell({
  iframeRef,
  iframeSrc,
  ready,
  saving,
  error,
  status,
  title = '专业画布',
  runtimeLabel = '本地引擎',
  loadingTitle = '正在启动本地可视化引擎',
  loadingDescription = '画布组件已内置，无需连接官方网站',
  canUndo = true,
  canRedo = true,
  onUndo,
  onRedo,
  onFit,
  onAutoLayout,
  onFullscreen,
  onConvertInfo,
  onRetry,
}: VisualCanvasShellProps) {
  const stateKind = error ? 'error' : saving ? 'saving' : ready ? 'ready' : 'connecting'
  const stateText = error
    ? '连接异常'
    : saving
      ? '正在保存'
      : ready
        ? status || '已自动保存'
        : status || '正在加载 diagrams.net 画布组件'

  return (
    <section className={`visual-canvas-shell is-${stateKind}`} aria-label="可视化流程图画布">
      <header className="visual-canvas-contextbar">
        <div className="visual-canvas-heading">
          <span className="visual-canvas-mark" aria-hidden="true"><Workflow size={16} /></span>
          <span className="visual-canvas-title-copy">
            <strong>{title}</strong>
            <small>{runtimeLabel}</small>
          </span>
          <span className={`visual-canvas-state is-${stateKind}`} role="status" aria-live="polite" title={stateText}>
            {error ? (
              <TriangleAlert size={13} />
            ) : saving || !ready ? (
              <LoaderCircle size={13} className="visual-canvas-spin" />
            ) : (
              <CheckCircle2 size={13} />
            )}
            <span>{stateText}</span>
          </span>
        </div>

        <nav className="visual-canvas-actions" aria-label="画布操作">
          <div className="visual-canvas-action-group" role="group" aria-label="历史操作">
            <button
              type="button"
              onClick={onUndo}
              disabled={!ready || !canUndo}
              title="撤销 (Ctrl+Z)"
              aria-label="撤销"
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!ready || !canRedo}
              title="重做 (Ctrl+Shift+Z)"
              aria-label="重做"
            >
              <Redo2 size={16} />
            </button>
          </div>

          <span className="visual-canvas-divider" aria-hidden="true" />

          <div className="visual-canvas-action-group" role="group" aria-label="视图操作">
            <button type="button" onClick={onFit} disabled={!ready} title="适应画布" aria-label="适应画布">
              <Focus size={16} />
              <span className="visual-canvas-action-label">适应画布</span>
            </button>
            <button type="button" onClick={onAutoLayout} disabled={!ready} title="自动整理布局" aria-label="自动整理布局">
              <WandSparkles size={16} />
              <span className="visual-canvas-action-label">自动布局</span>
            </button>
            <button type="button" onClick={onFullscreen} disabled={!ready} title="全屏编辑" aria-label="全屏编辑">
              <Maximize2 size={16} />
            </button>
          </div>

          <span className="visual-canvas-divider" aria-hidden="true" />

          <button
            type="button"
            className="visual-canvas-info-action"
            onClick={onConvertInfo}
            title="了解 Mermaid 与可视化画布的转换规则"
            aria-label="查看画布转换说明"
          >
            <Info size={16} />
            <span className="visual-canvas-action-label">转换说明</span>
          </button>
        </nav>
      </header>

      <div className="visual-canvas-stage">
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="可视化流程图编辑器"
          className={`visual-canvas-frame ${ready && !error ? 'is-visible' : ''}`}
          allow="clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />

        {!ready && !error && (
          <div className="visual-canvas-loading" role="status" aria-live="polite">
            <div className="visual-canvas-loading-map" aria-hidden="true">
              <i /><i /><i /><i />
              <span /><span /><span />
            </div>
            <div className="visual-canvas-loading-copy">
              <strong>{loadingTitle}</strong>
              <span>{loadingDescription}</span>
            </div>
            <div className="visual-canvas-loading-line" aria-hidden="true"><span /></div>
          </div>
        )}

        {error && (
          <div className="visual-canvas-error" role="alert">
            <span className="visual-canvas-error-mark"><TriangleAlert size={21} /></span>
            <div>
              <strong>画布暂时无法打开</strong>
              <p>{error}</p>
              <small>已有内容仍保存在本地，不会因为重新连接而丢失。</small>
            </div>
            {onRetry && (
              <button type="button" onClick={onRetry}><RefreshCw size={14} />重新连接</button>
            )}
          </div>
        )}

        {ready && !error && (
          <footer className="visual-canvas-footnote">
            <span><i />{runtimeLabel}</span>
            <p className="visual-canvas-desktop-hint">双击编辑文字 · 拖动画布移动 · Delete 删除所选 · 修改自动保存</p>
            <p className="visual-canvas-mobile-hint">双击编辑 · 双指缩放</p>
          </footer>
        )}
      </div>
    </section>
  )
}

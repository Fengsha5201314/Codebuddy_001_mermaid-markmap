import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  CheckCircle2,
  Expand,
  Focus,
  Grid3X3,
  Hand,
  LoaderCircle,
  Maximize2,
  Minus,
  MousePointer2,
  PencilLine,
  Plus,
  RotateCcw,
  Code2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { getDiagramTheme } from '@/data/themes'
import { isRenderError, renderDiagram } from '@/lib/diagram-engine'
import {
  findEditableTextMatches,
  normalizeRenderedText,
  replaceEditableText,
  type InlineTextMatch,
} from '@/lib/inline-edit'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { RenderError, RenderResult } from '@/types'

interface PreviewCanvasProps {
  onResult: (result: RenderResult | null) => void
  onError: (error: RenderError | null) => void
  onFocusError: (line?: number) => void
  onShowSource?: () => void
}

interface CanvasView {
  x: number
  y: number
  zoom: number
}

interface InlineEditorState {
  x: number
  y: number
  originalText: string
  value: string
  matches: InlineTextMatch[]
  selectedMatch: number
}

const MIN_ZOOM = 0.05
const MAX_ZOOM = 8

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value))
}

function labelElementFromTarget(target: Element): Element | null {
  const renderedRoot = target.closest('[data-rendered-diagram]')
  if (!renderedRoot) return null
  const label = target.closest('text, foreignObject, .nodeLabel, .edgeLabel, .label')
  return label && renderedRoot.contains(label) ? label : null
}

export function PreviewCanvas({ onResult, onError, onFocusError, onShowSource }: PreviewCanvasProps) {
  const documents = useWorkspaceStore((state) => state.documents)
  const activeId = useWorkspaceStore((state) => state.activeDocumentId)
  const preferences = useWorkspaceStore((state) => state.preferences)
  const updatePreferences = useWorkspaceStore((state) => state.updatePreferences)
  const updateCode = useWorkspaceStore((state) => state.updateCode)
  const active = documents.find((document) => document.id === activeId)
  const viewportRef = useRef<HTMLDivElement>(null)
  const inlineInputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef(0)
  const activeDocumentRef = useRef<string | null>(null)
  const displayedResultRef = useRef<RenderResult | null>(null)
  const fitModeRef = useRef(true)
  const feedbackTimerRef = useRef<number | null>(null)
  const [result, setResult] = useState<RenderResult | null>(null)
  const [lastGoodResult, setLastGoodResult] = useState<RenderResult | null>(null)
  const [error, setError] = useState<RenderError | null>(null)
  const [rendering, setRendering] = useState(false)
  const [renderTime, setRenderTime] = useState(0)
  const [view, setView] = useState<CanvasView>({ x: 0, y: 0, zoom: 1 })
  const [drag, setDrag] = useState<{ x: number; y: number; startX: number; startY: number } | null>(null)
  const [inlineEditor, setInlineEditor] = useState<InlineEditorState | null>(null)
  const [canvasFeedback, setCanvasFeedback] = useState<string | null>(null)

  const showCanvasFeedback = useCallback((message: string) => {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    setCanvasFeedback(message)
    feedbackTimerRef.current = window.setTimeout(() => setCanvasFeedback(null), 2400)
  }, [])

  useEffect(() => () => {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
  }, [])

  useEffect(() => {
    if (!inlineEditor) return
    const frame = window.requestAnimationFrame(() => inlineInputRef.current?.select())
    return () => window.cancelAnimationFrame(frame)
  }, [inlineEditor?.originalText])

  const fit = useCallback((diagram?: RenderResult | null) => {
    const viewport = viewportRef.current
    const target = diagram ?? displayedResultRef.current
    if (!viewport || !target) return
    const rect = viewport.getBoundingClientRect()
    const availableWidth = Math.max(100, rect.width - 96)
    const availableHeight = Math.max(100, rect.height - 96)
    const zoom = Math.min(1.6, Math.max(MIN_ZOOM, Math.min(availableWidth / target.width, availableHeight / target.height)))
    fitModeRef.current = true
    setInlineEditor(null)
    setView({ x: 0, y: 0, zoom })
  }, [])

  const zoomTo = useCallback((nextZoom: number, clientPoint?: { x: number; y: number }) => {
    fitModeRef.current = false
    setInlineEditor(null)
    setView((current) => {
      const zoom = clampZoom(nextZoom)
      const viewport = viewportRef.current
      if (!viewport || !clientPoint || current.zoom === zoom) return { ...current, zoom }
      const rect = viewport.getBoundingClientRect()
      const anchorX = clientPoint.x - rect.left - rect.width / 2
      const anchorY = clientPoint.y - rect.top - rect.height / 2
      const ratio = zoom / current.zoom
      return {
        zoom,
        x: anchorX - (anchorX - current.x) * ratio,
        y: anchorY - (anchorY - current.y) * ratio,
      }
    })
  }, [])

  const resetView = useCallback(() => {
    fitModeRef.current = false
    setInlineEditor(null)
    setView({ x: 0, y: 0, zoom: 1 })
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      fitModeRef.current = false
      setInlineEditor(null)
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 18 : event.deltaY
      const factor = Math.exp(-delta * 0.0016)
      const rect = viewport.getBoundingClientRect()
      const anchorX = event.clientX - rect.left - rect.width / 2
      const anchorY = event.clientY - rect.top - rect.height / 2
      setView((current) => {
        const zoom = clampZoom(current.zoom * factor)
        const ratio = zoom / current.zoom
        return {
          zoom,
          x: anchorX - (anchorX - current.x) * ratio,
          y: anchorY - (anchorY - current.y) * ratio,
        }
      })
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== 'f') return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"], .monaco-editor')) return
      event.preventDefault()
      fit()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fit])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') return
    let frame = 0
    const observer = new ResizeObserver(() => {
      if (!fitModeRef.current) return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => fit())
    })
    observer.observe(viewport)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [fit])

  useEffect(() => {
    if (!active) return
    if (activeDocumentRef.current !== active.id) {
      activeDocumentRef.current = active.id
      displayedResultRef.current = null
      fitModeRef.current = true
      setResult(null)
      setLastGoodResult(null)
      setError(null)
      onError(null)
      setInlineEditor(null)
      setView({ x: 0, y: 0, zoom: 1 })
      onResult(null)
    }
    const request = ++requestRef.current
    const timeout = window.setTimeout(async () => {
      const started = performance.now()
      setRendering(true)
      try {
        const rendered = await renderDiagram(active.code, getDiagramTheme(active.themeId))
        if (request !== requestRef.current) return
        displayedResultRef.current = rendered
        setResult(rendered)
        setLastGoodResult(rendered)
        setError(null)
        onError(null)
        onResult(rendered)
        setRenderTime(Math.round(performance.now() - started))
        if (fitModeRef.current) window.requestAnimationFrame(() => fit(rendered))
      } catch (caught) {
        if (request !== requestRef.current) return
        const normalized = isRenderError(caught)
          ? caught
          : { message: '渲染失败，请检查图表语法。', raw: String(caught) }
        setResult(null)
        setError(normalized)
        onError(normalized)
      } finally {
        if (request === requestRef.current) setRendering(false)
      }
    }, preferences.renderDelay)
    return () => window.clearTimeout(timeout)
  }, [active?.code, active?.themeId, active?.id, fit, onError, onResult, preferences.renderDelay])

  if (!active) return null
  const displayed = result ?? lastGoodResult
  const theme = getDiagramTheme(active.themeId)

  const openInlineEditor = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element
    const label = labelElementFromTarget(target)
    if (!label) return
    event.preventDefault()
    event.stopPropagation()

    if (error) {
      showCanvasFeedback('请先修正源码语法，再从画布编辑文字')
      return
    }

    const originalText = normalizeRenderedText(label.textContent ?? '')
    const matches = findEditableTextMatches(active.code, originalText, active.kind)
    if (!matches.length) {
      showCanvasFeedback('这是结构名称或自动生成文字，请在源码或组件面板中修改')
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const editorWidth = Math.min(304, Math.max(236, rect.width - 24))
    const x = Math.min(Math.max(12, event.clientX - rect.left - 28), Math.max(12, rect.width - editorWidth - 12))
    const y = Math.min(Math.max(12, event.clientY - rect.top + 12), Math.max(12, rect.height - 176))
    setInlineEditor({ x, y, originalText, value: originalText, matches, selectedMatch: 0 })
  }

  const commitInlineEdit = () => {
    if (!inlineEditor) return
    const match = inlineEditor.matches[inlineEditor.selectedMatch]
    if (!match) return
    const nextCode = replaceEditableText(active.code, match, inlineEditor.value)
    if (nextCode !== active.code) {
      updateCode(nextCode)
      showCanvasFeedback(`已同步到源码第 ${match.line} 行`)
    }
    setInlineEditor(null)
  }

  return (
    <section className="preview-panel" aria-label="图表预览">
      <div className="panel-titlebar preview-titlebar">
        <div className="panel-title">
          <Focus size={15} />
          <strong>实时预览</strong>
          {rendering ? (
            <span className="render-badge pending"><LoaderCircle size={12} className="spin" />渲染中</span>
          ) : error ? (
            <span className="render-badge error"><TriangleAlert size={12} />语法问题</span>
          ) : (
            <span className="render-badge success"><CheckCircle2 size={12} />{renderTime} ms</span>
          )}
          <span className="preview-edit-badge"><PencilLine size={11} />双击文字可编辑</span>
        </div>
        <div className="canvas-actions">
          {onShowSource && <button className="show-source-action" onClick={onShowSource} title="显示源码区" aria-label="显示源码区"><Code2 size={15} /><span>显示源码</span></button>}
          <button onClick={() => updatePreferences({ canvasGrid: !preferences.canvasGrid })} className={preferences.canvasGrid ? 'active' : ''} title="网格" aria-label="切换画布网格">
            <Grid3X3 size={15} />
          </button>
          <button onClick={() => fit()} title="适应画布 (F)" aria-label="适应画布"><Expand size={15} /></button>
          <button onClick={() => viewportRef.current?.requestFullscreen?.()} title="预览全屏" aria-label="预览全屏"><Maximize2 size={15} /></button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`canvas-viewport ${preferences.canvasGrid ? 'with-grid' : ''} ${drag ? 'dragging' : ''}`}
        style={{ '--canvas-color': theme.canvas } as React.CSSProperties}
        tabIndex={0}
        aria-label="可缩放和拖动的图表画布。滚轮缩放，拖动画布，双击文字编辑。"
        onDoubleClick={openInlineEditor}
        onPointerDown={(event) => {
          if (event.button !== 0 && event.button !== 1) return
          const target = event.target as HTMLElement
          if (target.closest('button, input, select, textarea, [data-canvas-interactive]')) return
          if (labelElementFromTarget(target)) return
          fitModeRef.current = false
          setDrag({ x: view.x, y: view.y, startX: event.clientX, startY: event.clientY })
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!drag) return
          setView((current) => ({ ...current, x: drag.x + event.clientX - drag.startX, y: drag.y + event.clientY - drag.startY }))
        }}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={(event) => {
          if (event.key === '+' || event.key === '=') {
            event.preventDefault()
            zoomTo(view.zoom * 1.15)
          }
          if (event.key === '-' || event.key === '_') {
            event.preventDefault()
            zoomTo(view.zoom / 1.15)
          }
          if (event.key === '0') {
            event.preventDefault()
            resetView()
          }
          if (event.key === 'Escape') setInlineEditor(null)
        }}
      >
        {displayed ? (
          <div
            className={`diagram-stage ${error ? 'stale' : ''}`}
            style={{
              width: `${displayed.width}px`,
              height: `${displayed.height}px`,
              left: `calc(50% + ${view.x}px)`,
              top: `calc(50% + ${view.y}px)`,
              transform: `translate(-50%, -50%) scale(${view.zoom})`,
            }}
          >
            <div data-rendered-diagram dangerouslySetInnerHTML={{ __html: displayed.svg }} />
          </div>
        ) : !rendering ? (
          <div className="canvas-empty">
            <TriangleAlert size={28} />
            <strong>暂时无法生成图表</strong>
            <p>修正左侧语法后，预览会自动恢复。</p>
          </div>
        ) : null}

        <div className="canvas-gesture-guide" aria-hidden="true">
          <span><MousePointer2 size={12} />双击文字编辑</span>
          <span><Hand size={12} />拖动画布</span>
          <span>滚轮缩放</span>
        </div>

        {inlineEditor && (
          <form
            className="inline-label-editor"
            data-canvas-interactive
            style={{ left: inlineEditor.x, top: inlineEditor.y }}
            onSubmit={(event) => { event.preventDefault(); commitInlineEdit() }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <header>
              <span><PencilLine size={13} />编辑图中文字</span>
              <button type="button" onClick={() => setInlineEditor(null)} aria-label="取消编辑"><X size={13} /></button>
            </header>
            <input
              ref={inlineInputRef}
              value={inlineEditor.value}
              onChange={(event) => setInlineEditor((current) => current ? { ...current, value: event.target.value } : null)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setInlineEditor(null)
                }
              }}
              aria-label="图中文字"
            />
            {inlineEditor.matches.length > 1 && (
              <label>
                <span>发现 {inlineEditor.matches.length} 个同名位置，请选择</span>
                <select
                  value={inlineEditor.selectedMatch}
                  onChange={(event) => setInlineEditor((current) => current ? { ...current, selectedMatch: Number(event.target.value) } : null)}
                >
                  {inlineEditor.matches.map((match, index) => (
                    <option value={index} key={`${match.start}-${match.end}`}>
                      第 {match.line} 行，第 {match.column} 列 · {match.preview}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <footer>
              <small>Enter 确认 · Esc 取消</small>
              <button type="submit" disabled={!normalizeRenderedText(inlineEditor.value)}><Check size={13} />同步源码</button>
            </footer>
          </form>
        )}

        {canvasFeedback && <div className="canvas-feedback"><CheckCircle2 size={14} />{canvasFeedback}</div>}

        {error && (
          <button className="error-banner" onClick={() => onFocusError(error.line)}>
            <TriangleAlert size={17} />
            <span>
              <strong>{error.line ? `第 ${error.line} 行：` : ''}{error.message}</strong>
              <small>{lastGoodResult ? '当前保留上一次成功预览，点击定位源码。' : '点击返回源码检查。'}</small>
            </span>
          </button>
        )}

        <div className="zoom-dock" data-canvas-interactive>
          <button onClick={() => zoomTo(view.zoom / 1.18)} aria-label="缩小" title="缩小"><Minus size={15} /></button>
          <button className="zoom-readout" onClick={() => zoomTo(1)} title="恢复 100%">{Math.round(view.zoom * 100)}%</button>
          <button onClick={() => zoomTo(view.zoom * 1.18)} aria-label="放大" title="放大"><Plus size={15} /></button>
          <span />
          <button onClick={() => fit()} title="适应画布 (F)" aria-label="适应画布"><Focus size={15} /></button>
          <button onClick={resetView} title="重置视图 (0)" aria-label="重置视图"><RotateCcw size={15} /></button>
        </div>

        <div className="canvas-metrics">
          {displayed ? `${Math.round(displayed.width)} × ${Math.round(displayed.height)} px · ${Math.round(view.zoom * 100)}%` : '等待有效图表'}
        </div>
      </div>
    </section>
  )
}

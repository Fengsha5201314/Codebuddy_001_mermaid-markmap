import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  createDrawioBridge,
  type DrawioBridge,
  type DrawioExportFormat,
  type DrawioExportOptions,
  type DrawioExportResult,
  type DrawioSource,
} from '@/lib/drawio-bridge'
import { getOnlineFallback, resolveDrawioRuntime } from '@/lib/drawio-runtime'
import { EMPTY_DRAWIO_XML } from '@/lib/workspace-data'
import { toDrawioCompatibleMermaid } from '@/lib/visual-conversion'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { DiagramDocument } from '@/types'
import { VisualCanvasShell } from './VisualCanvasShell'

export interface VisualCanvasHandle {
  exportDiagram: (format: DrawioExportFormat, options?: DrawioExportOptions) => Promise<DrawioExportResult>
  fit: () => void
  loadXml: (xml: string) => void
  loadMermaid: (mermaid: string) => void
}

interface VisualCanvasProps {
  document: DiagramDocument
  onConvertInfo: () => void
  onNotice: (message: string) => void
}

function getInitialSource(document: DiagramDocument): DrawioSource {
  const xml = document.drawioXml?.trim()
  if (document.sourceMermaid?.trim() && (!xml || xml === EMPTY_DRAWIO_XML)) {
    const compatible = toDrawioCompatibleMermaid(document.sourceMermaid)
    return {
      type: 'mermaid',
      mermaid: compatible.source,
      wrap: true,
      sourceMetadataKey: 'mermaidSource',
    }
  }
  return { type: 'xml', xml: xml || EMPTY_DRAWIO_XML }
}

export const VisualCanvas = forwardRef<VisualCanvasHandle, VisualCanvasProps>(function VisualCanvas(
  { document, onConvertInfo, onNotice },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const bridgeRef = useRef<DrawioBridge | null>(null)
  const lastLocalXmlRef = useRef(document.drawioXml ?? EMPTY_DRAWIO_XML)
  const saveTimerRef = useRef<number | null>(null)
  const connectionTimerRef = useRef<number | null>(null)
  const connectionStartedRef = useRef(0)
  const pendingMermaidRef = useRef<string | null>(null)
  const preferredRuntimeMode = useWorkspaceStore((state) => state.preferences.visualEditorMode)
  const allowOnlineFallback = useWorkspaceStore((state) => state.preferences.visualEditorOnlineFallback)
  const [runtimeMode, setRuntimeMode] = useState(preferredRuntimeMode)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const runtime = resolveDrawioRuntime(runtimeMode, window.location.href)
  const [status, setStatus] = useState(runtime.loadingTitle)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useImperativeHandle(ref, () => ({
    exportDiagram: (format, options) => {
      const bridge = bridgeRef.current
      if (!bridge) return Promise.reject(new Error('可视化画布尚未连接。'))
      return bridge.exportDiagram(format, options)
    },
    fit: () => bridgeRef.current?.invokeAction('fit', { border: 22, maxScale: 1 }),
    loadXml: (xml) => {
      const bridge = bridgeRef.current
      if (!bridge) throw new Error('可视化画布尚未连接。')
      pendingMermaidRef.current = null
      lastLocalXmlRef.current = xml
      useWorkspaceStore.getState().updateVisualSource(xml)
      connectionStartedRef.current = performance.now()
      setReady(false)
      setStatus('AI 修改已接收，正在重载画布')
      bridge.load({ type: 'xml', xml })
    },
    loadMermaid: (mermaid) => {
      const bridge = bridgeRef.current
      if (!bridge) throw new Error('可视化画布尚未连接。')
      pendingMermaidRef.current = mermaid
      connectionStartedRef.current = performance.now()
      setReady(false)
      setStatus('AI 结构已生成，正在转换为可视化画布')
      bridge.load({
        type: 'mermaid',
        mermaid: toDrawioCompatibleMermaid(mermaid).source,
        wrap: true,
        sourceMetadataKey: 'mermaidSource',
      })
    },
  }), [])

  useEffect(() => {
    setRuntimeMode(preferredRuntimeMode)
  }, [preferredRuntimeMode])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    setReady(false)
    setSaving(false)
    setError(null)
    setStatus(runtime.loadingTitle)
    connectionStartedRef.current = performance.now()
    lastLocalXmlRef.current = document.drawioXml ?? EMPTY_DRAWIO_XML

    const handleRuntimeFailure = (message: string) => {
      const fallback = getOnlineFallback(runtime, allowOnlineFallback, window.location.href)
      if (fallback) {
        setStatus('本地引擎启动异常，正在切换官方在线备用')
        onNotice('本地画布暂时不可用，已切换官方在线备用')
        setRuntimeMode(fallback.mode)
        return
      }
      setError(message)
      setReady(false)
    }

    const bridge = createDrawioBridge({
      iframe,
      source: getInitialSource(document),
      editorUrl: runtime.editorUrl,
      urlParams: {
        ui: 'kennedy',
        noSaveBtn: 1,
        noExitBtn: 1,
        saveAndExit: 0,
        dark: 0,
      },
      load: {
        autosave: true,
        exportProtocol: true,
        fit: true,
        title: document.title,
      },
      onReady: () => setStatus(runtime.mode === 'local' ? '本地引擎已启动，正在载入图形' : '官方在线引擎已连接，正在载入本地图形'),
      onLoad: () => {
        setReady(true)
        const elapsed = Math.max(0, performance.now() - connectionStartedRef.current)
        setStatus(elapsed > 0 ? `画布已就绪 · ${(elapsed / 1000).toFixed(1)}s` : '画布已就绪')
        if (connectionTimerRef.current !== null) window.clearTimeout(connectionTimerRef.current)
        const pendingMermaid = pendingMermaidRef.current
        if (pendingMermaid) {
          void bridge.exportDiagram('xml').then((result) => {
            const xml = result.xml || (typeof result.data === 'string' ? result.data : '')
            if (!xml || useWorkspaceStore.getState().activeDocumentId !== document.id) return
            pendingMermaidRef.current = null
            lastLocalXmlRef.current = xml
            useWorkspaceStore.getState().updateVisualSource(xml, pendingMermaid)
            onNotice('AI 新画布已应用并自动保存')
          }).catch(() => onNotice('画布已生成，下次修改时将自动保存'))
        }
      },
      onAutosave: ({ xml }) => {
        if (useWorkspaceStore.getState().activeDocumentId !== document.id) return
        lastLocalXmlRef.current = xml
        setSaving(true)
        setStatus('正在保存')
        useWorkspaceStore.getState().updateVisualSource(xml, pendingMermaidRef.current ?? undefined)
        pendingMermaidRef.current = null
        if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = window.setTimeout(() => {
          setSaving(false)
          setStatus('已自动保存')
        }, 420)
      },
      onSave: ({ xml }) => {
        if (useWorkspaceStore.getState().activeDocumentId !== document.id) return
        lastLocalXmlRef.current = xml
        useWorkspaceStore.getState().updateVisualSource(xml)
      },
      onError: (bridgeError) => {
        handleRuntimeFailure(bridgeError.message)
      },
    })
    bridgeRef.current = bridge

    connectionTimerRef.current = window.setTimeout(() => {
      if (bridge.state !== 'ready') {
        handleRuntimeFailure(runtime.mode === 'local'
          ? '本地可视化引擎启动超时。画布 XML 仍安全保存在本机。'
          : '无法连接 embed.diagrams.net 官方在线备用。画布 XML 仍安全保存在本机。')
      }
    }, runtime.mode === 'local' ? 10_000 : 18_000)

    return () => {
      if (connectionTimerRef.current !== null) window.clearTimeout(connectionTimerRef.current)
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
      bridge.destroy()
      bridgeRef.current = null
    }
  }, [allowOnlineFallback, attempt, document.id, runtime.editorUrl, runtime.loadingTitle, runtime.mode])

  useEffect(() => {
    const xml = document.drawioXml?.trim()
    if (!xml || !ready || xml === lastLocalXmlRef.current) return
    lastLocalXmlRef.current = xml
    bridgeRef.current?.load({ type: 'xml', xml })
    onNotice('已恢复画布版本')
  }, [document.drawioXml, onNotice, ready])

  const run = (action: () => void) => {
    try {
      action()
    } catch (actionError) {
      onNotice(actionError instanceof Error ? actionError.message : '画布操作暂时不可用')
    }
  }

  const fullscreen = () => {
    const frame = iframeRef.current
    if (!frame) return
    void frame.requestFullscreen?.().catch(() => onNotice('浏览器未允许进入全屏模式'))
  }

  return (
    <VisualCanvasShell
      iframeRef={iframeRef}
      iframeSrc="about:blank"
      ready={ready}
      saving={saving}
      error={error}
      status={status}
      runtimeLabel={runtime.label}
      loadingTitle={runtime.loadingTitle}
      loadingDescription={runtime.loadingDescription}
      title={document.sourceMermaid ? 'Mermaid 可视化副本' : '专业画布'}
      onUndo={() => run(() => bridgeRef.current?.invokeAction('undo'))}
      onRedo={() => run(() => bridgeRef.current?.invokeAction('redo'))}
      onFit={() => run(() => bridgeRef.current?.invokeAction('fit', { border: 22, maxScale: 1 }))}
      onAutoLayout={() => run(() => bridgeRef.current?.layout({ layout: 'horizontalFlow' }))}
      onFullscreen={fullscreen}
      onConvertInfo={onConvertInfo}
      onRetry={() => {
        setRuntimeMode(preferredRuntimeMode)
        setAttempt((value) => value + 1)
      }}
    />
  )
})

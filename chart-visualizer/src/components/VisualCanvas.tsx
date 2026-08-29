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
import { validateDrawioXml } from '@/lib/drawio-xml'
import { toDrawioCompatibleMermaid } from '@/lib/visual-conversion'
import { assessDrawioDiagram, qualityFailureMessage } from '@/lib/reliable-diagram-delivery'
import { makePortableDrawioSvg } from '@/lib/portable-drawio-svg'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { DiagramDocument } from '@/types'
import { VisualCanvasShell } from './VisualCanvasShell'

export interface VisualCanvasHandle {
  captureXml: () => Promise<string>
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

const CANDIDATE_STABILIZATION_DELAYS_MS = [0, 120, 240, 420, 700, 1_000]

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function hasMeaningfulDrawioSvg(svg: string): boolean {
  if (svg.length < 800 || !/<svg\b/i.test(svg)) return false
  const text = svg.match(/<text\b[^>]*>([\s\S]*?)<\/text>/gi) ?? []
  const visibleText = text.some((item) => item.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim().length > 0)
  const businessShapes = (svg.match(/<(?:rect|path|ellipse|polygon)\b/gi) ?? []).length
  return visibleText && businessShapes >= 2
}

async function exportStableCandidate(
  bridge: DrawioBridge,
  latestAutosaveXml: () => string | null,
): Promise<{ xml: string; svg: string }> {
  for (const milliseconds of CANDIDATE_STABILIZATION_DELAYS_MS) {
    if (milliseconds) await delay(milliseconds)
    const xmlResult = await bridge.exportDiagram('xml')
    const exportedXml = xmlResult.xml || (typeof xmlResult.data === 'string' ? xmlResult.data : '')
    const autosaveXml = latestAutosaveXml() ?? ''
    const xml = [exportedXml, autosaveXml].find((candidate) => candidate && !validateDrawioXml(candidate))
      || exportedXml
      || autosaveXml
    const svgResult = await bridge.exportDiagram('svg')
    const rawSvg = typeof svgResult.data === 'string' ? svgResult.data : svgResult.xml ?? ''
    const svg = rawSvg ? makePortableDrawioSvg(rawSvg) : ''
    if (xml && hasMeaningfulDrawioSvg(svg)) return { xml, svg }
  }
  throw new Error('draw.io 尚未完成图形渲染，未检测到可交付的文字与图形。')
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

export function needsInitialVisualXmlCapture(document: DiagramDocument): boolean {
  const xml = document.drawioXml?.trim()
  return Boolean(document.sourceMermaid?.trim() && (!xml || xml === EMPTY_DRAWIO_XML))
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
  const pendingMermaidRef = useRef<string | null>(
    needsInitialVisualXmlCapture(document) ? document.sourceMermaid?.trim() ?? null : null,
  )
  const pendingXmlRef = useRef<string | null>(null)
  const pendingAutosaveXmlRef = useRef<string | null>(null)
  const validatingCandidateRef = useRef(needsInitialVisualXmlCapture(document))
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
    captureXml: async () => {
      const bridge = bridgeRef.current
      if (!bridge || bridge.state !== 'ready') return lastLocalXmlRef.current
      const result = await bridge.exportDiagram('xml')
      return result.xml || (typeof result.data === 'string' ? result.data : '') || lastLocalXmlRef.current
    },
    exportDiagram: (format, options) => {
      const bridge = bridgeRef.current
      if (!bridge) return Promise.reject(new Error('可视化画布尚未连接。'))
      return bridge.exportDiagram(format, options)
    },
    fit: () => {
      const bridge = bridgeRef.current
      if (bridge?.state === 'ready') bridge.invokeAction('fit', { border: 22, maxScale: 1 })
    },
    loadXml: (xml) => {
      const bridge = bridgeRef.current
      if (!bridge) throw new Error('可视化画布尚未连接。')
      pendingMermaidRef.current = null
      pendingXmlRef.current = xml
      pendingAutosaveXmlRef.current = null
      validatingCandidateRef.current = true
      connectionStartedRef.current = performance.now()
      setReady(false)
      setStatus('AI 修改已接收，正在重载画布')
      bridge.load({ type: 'xml', xml })
    },
    loadMermaid: (mermaid) => {
      const bridge = bridgeRef.current
      if (!bridge) throw new Error('可视化画布尚未连接。')
      pendingMermaidRef.current = mermaid
      pendingXmlRef.current = null
      pendingAutosaveXmlRef.current = null
      validatingCandidateRef.current = true
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
    pendingMermaidRef.current = needsInitialVisualXmlCapture(document) ? document.sourceMermaid?.trim() ?? null : null
    pendingXmlRef.current = null
    pendingAutosaveXmlRef.current = null
    validatingCandidateRef.current = Boolean(pendingMermaidRef.current)

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
        const elapsed = Math.max(0, performance.now() - connectionStartedRef.current)
        if (connectionTimerRef.current !== null) window.clearTimeout(connectionTimerRef.current)
        const pendingMermaid = pendingMermaidRef.current
        const pendingXml = pendingXmlRef.current
        if (validatingCandidateRef.current && (pendingMermaid || pendingXml)) {
          setReady(false)
          setStatus('图形已载入，正在执行交付前检查')
          const initialConversion = Boolean(pendingMermaid && document.drawioXml === EMPTY_DRAWIO_XML && !document.lastGood)
          void exportStableCandidate(bridge, () => pendingAutosaveXmlRef.current).then(({ xml, svg }) => (
            assessDrawioDiagram(xml, initialConversion ? 'standard' : 'professional', svg)
              .then((quality) => ({ xml, quality }))
          )).then(({ xml, quality }) => {
            if (!quality.ok) throw new Error(qualityFailureMessage(quality))
            pendingMermaidRef.current = null
            pendingXmlRef.current = null
            pendingAutosaveXmlRef.current = null
            validatingCandidateRef.current = false
            lastLocalXmlRef.current = xml
            useWorkspaceStore.getState().commitValidatedCandidate(document.id, xml, {
              engine: 'drawio',
              source: xml,
              sourceSha256: quality.inputSha256,
              quality: quality.quality,
              verifiedAt: quality.generatedAt,
              checksPassed: quality.checks.filter((item) => item.status === 'passed').length,
              checksTotal: quality.checks.length,
            }, pendingMermaid ?? undefined)
            setReady(true)
            setStatus(elapsed > 0 ? `画布已就绪 · ${(elapsed / 1000).toFixed(1)}s` : '画布已就绪')
            onNotice(document.drawioXml === EMPTY_DRAWIO_XML ? '可视化画布已校验并自动同步' : 'AI 新画布已通过专业检查并安全应用')
          }).catch((caught) => {
            pendingMermaidRef.current = null
            pendingXmlRef.current = null
            pendingAutosaveXmlRef.current = null
            validatingCandidateRef.current = false
            setReady(false)
            const trusted = document.lastGood?.engine === 'drawio' ? document.lastGood.source : lastLocalXmlRef.current
            if (trusted) bridge.load({ type: 'xml', xml: trusted })
            onNotice(`候选未通过检查，已保留原画布：${caught instanceof Error ? caught.message : '质量检查失败'}`)
          })
          return
        }
        setReady(true)
        setStatus(elapsed > 0 ? `画布已就绪 · ${(elapsed / 1000).toFixed(1)}s` : '画布已就绪')
      },
      onAutosave: ({ xml }) => {
        if (validatingCandidateRef.current) {
          pendingAutosaveXmlRef.current = xml
          return
        }
        lastLocalXmlRef.current = xml
        setSaving(true)
        setStatus('正在保存')
        useWorkspaceStore.getState().updateVisualDocument(document.id, xml, pendingMermaidRef.current ?? undefined)
        pendingMermaidRef.current = null
        void assessDrawioDiagram(xml, 'professional').then((quality) => {
          if (!quality.ok) return
          useWorkspaceStore.getState().markLastGood(document.id, {
            engine: 'drawio',
            source: xml,
            sourceSha256: quality.inputSha256,
            quality: quality.quality,
            verifiedAt: quality.generatedAt,
            checksPassed: quality.checks.filter((item) => item.status === 'passed').length,
            checksTotal: quality.checks.length,
          })
        }).catch(() => undefined)
        if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = window.setTimeout(() => {
          setSaving(false)
          setStatus('已自动保存')
        }, 420)
      },
      onSave: ({ xml }) => {
        if (validatingCandidateRef.current) return
        lastLocalXmlRef.current = xml
        useWorkspaceStore.getState().updateVisualDocument(document.id, xml)
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
    if (!ready) return
    if (needsInitialVisualXmlCapture(document) && document.sourceMermaid) {
      if (pendingMermaidRef.current === document.sourceMermaid) return
      pendingMermaidRef.current = document.sourceMermaid
      lastLocalXmlRef.current = EMPTY_DRAWIO_XML
      setStatus('正在用最新 Mermaid 源码同步可视化画布')
      bridgeRef.current?.load({
        type: 'mermaid',
        mermaid: toDrawioCompatibleMermaid(document.sourceMermaid).source,
        wrap: true,
        sourceMetadataKey: 'mermaidSource',
      })
      return
    }
    if (!xml || xml === lastLocalXmlRef.current) return
    lastLocalXmlRef.current = xml
    bridgeRef.current?.load({ type: 'xml', xml })
    onNotice('已恢复画布版本')
  }, [document.drawioXml, document.sourceMermaid, onNotice, ready])

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
      title={document.sourceDocumentId ? '可视化画布' : '独立可视化画布'}
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

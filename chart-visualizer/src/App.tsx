import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Beaker, CheckCircle2, Layers3, ShieldCheck, Sparkles, Workflow } from 'lucide-react'
import type { DiagramEditorHandle } from '@/components/DiagramEditor'
import { ExportDialog } from '@/components/ExportDialog'
import { Inspector } from '@/components/Inspector'
import { Modal } from '@/components/Modal'
import { PreviewCanvas } from '@/components/PreviewCanvas'
import { ShortcutDialog } from '@/components/ShortcutDialog'
import { Sidebar } from '@/components/Sidebar'
import { SettingsDialog } from '@/components/SettingsDialog'
import { TemplateGallery } from '@/components/TemplateGallery'
import type { VisualCanvasPreset } from '@/components/TemplateGallery'
import { Topbar } from '@/components/Topbar'
import { VisualCanvas, type VisualCanvasHandle } from '@/components/VisualCanvas'
import { VisualExportDialog } from '@/components/VisualExportDialog'
import { VisualInspector } from '@/components/VisualInspector'
import { downloadWorkspace, parseImportFile } from '@/lib/file-io'
import { getResponsiveWorkspaceLayout, getWorkspaceGridTemplate } from '@/lib/workspace-layout'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { RenderError, RenderResult } from '@/types'

const DiagramEditor = lazy(async () => {
  const module = await import('@/components/DiagramEditor')
  return { default: module.DiagramEditor }
})

const visualPresetSources: Partial<Record<VisualCanvasPreset, { title: string; code: string }>> = {
  flowchart: {
    title: '标准业务流程',
    code: `flowchart LR
      start([开始]) --> submit[提交申请]
      submit --> review{审核通过?}
      review -->|通过| execute[执行处理]
      review -->|退回| submit
      execute --> finish([完成])`,
  },
  swimlane: {
    title: '跨部门协作流程',
    code: `flowchart LR
      subgraph requester[申请人]
        submit[提交申请]
        revise[补充资料]
      end
      subgraph reviewer[审核部门]
        review{审核}
      end
      subgraph executor[执行部门]
        execute[执行]
        archive[归档]
      end
      submit --> review
      review -->|退回| revise --> submit
      review -->|通过| execute --> archive`,
  },
}

function useViewportWidth() {
  const [width, setWidth] = useState(() => window.innerWidth)

  useEffect(() => {
    let frame = 0
    const onResize = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => setWidth(window.innerWidth))
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return width
}

function App() {
  const documents = useWorkspaceStore((state) => state.documents)
  const activeId = useWorkspaceStore((state) => state.activeDocumentId)
  const createDocument = useWorkspaceStore((state) => state.createDocument)
  const createVisualDocument = useWorkspaceStore((state) => state.createVisualDocument)
  const convertActiveToVisual = useWorkspaceStore((state) => state.convertActiveToVisual)
  const importDiagram = useWorkspaceStore((state) => state.importDiagram)
  const importWorkspace = useWorkspaceStore((state) => state.importWorkspace)
  const setActiveDocument = useWorkspaceStore((state) => state.setActiveDocument)
  const createVersion = useWorkspaceStore((state) => state.createVersion)
  const preferences = useWorkspaceStore((state) => state.preferences)
  const updatePreferences = useWorkspaceStore((state) => state.updatePreferences)
  const active = documents.find((document) => document.id === activeId)
  const [cachedVisualId, setCachedVisualId] = useState<string | null>(() => active?.engine === 'drawio' ? active.id : null)
  const cachedVisual = documents.find((document) => document.id === cachedVisualId && document.engine === 'drawio')
  const visualIsActive = active?.engine === 'drawio' && cachedVisual?.id === active.id
  const sourceDocument = active?.engine === 'drawio'
    ? documents.find((document) => document.id === active.sourceDocumentId && document.engine === 'mermaid')
      ?? documents.find((document) => document.engine === 'mermaid' && document.code === active.sourceMermaid)
    : undefined
  const editorRef = useRef<DiagramEditorHandle>(null)
  const visualCanvasRef = useRef<VisualCanvasHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [roadmapOpen, setRoadmapOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [convertInfoOpen, setConvertInfoOpen] = useState(false)
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null)
  const [renderError, setRenderError] = useState<RenderError | null>(null)
  const [resizing, setResizing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const viewportWidth = useViewportWidth()
  const layout = getResponsiveWorkspaceLayout(viewportWidth, preferences.workspaceView)

  const handleResult = useCallback((result: RenderResult | null) => setRenderResult(result), [])
  const handleRenderError = useCallback((error: RenderError | null) => setRenderError(error), [])
  const showNotice = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 4200)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.ctrlKey || event.metaKey
      if (command && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setTemplateOpen(true)
      }
      if (command && event.key.toLowerCase() === 's') {
        event.preventDefault()
        createVersion()
        showNotice('已保存本地版本快照')
      }
      if (command && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        setExportOpen(true)
      }
      if (!command && event.key.toLowerCase() === 'n' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) {
        setTemplateOpen(true)
      }
      if (event.key === 'Escape') {
        setTemplateOpen(false)
        setExportOpen(false)
        setShortcutsOpen(false)
        setRoadmapOpen(false)
        setSettingsOpen(false)
        setConvertInfoOpen(false)
        updatePreferences({
          inspectorOpen: false,
          ...(layout.sidebarMode === 'rail' ? { sidebarCollapsed: true } : {}),
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [createVersion, layout.sidebarMode, showNotice, updatePreferences])

  useEffect(() => {
    if (layout.sidebarMode === 'rail') updatePreferences({ sidebarCollapsed: true })
  }, [layout.sidebarMode, updatePreferences])

  useEffect(() => {
    if (layout.inspectorMode === 'overlay') updatePreferences({ inspectorOpen: false })
  }, [layout.inspectorMode, updatePreferences])

  useEffect(() => {
    if (active?.engine === 'drawio') setCachedVisualId(active.id)
  }, [active?.engine, active?.id])

  useEffect(() => {
    if (!visualIsActive) return
    const frame = window.requestAnimationFrame(() => visualCanvasRef.current?.fit())
    return () => window.cancelAnimationFrame(frame)
  }, [visualIsActive])

  useEffect(() => {
    if (!resizing) return
    const onMove = (event: PointerEvent) => {
      const container = workspaceRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const maximum = Math.max(340, Math.min(520, rect.width - 566))
      const minimum = Math.min(340, maximum)
      const editorWidth = Math.max(minimum, Math.min(maximum, event.clientX - rect.left))
      updatePreferences({ editorRatio: (editorWidth / rect.width) * 100 })
    }
    const onUp = () => setResizing(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [resizing, updatePreferences])

  const handleFileImport = async (file?: File) => {
    if (!file) return
    try {
      const parsed = await parseImportFile(file)
      if (parsed.type === 'workspace') {
        if (window.confirm(`备份中包含 ${parsed.documents.length} 个图表。导入后将替换当前本地工作区，是否继续？`)) {
          importWorkspace(parsed.documents)
          showNotice(`已恢复 ${parsed.documents.length} 个图表`)
        }
      } else if (parsed.type === 'visual') {
        createVisualDocument(parsed.title, parsed.drawioXml)
        showNotice(`已导入可视化画布“${parsed.title}”`)
      } else {
        importDiagram(parsed.title, parsed.code)
        showNotice(`已导入“${parsed.title}”`)
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '文件导入失败，请检查文件格式。')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className={`app-shell layout-${layout.breakpoint} ${resizing ? 'is-resizing' : ''}`}>
      <Sidebar onNew={() => setTemplateOpen(true)} />
      {!preferences.sidebarCollapsed && (
        <button
          className="sidebar-scrim"
          onClick={() => updatePreferences({ sidebarCollapsed: true })}
          aria-label="关闭项目栏"
        />
      )}
      <div className="app-main">
        <Topbar
          view={layout.view}
          onViewChange={(workspaceView) => updatePreferences({ workspaceView })}
          onExport={() => setExportOpen(true)}
          onImport={() => fileInputRef.current?.click()}
          onBackup={() => { downloadWorkspace(documents); showNotice('工作区备份已下载') }}
          onShortcuts={() => setShortcutsOpen(true)}
          onResearch={() => setRoadmapOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onConvertToVisual={() => {
            const created = convertActiveToVisual()
            if (created) showNotice('已创建可视化副本，原 Mermaid 图保持不变')
          }}
          onReturnToSource={sourceDocument ? () => {
            setActiveDocument(sourceDocument.id)
            showNotice('已返回 Mermaid 原图，可视化画布仍在后台保持')
          } : undefined}
        />

        <div className={`workspace-row view-${active?.engine === 'drawio' ? 'canvas' : layout.view} inspector-${layout.inspectorMode}`}>
          {cachedVisual && (
            <div className={`visual-workspace ${visualIsActive ? 'is-active' : 'is-cached'}`} aria-hidden={!visualIsActive}>
              <VisualCanvas
                ref={visualCanvasRef}
                key={cachedVisual.id}
                document={cachedVisual}
                onConvertInfo={() => setConvertInfoOpen(true)}
                onNotice={showNotice}
              />
            </div>
          )}
          {active?.engine !== 'drawio' && (
            <div
              ref={workspaceRef}
              className="editor-preview-workspace"
              style={{ gridTemplateColumns: getWorkspaceGridTemplate(layout.view, preferences.editorRatio) }}
            >
              <Suspense fallback={<section className="editor-panel editor-loading" aria-label="正在加载源码编辑器">正在加载专业编辑器…</section>}>
                <DiagramEditor ref={editorRef} onHideSource={() => updatePreferences({ workspaceView: 'canvas' })} />
              </Suspense>
              <button
                className="workspace-resizer"
                onPointerDown={() => setResizing(true)}
                onDoubleClick={() => updatePreferences({ editorRatio: 38 })}
                aria-label="调整编辑区宽度"
                title="拖动调整源码宽度，双击恢复默认"
              ><span /></button>
              <PreviewCanvas
                onResult={handleResult}
                onError={handleRenderError}
                onFocusError={(line) => editorRef.current?.focusLine(line)}
                onShowSource={layout.view === 'canvas' ? () => updatePreferences({ workspaceView: 'split' }) : undefined}
              />
            </div>
          )}
          {active && preferences.inspectorOpen && (
            <>
              <button
                className="inspector-scrim"
                onClick={() => updatePreferences({ inspectorOpen: false })}
                aria-label="关闭工具面板"
              />
              {active.engine === 'mermaid' ? (
                <Inspector
                  onInsert={(code) => editorRef.current?.insert(code)}
                  onClose={() => updatePreferences({ inspectorOpen: false })}
                  onOpenSettings={() => setSettingsOpen(true)}
                  renderError={renderError}
                />
              ) : (
                <VisualInspector
                  document={active}
                  onApplyXml={(xml) => {
                    try {
                      visualCanvasRef.current?.loadXml(xml)
                      showNotice('AI 修改正在应用到可视化画布')
                    } catch (error) {
                      showNotice(error instanceof Error ? error.message : '画布暂时无法接收 AI 修改')
                    }
                  }}
                  onApplyMermaid={(mermaid) => {
                    try {
                      visualCanvasRef.current?.loadMermaid(mermaid)
                      showNotice('AI 结构正在转换为可视化画布')
                    } catch (error) {
                      showNotice(error instanceof Error ? error.message : '画布暂时无法接收 AI 结构')
                    }
                  }}
                  onClose={() => updatePreferences({ inspectorOpen: false })}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
              )}
            </>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept=".mmd,.mermaid,.md,.txt,.json,.drawio,text/plain,application/json,application/xml,text/xml"
        onChange={(event) => handleFileImport(event.target.files?.[0])}
      />

      <TemplateGallery
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onSelect={(templateId) => {
          createDocument(templateId)
          setTemplateOpen(false)
          showNotice('已从模板创建新图表')
        }}
        onCreateVisual={(preset) => {
          const seed = visualPresetSources[preset]
          createVisualDocument(seed?.title ?? '空白专业画布', undefined, seed?.code)
          setTemplateOpen(false)
          showNotice(seed ? '已创建可自由编辑的画布模板' : '已创建空白专业画布')
        }}
      />
      {active?.engine === 'mermaid' && (
        <ExportDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          title={active.title}
          code={active.code}
          result={renderResult}
        />
      )}
      {active?.engine === 'drawio' && (
        <VisualExportDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          onSuccess={(fileName) => showNotice(`已生成并开始下载：${fileName}`)}
          title={active.title}
          fallbackXml={active.drawioXml ?? ''}
          onExport={(format) => {
            const canvas = visualCanvasRef.current
            if (!canvas) return Promise.reject(new Error('画布尚未准备完成。'))
            return canvas.exportDiagram(format, format === 'png' ? { scale: 2, border: 16 } : { border: 16 })
          }}
        />
      )}
      <ShortcutDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onImport={() => fileInputRef.current?.click()}
        onBackup={() => { downloadWorkspace(documents); showNotice('工作区备份已下载') }}
      />
      <Modal open={roadmapOpen} onClose={() => setRoadmapOpen(false)} title="从编辑器到商业产品" description="基于 12 类主流工具官方资料形成的产品路线。" size="large">
        <div className="roadmap-summary">
          <div className="roadmap-positioning">
            <span><Workflow size={22} /></span>
            <div><p className="eyebrow">产品定位</p><h3>中文工作场景的本地优先专业制图工作台</h3><p>用模板、结构化编辑和 Mermaid 源码完成流程、泳道与架构成果，并稳定交付到文档和演示。</p></div>
          </div>
          <div className="roadmap-grid">
            <article><CheckCircle2 size={19} /><strong>本轮已落地</strong><p>Mermaid 11.16、CPA / DeepSeek AI、专业源码编辑，以及可拖拽的 draw.io 画布、自动保存、版本与多格式交付。</p></article>
            <article><Layers3 size={19} /><strong>下一核心</strong><p>画布 AI 局部编辑、结构化图模型、私有化画布部署、Visio 导入增强、PDF/PPTX 组合交付与质量检查。</p></article>
            <article><ShieldCheck size={19} /><strong>产品原则</strong><p>源码始终可带走，默认不上传；不承诺所有图种像素级双向，优先保证成果稳定可维护。</p></article>
            <article><Sparkles size={19} /><strong>后续增强</strong><p>AI 局部选择编辑、表格导入、协作、团队模板、账号、积分与计费，在核心复用率得到验证后接入。</p></article>
          </div>
          <div className="roadmap-note"><Beaker size={17} /><p>完整竞品证据、P0/P1/P2 清单和发布门槛已写入 <code>docs/market-research.md</code>。</p></div>
        </div>
      </Modal>
      <Modal open={convertInfoOpen} onClose={() => setConvertInfoOpen(false)} title="两种编辑方式如何配合" description="让快速生成和精细排版各自做最擅长的事。" size="medium">
        <div className="conversion-guide">
          <article><span>1</span><div><strong>Mermaid 负责快速生成</strong><p>适合 AI 生成、源码维护、批量修改和结构稳定的流程图。</p></div></article>
          <article><span>2</span><div><strong>转换时创建可视化副本</strong><p>原 Mermaid 图不会改变，副本进入自由拖拽、排版和样式编辑。</p></div></article>
          <article><span>3</span><div><strong>画布独立保存为 draw.io XML</strong><p>因为自由移动后的图形无法可靠还原成所有 Mermaid 语法，所以不做误导性的强制双向覆盖。</p></div></article>
          <div><ShieldCheck size={17} /><p>两份文档都保存在本机；转换、排版或导出不会删除原始图表。</p></div>
        </div>
      </Modal>

      {notice && <div className="toast-notice"><CheckCircle2 size={16} />{notice}</div>}
    </div>
  )
}

export default App

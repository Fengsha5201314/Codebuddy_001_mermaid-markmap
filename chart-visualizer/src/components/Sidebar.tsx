import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  FileCode2,
  Folder,
  FolderPlus,
  Frame,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { DiagramDocument, DiagramKind, DiagramProject } from '@/types'
import packageInfo from '../../package.json'

const kindLabels: Record<DiagramKind, string> = {
  flowchart: '流程',
  swimlane: '泳道',
  architecture: '架构',
  sequence: '时序',
  class: '类图',
  state: '状态',
  er: 'ERD',
  gantt: '甘特',
  mindmap: '脑图',
  journey: '旅程',
  c4: 'C4',
  other: '图表',
}

interface SidebarProps {
  onNew: () => void
}

function DocumentItem({ document, depth = 0 }: { document: DiagramDocument; depth?: number }) {
  const documents = useWorkspaceStore((state) => state.documents)
  const activeId = useWorkspaceStore((state) => state.activeDocumentId)
  const setActive = useWorkspaceStore((state) => state.setActiveDocument)
  const duplicate = useWorkspaceStore((state) => state.duplicateDocument)
  const remove = useWorkspaceStore((state) => state.deleteDocument)
  const favorite = useWorkspaceStore((state) => state.toggleFavorite)
  const [menuOpen, setMenuOpen] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const activeDocument = documents.find((item) => item.id === activeId)
  const visualMode = documents.some((item) => item.engine === 'drawio' && item.sourceDocumentId === document.id)
  const isActive = activeId === document.id || activeDocument?.sourceDocumentId === document.id

  useEffect(() => {
    if (!menuOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    globalThis.document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      globalThis.document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  const handleDelete = () => {
    if (window.confirm(`确认删除“${document.title}”吗？其他图表不会受影响。`)) remove(document.id)
    setMenuOpen(false)
  }

  return (
    <div ref={rowRef} className={`document-row ${isActive ? 'active' : ''}`} style={{ '--tree-depth': depth } as CSSProperties}>
      <button className="document-main" onClick={() => setActive(document.id)}>
        <span
          className={`kind-mark ${document.engine === 'drawio' ? 'kind-visual' : `kind-${document.kind}`}`}
          title={document.engine === 'drawio' ? '可视化画布文档' : 'Mermaid 代码图表'}
        >
          {document.engine === 'drawio' ? '画布' : kindLabels[document.kind]}
        </span>
        <span className="document-copy">
          <strong>{document.title}</strong>
          <small>{new Date(document.updatedAt).toLocaleDateString('zh-CN')}{visualMode ? ' · 双画布' : ''}</small>
        </span>
      </button>
      <button className="document-more" onClick={() => setMenuOpen((value) => !value)} aria-label="更多操作">
        <MoreHorizontal size={16} />
      </button>
      {menuOpen && (
        <div className="document-menu">
          <button onClick={() => { favorite(document.id); setMenuOpen(false) }}>
            <Star size={14} />{document.favorite ? '取消收藏' : '收藏'}
          </button>
          <button onClick={() => { duplicate(document.id); setMenuOpen(false) }}>
            <Copy size={14} />创建副本
          </button>
          <button className="danger" onClick={handleDelete}>
            <Trash2 size={14} />删除
          </button>
        </div>
      )}
    </div>
  )
}

function ProjectGroup({ project, documents, forceOpen, onCreateChild }: {
  project: DiagramProject
  documents: DiagramDocument[]
  forceOpen: boolean
  onCreateChild: (projectId: string, parentDocumentId?: string) => void
}) {
  const activeId = useWorkspaceStore((state) => state.activeDocumentId)
  const renameProject = useWorkspaceStore((state) => state.renameProject)
  const deleteProject = useWorkspaceStore((state) => state.deleteProject)
  const [expanded, setExpanded] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const canonical = documents.filter((document) => !document.sourceDocumentId)
  const activeDocument = documents.find((document) => document.id === activeId)
  const active = activeDocument?.sourceDocumentId
    ? canonical.find((document) => document.id === activeDocument.sourceDocumentId)
    : canonical.find((document) => document.id === activeId)

  useEffect(() => {
    if (forceOpen || active) setExpanded(true)
  }, [active, forceOpen])

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    globalThis.document.addEventListener('pointerdown', close)
    return () => globalThis.document.removeEventListener('pointerdown', close)
  }, [menuOpen])

  const renderBranch = (parentDocumentId?: string, depth = 0, visited = new Set<string>()): ReactNode => (
    canonical
      .filter((document) => document.parentDocumentId === parentDocumentId || (!parentDocumentId && document.parentDocumentId && !canonical.some((item) => item.id === document.parentDocumentId)))
      .sort((a, b) => a.order - b.order || b.updatedAt.localeCompare(a.updatedAt))
      .map((document) => {
        if (visited.has(document.id)) return null
        const nextVisited = new Set(visited).add(document.id)
        return (
          <div key={document.id}>
            <DocumentItem document={document} depth={depth} />
            {renderBranch(document.id, depth + 1, nextVisited)}
          </div>
        )
      })
  )

  const rename = () => {
    const value = window.prompt('项目名称', project.title)
    if (value?.trim()) renameProject(project.id, value)
    setMenuOpen(false)
  }

  return (
    <section className="project-group" ref={ref}>
      <div className={`project-row ${active ? 'active' : ''}`}>
        <button className="project-main" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Folder size={15} />
          <span><strong>{project.title}</strong><small>{canonical.length} 个图表</small></span>
        </button>
        <button className="project-add" onClick={() => onCreateChild(project.id, active?.id)} title={active ? `在“${active.title}”下新建子图` : '在项目中新增图表'} aria-label="在项目中新增图表"><Plus size={14} /></button>
        <button className="project-more" onClick={() => setMenuOpen((value) => !value)} aria-label="项目操作"><MoreHorizontal size={15} /></button>
        {menuOpen && (
          <div className="document-menu project-menu">
            <button onClick={rename}><Folder size={14} />重命名项目</button>
            <button onClick={() => { onCreateChild(project.id, active?.id); setMenuOpen(false) }}><FolderPlus size={14} />新增子图</button>
            <button className="danger" onClick={() => {
              if (window.confirm(`删除项目“${project.title}”及其中 ${canonical.length} 个图表？此操作无法撤销。`)) deleteProject(project.id)
              setMenuOpen(false)
            }}><Trash2 size={14} />删除项目</button>
          </div>
        )}
      </div>
      {expanded && <div className="project-documents">{renderBranch()}</div>}
    </section>
  )
}

export function Sidebar({ onNew }: SidebarProps) {
  const projects = useWorkspaceStore((state) => state.projects)
  const documents = useWorkspaceStore((state) => state.documents)
  const activeId = useWorkspaceStore((state) => state.activeDocumentId)
  const preferences = useWorkspaceStore((state) => state.preferences)
  const updatePreferences = useWorkspaceStore((state) => state.updatePreferences)
  const createDocument = useWorkspaceStore((state) => state.createDocument)
  const [query, setQuery] = useState('')
  const active = documents.find((document) => document.id === activeId)

  const visibleProjects = useMemo(() => {
    const search = query.trim().toLowerCase()
    return projects.flatMap((project) => {
      const projectDocuments = documents.filter((document) => document.projectId === project.id)
      const matchesProject = project.title.toLowerCase().includes(search)
      const filtered = !search || matchesProject
        ? projectDocuments
        : projectDocuments.filter((document) => [document.title, document.description, ...document.tags].join(' ').toLowerCase().includes(search))
      return filtered.some((document) => !document.sourceDocumentId) ? [{ project, documents: filtered }] : []
    }).sort((a, b) => b.project.updatedAt.localeCompare(a.project.updatedAt))
  }, [documents, projects, query])

  if (preferences.sidebarCollapsed) {
    return (
      <aside className="sidebar sidebar-collapsed">
        <img className="brand-symbol" src="/fengsha-icon.png" alt="风沙" title={`风沙图表工作台 v${packageInfo.version}`} />
        <button className="rail-button primary" onClick={onNew} title="新建图表"><Plus size={19} /></button>
        <button className="rail-button" onClick={() => updatePreferences({ sidebarCollapsed: false })} title="展开项目栏">
          <ChevronsRight size={19} />
        </button>
      </aside>
    )
  }

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <img className="brand-symbol" src="/fengsha-icon.png" alt="风沙" />
        <div>
          <strong>风沙</strong>
          <span>智能制图工作台 · v{packageInfo.version}</span>
        </div>
        <button className="icon-button quiet collapse-button" onClick={() => updatePreferences({ sidebarCollapsed: true })} aria-label="收起项目栏">
          <ChevronsLeft size={17} />
        </button>
      </div>

      <button className="new-diagram-button" onClick={onNew}>
        <Plus size={17} />
        <span>从模板新建</span>
        <kbd>N</kbd>
      </button>

      <label className="sidebar-search">
        <Search size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索本地图表" />
      </label>

      <div className="section-label">
        <span>本地项目</span>
        <em>{projects.length}</em>
      </div>

      <div className="document-list">
        {visibleProjects.map(({ project, documents: projectDocuments }) => (
          <ProjectGroup
            key={project.id}
            project={project}
            documents={projectDocuments}
            forceOpen={Boolean(query)}
            onCreateChild={(projectId, parentDocumentId) => createDocument(undefined, projectId, parentDocumentId)}
          />
        ))}
        {!visibleProjects.length && (
          <div className="sidebar-empty">
            {query ? <FileCode2 size={24} /> : <Frame size={24} />}
            <p>没有匹配的图表</p>
          </div>
        )}
      </div>

      <div className="local-trust">
        <span className="trust-dot" />
        <div>
          <strong>{active?.engine === 'drawio' ? '项目记录保存在本机' : '数据仅保存在本机'}</strong>
          <small>{active?.engine === 'drawio' ? '画布组件经 diagrams.net 加载' : '无需登录 · 自动保存'}</small>
        </div>
      </div>
    </aside>
  )
}

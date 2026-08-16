import { useMemo, useState } from 'react'
import {
  ChevronsLeft,
  ChevronsRight,
  Copy,
  FileCode2,
  Frame,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { DiagramDocument, DiagramKind } from '@/types'
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

function DocumentItem({ document }: { document: DiagramDocument }) {
  const activeId = useWorkspaceStore((state) => state.activeDocumentId)
  const setActive = useWorkspaceStore((state) => state.setActiveDocument)
  const duplicate = useWorkspaceStore((state) => state.duplicateDocument)
  const remove = useWorkspaceStore((state) => state.deleteDocument)
  const favorite = useWorkspaceStore((state) => state.toggleFavorite)
  const [menuOpen, setMenuOpen] = useState(false)

  const handleDelete = () => {
    if (window.confirm(`确认删除“${document.title}”吗？其他图表不会受影响。`)) remove(document.id)
    setMenuOpen(false)
  }

  return (
    <div className={`document-row ${activeId === document.id ? 'active' : ''}`}>
      <button className="document-main" onClick={() => setActive(document.id)}>
        <span
          className={`kind-mark ${document.engine === 'drawio' ? 'kind-visual' : `kind-${document.kind}`}`}
          title={document.engine === 'drawio' ? '可视化画布文档' : 'Mermaid 代码图表'}
        >
          {document.engine === 'drawio' ? '画布' : kindLabels[document.kind]}
        </span>
        <span className="document-copy">
          <strong>{document.title}</strong>
          <small>{new Date(document.updatedAt).toLocaleDateString('zh-CN')}</small>
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

export function Sidebar({ onNew }: SidebarProps) {
  const documents = useWorkspaceStore((state) => state.documents)
  const activeId = useWorkspaceStore((state) => state.activeDocumentId)
  const preferences = useWorkspaceStore((state) => state.preferences)
  const updatePreferences = useWorkspaceStore((state) => state.updatePreferences)
  const [query, setQuery] = useState('')
  const active = documents.find((document) => document.id === activeId)

  const visibleDocuments = useMemo(() => {
    const search = query.trim().toLowerCase()
    return [...documents]
      .filter((document) => !search || [document.title, document.description, ...document.tags].join(' ').toLowerCase().includes(search))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt.localeCompare(a.updatedAt))
  }, [documents, query])

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
        <em>{documents.length}</em>
      </div>

      <div className="document-list">
        {visibleDocuments.map((document) => <DocumentItem key={document.id} document={document} />)}
        {!visibleDocuments.length && (
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

export type DiagramKind =
  | 'flowchart'
  | 'swimlane'
  | 'architecture'
  | 'sequence'
  | 'class'
  | 'state'
  | 'er'
  | 'gantt'
  | 'mindmap'
  | 'journey'
  | 'c4'
  | 'other'

export type DiagramThemeId = 'paper' | 'blueprint' | 'executive' | 'forest' | 'midnight'

export type WorkspaceView = 'canvas' | 'split' | 'source'

export type DiagramEngine = 'mermaid' | 'drawio'

export interface DiagramVersion {
  id: string
  engine: DiagramEngine
  /** Mermaid source; kept on every snapshot for backward-compatible callers. */
  code: string
  /** Native draw.io XML for visual-canvas snapshots. */
  drawioXml?: string
  /** Mermaid source used to seed a visual document, when one exists. */
  sourceMermaid?: string
  /** Original Mermaid document for a converted visual copy. */
  sourceDocumentId?: string
  createdAt: string
  label: string
}

export interface DiagramDocument {
  id: string
  title: string
  description: string
  engine: DiagramEngine
  /** Mermaid source for Mermaid documents; compatibility mirror for visual documents. */
  code: string
  /** Native draw.io XML. Required by the data normalizer when engine is drawio. */
  drawioXml?: string
  /** Optional Mermaid source from which a visual document was created. */
  sourceMermaid?: string
  /** Original Mermaid document for a converted visual copy. */
  sourceDocumentId?: string
  kind: DiagramKind
  themeId: DiagramThemeId
  favorite: boolean
  tags: string[]
  createdAt: string
  updatedAt: string
  versions: DiagramVersion[]
}

export interface DiagramTemplate {
  id: string
  title: string
  description: string
  category: '业务流程' | '系统架构' | '研发设计' | '项目管理'
  kind: DiagramKind
  code: string
  accent: string
  featured?: boolean
  beta?: boolean
}

export interface DiagramTheme {
  id: DiagramThemeId
  name: string
  description: string
  mermaidTheme: 'base' | 'dark' | 'forest' | 'neutral'
  canvas: string
  surface: string
  text: string
  primary: string
  secondary: string
  line: string
  note: string
}

export interface RenderResult {
  svg: string
  width: number
  height: number
  kind: DiagramKind
}

export interface RenderError {
  message: string
  line?: number
  raw: string
}

export interface ExportOptions {
  format: 'svg' | 'png' | 'jpeg' | 'mmd' | 'markdown'
  fileName: string
  scale: number
  padding: number
  background: string | 'transparent'
}

export type VisualEditorMode = 'local' | 'online'

export interface WorkspacePreferences {
  editorRatio: number
  workspaceView: WorkspaceView
  sidebarCollapsed: boolean
  inspectorOpen: boolean
  canvasGrid: boolean
  renderDelay: number
  visualEditorMode: VisualEditorMode
  visualEditorOnlineFallback: boolean
  aiEnabledModels: Array<{
    provider: 'cpa' | 'deepseek' | 'custom'
    model: string
  }>
  aiSelectedModel: string
}

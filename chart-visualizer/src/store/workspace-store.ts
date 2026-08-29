import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { defaultTemplate, getTemplate } from '@/data/templates'
import { detectDiagramKind } from '@/lib/diagram-engine'
import { EMPTY_DRAWIO_XML, normalizeWorkspaceDocuments, normalizeWorkspaceProjects } from '@/lib/workspace-data'
import type { DiagramDocument, DiagramLastGood, DiagramProject, DiagramThemeId, DiagramVersion, WorkspacePreferences, WorkspaceView } from '@/types'

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function now(): string {
  return new Date().toISOString()
}

function projectFromDocument(document: DiagramDocument): DiagramProject {
  return {
    id: document.projectId,
    title: document.title,
    description: document.description,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }
}

function documentFromTemplate(templateId = defaultTemplate.id, projectId = id('project'), parentDocumentId?: string): DiagramDocument {
  const template = getTemplate(templateId) ?? defaultTemplate
  const timestamp = now()
  return {
    id: id('diagram'),
    projectId,
    ...(parentDocumentId ? { parentDocumentId } : {}),
    order: Date.now(),
    title: template.title,
    description: template.description,
    engine: 'mermaid',
    code: template.code,
    kind: template.kind,
    themeId: template.kind === 'architecture' ? 'blueprint' : 'paper',
    favorite: false,
    tags: [template.category],
    createdAt: timestamp,
    updatedAt: timestamp,
    versions: [],
  }
}

const starter = documentFromTemplate()
const starterProject = projectFromDocument(starter)

interface WorkspaceState {
  projects: DiagramProject[]
  documents: DiagramDocument[]
  activeProjectId: string
  activeDocumentId: string
  preferences: WorkspacePreferences
  createDocument: (templateId?: string, projectId?: string, parentDocumentId?: string) => string
  renameProject: (projectId: string, title: string) => void
  deleteProject: (projectId: string) => void
  createVisualDocument: (title?: string, drawioXml?: string, sourceMermaid?: string) => string
  convertActiveToVisual: (drawioXml?: string, refreshFromSource?: boolean) => string | undefined
  importDiagram: (title: string, code: string) => string
  importWorkspace: (documents: DiagramDocument[], projects?: DiagramProject[]) => void
  setActiveDocument: (id: string) => void
  updateActiveDocument: (patch: Partial<Omit<DiagramDocument, 'id' | 'createdAt'>>) => void
  updateCode: (code: string) => void
  updateVisualSource: (drawioXml: string, sourceMermaid?: string) => void
  updateVisualDocument: (documentId: string, drawioXml: string, sourceMermaid?: string) => void
  markLastGood: (documentId: string, value: DiagramLastGood) => void
  commitValidatedCandidate: (documentId: string, source: string, value: DiagramLastGood, sourceMermaid?: string) => boolean
  setTheme: (themeId: DiagramThemeId) => void
  toggleFavorite: (id: string) => void
  duplicateDocument: (id: string) => string | undefined
  deleteDocument: (id: string) => void
  createVersion: (label?: string) => void
  restoreVersion: (versionId: string) => void
  updatePreferences: (patch: Partial<WorkspacePreferences>) => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      projects: [starterProject],
      documents: [starter],
      activeProjectId: starter.projectId,
      activeDocumentId: starter.id,
      preferences: {
        editorRatio: 38,
        inspectorWidth: 480,
        workspaceView: 'split',
        sidebarCollapsed: false,
        inspectorOpen: false,
        canvasGrid: true,
        renderDelay: 280,
        visualEditorMode: 'local',
        visualEditorOnlineFallback: true,
        aiEnabledModels: [],
        aiSelectedModel: '',
      },

      createDocument: (templateId, targetProjectId, parentDocumentId) => {
        const document = documentFromTemplate(templateId, targetProjectId ?? id('project'), parentDocumentId)
        set((state) => ({
          projects: targetProjectId
            ? state.projects.map((project) => project.id === targetProjectId ? { ...project, updatedAt: document.updatedAt } : project)
            : [projectFromDocument(document), ...state.projects],
          documents: [document, ...state.documents],
          activeProjectId: document.projectId,
          activeDocumentId: document.id,
        }))
        return document.id
      },

      renameProject: (projectId, title) => {
        const nextTitle = title.trim()
        if (!nextTitle) return
        set((state) => ({ projects: state.projects.map((project) => project.id === projectId
          ? { ...project, title: nextTitle, updatedAt: now() }
          : project) }))
      },

      deleteProject: (projectId) => {
        const state = get()
        if (state.projects.length <= 1) return
        const projects = state.projects.filter((project) => project.id !== projectId)
        const documents = state.documents.filter((document) => document.projectId !== projectId)
        if (!documents.length) return
        const activeRemoved = state.activeProjectId === projectId
        const nextDocument = activeRemoved
          ? documents.find((document) => document.projectId === projects[0].id) ?? documents[0]
          : documents.find((document) => document.id === state.activeDocumentId) ?? documents[0]
        set({ projects, documents, activeProjectId: nextDocument.projectId, activeDocumentId: nextDocument.id })
      },

      createVisualDocument: (title, drawioXml = EMPTY_DRAWIO_XML, sourceMermaid) => {
        const timestamp = now()
        const mermaidSource = sourceMermaid ?? ''
        const projectId = id('project')
        const document: DiagramDocument = {
          id: id('diagram'),
          projectId,
          order: Date.now(),
          title: title?.trim() || '未命名画布',
          description: '可视化画布图',
          engine: 'drawio',
          code: mermaidSource,
          drawioXml: drawioXml.trim() || EMPTY_DRAWIO_XML,
          ...(sourceMermaid !== undefined ? { sourceMermaid } : {}),
          kind: detectDiagramKind(mermaidSource),
          themeId: 'paper',
          favorite: false,
          tags: ['可视化'],
          createdAt: timestamp,
          updatedAt: timestamp,
          versions: [],
        }
        set((state) => ({
          projects: [projectFromDocument(document), ...state.projects],
          documents: [document, ...state.documents],
          activeProjectId: document.projectId,
          activeDocumentId: document.id,
        }))
        return document.id
      },

      convertActiveToVisual: (drawioXml = EMPTY_DRAWIO_XML, refreshFromSource = false) => {
        const source = get().documents.find((document) => document.id === get().activeDocumentId)
        if (!source || source.engine !== 'mermaid') return undefined
        const existing = get().documents.find(
          (document) => document.engine === 'drawio' && document.sourceDocumentId === source.id,
        )
        if (existing) {
          set((state) => ({
            documents: refreshFromSource
              ? state.documents.map((document) => document.id === existing.id ? {
                ...document,
                title: source.title,
                code: source.code,
                drawioXml: drawioXml.trim() || EMPTY_DRAWIO_XML,
                sourceMermaid: source.code,
                kind: detectDiagramKind(source.code),
                updatedAt: now(),
              } : document)
              : state.documents.map((document) => document.id === existing.id
                ? { ...document, title: source.title }
                : document),
            activeDocumentId: existing.id,
          }))
          return existing.id
        }
        const timestamp = now()
        const document: DiagramDocument = {
          ...source,
          id: id('diagram'),
          title: source.title,
          description: source.description || '包含 Mermaid 源码与可视化画布的双模式图表',
          engine: 'drawio',
          code: source.code,
          drawioXml: drawioXml.trim() || EMPTY_DRAWIO_XML,
          sourceMermaid: source.code,
          sourceDocumentId: source.id,
          favorite: false,
          tags: [...new Set([...source.tags, '可视化'])],
          versions: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        set((state) => ({ documents: [document, ...state.documents], activeProjectId: document.projectId, activeDocumentId: document.id }))
        return document.id
      },

      importDiagram: (title, code) => {
        const timestamp = now()
        const document: DiagramDocument = {
          id: id('diagram'),
          projectId: id('project'),
          order: Date.now(),
          title: title || '导入的图表',
          description: '从本地文件导入',
          engine: 'mermaid',
          code,
          kind: detectDiagramKind(code),
          themeId: 'paper',
          favorite: false,
          tags: ['导入'],
          createdAt: timestamp,
          updatedAt: timestamp,
          versions: [],
        }
        set((state) => ({
          projects: [projectFromDocument(document), ...state.projects],
          documents: [document, ...state.documents],
          activeProjectId: document.projectId,
          activeDocumentId: document.id,
        }))
        return document.id
      },

      importWorkspace: (documents, projectsInput) => {
        const valid = normalizeWorkspaceDocuments(documents)
        if (!valid.length) return
        const projects = normalizeWorkspaceProjects(projectsInput, valid)
        set({ projects, documents: valid, activeProjectId: valid[0].projectId, activeDocumentId: valid[0].id })
      },

      setActiveDocument: (documentId) => {
        const document = get().documents.find((item) => item.id === documentId)
        if (document) set({ activeProjectId: document.projectId, activeDocumentId: documentId })
      },

      updateActiveDocument: (patch) => {
        const activeId = get().activeDocumentId
        const active = get().documents.find((document) => document.id === activeId)
        const timestamp = now()
        const linkedIds = new Set<string>([activeId])
        if (patch.title !== undefined && active) {
          if (active.engine === 'drawio' && active.sourceDocumentId) linkedIds.add(active.sourceDocumentId)
          if (active.engine === 'mermaid') {
            get().documents
              .filter((document) => document.sourceDocumentId === active.id)
              .forEach((document) => linkedIds.add(document.id))
          }
        }
        set((state) => ({
          projects: active
            ? state.projects.map((project) => project.id === active.projectId
              ? {
                  ...project,
                  ...(patch.title !== undefined && state.documents.filter((item) => item.projectId === active.projectId && !item.sourceDocumentId).length === 1
                    ? { title: patch.title || project.title }
                    : {}),
                  updatedAt: timestamp,
                }
              : project)
            : state.projects,
          documents: state.documents.map((document) => {
            if (document.id === activeId) return { ...document, ...patch, updatedAt: timestamp }
            if (patch.title !== undefined && linkedIds.has(document.id)) {
              return { ...document, title: patch.title, updatedAt: timestamp }
            }
            return document
          }),
        }))
      },

      updateCode: (code) => {
        const active = get().documents.find((document) => document.id === get().activeDocumentId)
        if (active?.engine !== 'mermaid') return
        get().updateActiveDocument({ code, kind: detectDiagramKind(code) })
      },

      updateVisualSource: (drawioXml, sourceMermaid) => {
        get().updateVisualDocument(get().activeDocumentId, drawioXml, sourceMermaid)
      },

      updateVisualDocument: (documentId, drawioXml, sourceMermaid) => {
        if (!drawioXml.trim()) return
        const active = get().documents.find((document) => document.id === documentId && document.engine === 'drawio')
        if (!active) return
        const timestamp = now()
        set((state) => ({
          projects: active
            ? state.projects.map((project) => project.id === active.projectId ? { ...project, updatedAt: timestamp } : project)
            : state.projects,
          documents: state.documents.map((document) => {
            if (sourceMermaid !== undefined && active?.sourceDocumentId === document.id && document.engine === 'mermaid') {
              return { ...document, code: sourceMermaid, kind: detectDiagramKind(sourceMermaid), updatedAt: timestamp }
            }
            if (document.id !== documentId || document.engine !== 'drawio') return document
            if (sourceMermaid === undefined) {
              return { ...document, drawioXml, updatedAt: timestamp }
            }
            return {
              ...document,
              code: sourceMermaid,
              drawioXml,
              sourceMermaid,
              kind: detectDiagramKind(sourceMermaid),
              updatedAt: timestamp,
            }
          }),
        }))
      },

      markLastGood: (documentId, value) => {
        set((state) => ({
          documents: state.documents.map((document) => document.id === documentId
            ? { ...document, lastGood: value }
            : document),
        }))
      },

      commitValidatedCandidate: (documentId, source, value, sourceMermaid) => {
        const current = get().documents.find((document) => document.id === documentId)
        if (!current || current.engine !== value.engine || !source.trim()) return false
        const timestamp = now()
        set((state) => ({
          projects: state.projects.map((project) => project.id === current.projectId
            ? { ...project, updatedAt: timestamp }
            : project),
          documents: state.documents.map((document) => {
            if (sourceMermaid !== undefined && current.engine === 'drawio' && current.sourceDocumentId === document.id && document.engine === 'mermaid') {
              return { ...document, code: sourceMermaid, kind: detectDiagramKind(sourceMermaid), updatedAt: timestamp }
            }
            if (document.id !== documentId) return document
            const snapshot: DiagramVersion = {
              id: id('version'),
              engine: document.engine,
              code: document.code,
              ...(document.engine === 'drawio' ? {
                drawioXml: document.drawioXml ?? EMPTY_DRAWIO_XML,
                ...(document.sourceMermaid !== undefined ? { sourceMermaid: document.sourceMermaid } : {}),
              } : {}),
              createdAt: timestamp,
              label: '候选应用前',
            }
            if (document.engine === 'mermaid') {
              return {
                ...document,
                code: source,
                kind: detectDiagramKind(source),
                lastGood: value,
                versions: [snapshot, ...document.versions].slice(0, 30),
                updatedAt: timestamp,
              }
            }
            return {
              ...document,
              drawioXml: source,
              ...(sourceMermaid !== undefined ? {
                code: sourceMermaid,
                sourceMermaid,
                kind: detectDiagramKind(sourceMermaid),
              } : {}),
              lastGood: value,
              versions: [snapshot, ...document.versions].slice(0, 30),
              updatedAt: timestamp,
            }
          }),
        }))
        return true
      },

      setTheme: (themeId) => get().updateActiveDocument({ themeId }),

      toggleFavorite: (documentId) => {
        set((state) => ({
          documents: state.documents.map((document) =>
            document.id === documentId ? { ...document, favorite: !document.favorite, updatedAt: now() } : document,
          ),
        }))
      },

      duplicateDocument: (documentId) => {
        const source = get().documents.find((document) => document.id === documentId)
        if (!source) return undefined
        const timestamp = now()
        const duplicate: DiagramDocument = {
          ...source,
          id: id('diagram'),
          title: `${source.title} - 副本`,
          favorite: false,
          versions: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        set((state) => ({ documents: [duplicate, ...state.documents], activeProjectId: duplicate.projectId, activeDocumentId: duplicate.id }))
        return duplicate.id
      },

      deleteDocument: (documentId) => {
        const state = get()
        const relatedIds = new Set([
          documentId,
          ...state.documents
            .filter((document) => document.sourceDocumentId === documentId)
            .map((document) => document.id),
        ])
        const remaining = state.documents.filter((document) => !relatedIds.has(document.id))
        if (!remaining.length) return
        const projects = state.projects.filter((project) => remaining.some((document) => document.projectId === project.id))
        const nextDocument = relatedIds.has(state.activeDocumentId) ? remaining[0] : remaining.find((item) => item.id === state.activeDocumentId) ?? remaining[0]
        set({
          projects,
          documents: remaining,
          activeProjectId: nextDocument.projectId,
          activeDocumentId: nextDocument.id,
        })
      },

      createVersion: (label) => {
        const activeId = get().activeDocumentId
        set((state) => ({
          documents: state.documents.map((document) => {
            if (document.id !== activeId) return document
            const snapshot: DiagramVersion = {
              id: id('version'),
              engine: document.engine,
              code: document.code,
              ...(document.engine === 'drawio' ? {
                drawioXml: document.drawioXml ?? EMPTY_DRAWIO_XML,
                ...(document.sourceMermaid !== undefined ? { sourceMermaid: document.sourceMermaid } : {}),
                ...(document.sourceDocumentId !== undefined ? { sourceDocumentId: document.sourceDocumentId } : {}),
              } : {}),
              createdAt: now(),
              label: label?.trim() || `手动版本 ${document.versions.length + 1}`,
            }
            return { ...document, versions: [snapshot, ...document.versions].slice(0, 30), updatedAt: now() }
          }),
        }))
      },

      restoreVersion: (versionId) => {
        const active = get().documents.find((document) => document.id === get().activeDocumentId)
        const version = active?.versions.find((item) => item.id === versionId)
        if (!version) return
        if (version.engine === 'drawio') {
          const sourceMermaid = version.sourceMermaid ?? version.code
          get().updateActiveDocument({
            engine: 'drawio',
            code: sourceMermaid,
            drawioXml: version.drawioXml ?? EMPTY_DRAWIO_XML,
            sourceMermaid: version.sourceMermaid,
            sourceDocumentId: version.sourceDocumentId,
            kind: detectDiagramKind(sourceMermaid),
          })
          return
        }
        get().updateActiveDocument({
          engine: 'mermaid',
          code: version.code,
          drawioXml: undefined,
          sourceMermaid: undefined,
          sourceDocumentId: undefined,
          kind: detectDiagramKind(version.code),
        })
      },

      updatePreferences: (patch) => {
        set((state) => ({ preferences: { ...state.preferences, ...patch } }))
      },
    }),
    {
      name: 'mermaid-workbench-v2',
      version: 3,
      partialize: (state) => ({
        projects: state.projects,
        documents: state.documents,
        activeProjectId: state.activeProjectId,
        activeDocumentId: state.activeDocumentId,
        preferences: state.preferences,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as {
          documents?: unknown
          projects?: unknown
          activeProjectId?: unknown
          activeDocumentId?: unknown
          preferences?: Partial<WorkspacePreferences>
        }
        const normalized = normalizeWorkspaceDocuments(persisted.documents)
        const documents = normalized.length ? normalized : currentState.documents
        const projects = normalizeWorkspaceProjects(persisted.projects, documents)
        const activeDocumentId = typeof persisted.activeDocumentId === 'string'
          && documents.some((document) => document.id === persisted.activeDocumentId)
          ? persisted.activeDocumentId
          : documents[0].id
        const savedPreferences = persisted.preferences ?? {}
        const editorRatio = typeof savedPreferences.editorRatio === 'number' && Number.isFinite(savedPreferences.editorRatio)
          ? Math.max(28, Math.min(68, savedPreferences.editorRatio))
          : currentState.preferences.editorRatio
        const inspectorWidth = typeof savedPreferences.inspectorWidth === 'number' && Number.isFinite(savedPreferences.inspectorWidth)
          ? Math.max(380, Math.min(720, savedPreferences.inspectorWidth))
          : currentState.preferences.inspectorWidth
        const renderDelay = typeof savedPreferences.renderDelay === 'number' && Number.isFinite(savedPreferences.renderDelay)
          ? Math.max(100, Math.min(2000, savedPreferences.renderDelay))
          : currentState.preferences.renderDelay
        const workspaceView: WorkspaceView = savedPreferences.workspaceView === 'canvas'
          || savedPreferences.workspaceView === 'source'
          || savedPreferences.workspaceView === 'split'
          ? savedPreferences.workspaceView
          : currentState.preferences.workspaceView
        const aiEnabledModels = Array.isArray(savedPreferences.aiEnabledModels)
          ? savedPreferences.aiEnabledModels.filter((item) => (
            item
            && (item.provider === 'cpa' || item.provider === 'deepseek' || item.provider === 'custom')
            && typeof item.model === 'string'
            && item.model.trim()
          )).slice(0, 20)
          : currentState.preferences.aiEnabledModels
        const aiSelectedModel = typeof savedPreferences.aiSelectedModel === 'string'
          && aiEnabledModels.some((item) => `${item.provider}:${item.model}` === savedPreferences.aiSelectedModel)
          ? savedPreferences.aiSelectedModel
          : (aiEnabledModels[0] ? `${aiEnabledModels[0].provider}:${aiEnabledModels[0].model}` : '')

        return {
          ...currentState,
          projects,
          documents,
          activeProjectId: typeof persisted.activeProjectId === 'string' && projects.some((project) => project.id === persisted.activeProjectId)
            ? persisted.activeProjectId
            : documents.find((document) => document.id === activeDocumentId)?.projectId ?? projects[0].id,
          activeDocumentId,
          preferences: {
            editorRatio,
            inspectorWidth,
            workspaceView,
            renderDelay,
            aiEnabledModels,
            aiSelectedModel,
            sidebarCollapsed: typeof savedPreferences.sidebarCollapsed === 'boolean'
              ? savedPreferences.sidebarCollapsed
              : currentState.preferences.sidebarCollapsed,
            inspectorOpen: typeof savedPreferences.inspectorOpen === 'boolean'
              ? savedPreferences.inspectorOpen
              : currentState.preferences.inspectorOpen,
            canvasGrid: typeof savedPreferences.canvasGrid === 'boolean'
              ? savedPreferences.canvasGrid
              : currentState.preferences.canvasGrid,
            visualEditorMode: savedPreferences.visualEditorMode === 'online' ? 'online' : 'local',
            visualEditorOnlineFallback: typeof savedPreferences.visualEditorOnlineFallback === 'boolean'
              ? savedPreferences.visualEditorOnlineFallback
              : currentState.preferences.visualEditorOnlineFallback,
          },
        }
      },
    },
  ),
)

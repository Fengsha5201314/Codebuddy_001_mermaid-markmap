import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { defaultTemplate, getTemplate } from '@/data/templates'
import { detectDiagramKind } from '@/lib/diagram-engine'
import { EMPTY_DRAWIO_XML, normalizeWorkspaceDocuments } from '@/lib/workspace-data'
import type { DiagramDocument, DiagramThemeId, DiagramVersion, WorkspacePreferences, WorkspaceView } from '@/types'

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function now(): string {
  return new Date().toISOString()
}

function documentFromTemplate(templateId = defaultTemplate.id): DiagramDocument {
  const template = getTemplate(templateId) ?? defaultTemplate
  const timestamp = now()
  return {
    id: id('diagram'),
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

interface WorkspaceState {
  documents: DiagramDocument[]
  activeDocumentId: string
  preferences: WorkspacePreferences
  createDocument: (templateId?: string) => string
  createVisualDocument: (title?: string, drawioXml?: string, sourceMermaid?: string) => string
  convertActiveToVisual: (drawioXml?: string) => string | undefined
  importDiagram: (title: string, code: string) => string
  importWorkspace: (documents: DiagramDocument[]) => void
  setActiveDocument: (id: string) => void
  updateActiveDocument: (patch: Partial<Omit<DiagramDocument, 'id' | 'createdAt'>>) => void
  updateCode: (code: string) => void
  updateVisualSource: (drawioXml: string, sourceMermaid?: string) => void
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
      documents: [starter],
      activeDocumentId: starter.id,
      preferences: {
        editorRatio: 38,
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

      createDocument: (templateId) => {
        const document = documentFromTemplate(templateId)
        set((state) => ({ documents: [document, ...state.documents], activeDocumentId: document.id }))
        return document.id
      },

      createVisualDocument: (title, drawioXml = EMPTY_DRAWIO_XML, sourceMermaid) => {
        const timestamp = now()
        const mermaidSource = sourceMermaid ?? ''
        const document: DiagramDocument = {
          id: id('diagram'),
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
        set((state) => ({ documents: [document, ...state.documents], activeDocumentId: document.id }))
        return document.id
      },

      convertActiveToVisual: (drawioXml = EMPTY_DRAWIO_XML) => {
        const source = get().documents.find((document) => document.id === get().activeDocumentId)
        if (!source || source.engine !== 'mermaid') return undefined
        const timestamp = now()
        const document: DiagramDocument = {
          ...source,
          id: id('diagram'),
          title: `${source.title} - 可视化`,
          description: source.description
            ? `${source.description}（可视化副本）`
            : '由 Mermaid 转换的可视化副本',
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
        set((state) => ({ documents: [document, ...state.documents], activeDocumentId: document.id }))
        return document.id
      },

      importDiagram: (title, code) => {
        const timestamp = now()
        const document: DiagramDocument = {
          id: id('diagram'),
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
        set((state) => ({ documents: [document, ...state.documents], activeDocumentId: document.id }))
        return document.id
      },

      importWorkspace: (documents) => {
        const valid = normalizeWorkspaceDocuments(documents)
        if (!valid.length) return
        set({ documents: valid, activeDocumentId: valid[0].id })
      },

      setActiveDocument: (documentId) => set({ activeDocumentId: documentId }),

      updateActiveDocument: (patch) => {
        const activeId = get().activeDocumentId
        set((state) => ({
          documents: state.documents.map((document) =>
            document.id === activeId ? { ...document, ...patch, updatedAt: now() } : document,
          ),
        }))
      },

      updateCode: (code) => {
        const active = get().documents.find((document) => document.id === get().activeDocumentId)
        if (active?.engine !== 'mermaid') return
        get().updateActiveDocument({ code, kind: detectDiagramKind(code) })
      },

      updateVisualSource: (drawioXml, sourceMermaid) => {
        if (!drawioXml.trim()) return
        const activeId = get().activeDocumentId
        set((state) => ({
          documents: state.documents.map((document) => {
            if (document.id !== activeId || document.engine !== 'drawio') return document
            if (sourceMermaid === undefined) {
              return { ...document, drawioXml, updatedAt: now() }
            }
            return {
              ...document,
              code: sourceMermaid,
              drawioXml,
              sourceMermaid,
              kind: detectDiagramKind(sourceMermaid),
              updatedAt: now(),
            }
          }),
        }))
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
        set((state) => ({ documents: [duplicate, ...state.documents], activeDocumentId: duplicate.id }))
        return duplicate.id
      },

      deleteDocument: (documentId) => {
        const state = get()
        if (state.documents.length <= 1) return
        const remaining = state.documents.filter((document) => document.id !== documentId)
        set({
          documents: remaining,
          activeDocumentId: state.activeDocumentId === documentId ? remaining[0].id : state.activeDocumentId,
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
      version: 2,
      partialize: (state) => ({
        documents: state.documents,
        activeDocumentId: state.activeDocumentId,
        preferences: state.preferences,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as {
          documents?: unknown
          activeDocumentId?: unknown
          preferences?: Partial<WorkspacePreferences>
        }
        const normalized = normalizeWorkspaceDocuments(persisted.documents)
        const documents = normalized.length ? normalized : currentState.documents
        const activeDocumentId = typeof persisted.activeDocumentId === 'string'
          && documents.some((document) => document.id === persisted.activeDocumentId)
          ? persisted.activeDocumentId
          : documents[0].id
        const savedPreferences = persisted.preferences ?? {}
        const editorRatio = typeof savedPreferences.editorRatio === 'number' && Number.isFinite(savedPreferences.editorRatio)
          ? Math.max(28, Math.min(68, savedPreferences.editorRatio))
          : currentState.preferences.editorRatio
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
          documents,
          activeDocumentId,
          preferences: {
            editorRatio,
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

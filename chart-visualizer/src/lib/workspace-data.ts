import { detectDiagramKind } from '@/lib/diagram-engine'
import type { DiagramDocument, DiagramEngine, DiagramProject, DiagramThemeId, DiagramVersion } from '@/types'

export interface WorkspaceBackup {
  schema: 'mermaid-workbench'
  version: 3
  exportedAt: string
  projects: DiagramProject[]
  documents: DiagramDocument[]
}

/** A valid, empty draw.io document used until the embedded editor saves its first change. */
export const EMPTY_DRAWIO_XML = '<mxfile host="embedded"><diagram id="page-1" name="Page-1"><mxGraphModel grid="1" gridSize="10" guides="1" connect="1" arrows="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>'

const themeIds = new Set<DiagramThemeId>(['paper', 'blueprint', 'executive', 'forest', 'midnight'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function validDate(value: unknown, fallback: string): string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : fallback
}

function uniqueId(candidate: unknown, prefix: string, used: Set<string>): string {
  const base = typeof candidate === 'string' && candidate.trim()
    ? candidate.trim()
    : `${prefix}-${Date.now().toString(36)}`
  let value = base
  let suffix = 2
  while (used.has(value)) value = `${base}-${suffix++}`
  used.add(value)
  return value
}

function inferEngine(value: Record<string, unknown>, fallback: DiagramEngine = 'mermaid'): DiagramEngine {
  if (value.engine === 'drawio' || value.engine === 'mermaid') return value.engine
  if (typeof value.drawioXml === 'string') return 'drawio'
  return fallback
}

function normalizeVersions(value: unknown, documentEngine: DiagramEngine): DiagramVersion[] {
  if (!Array.isArray(value)) return []
  const used = new Set<string>()
  const fallbackDate = new Date().toISOString()
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return []
    const engine = inferEngine(item, documentEngine)
    const sourceMermaid = typeof item.sourceMermaid === 'string'
      ? item.sourceMermaid
      : (engine === 'drawio' && typeof item.code === 'string' && item.code.trim() ? item.code : undefined)
    const sourceDocumentId = typeof item.sourceDocumentId === 'string' && item.sourceDocumentId.trim()
      ? item.sourceDocumentId.trim()
      : undefined
    const drawioXml = typeof item.drawioXml === 'string' && item.drawioXml.trim()
      ? item.drawioXml
      : undefined
    if (engine === 'mermaid' && typeof item.code !== 'string') return []
    if (engine === 'drawio' && !drawioXml) return []
    return [{
      id: uniqueId(item.id, 'version', used),
      engine,
      code: typeof item.code === 'string' ? item.code : (sourceMermaid ?? ''),
      ...(engine === 'drawio' ? {
        drawioXml,
        ...(sourceMermaid !== undefined ? { sourceMermaid } : {}),
        ...(sourceDocumentId !== undefined ? { sourceDocumentId } : {}),
      } : {}),
      createdAt: validDate(item.createdAt, fallbackDate),
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : `导入版本 ${index + 1}`,
    }]
  }).slice(0, 30)
}

export function normalizeWorkspaceDocuments(value: unknown): DiagramDocument[] {
  if (!Array.isArray(value)) return []
  const used = new Set<string>()
  const fallbackDate = new Date().toISOString()

  return value.flatMap((item, index) => {
    if (!isRecord(item)) return []
    const engine = inferEngine(item)
    const drawioXml = typeof item.drawioXml === 'string' && item.drawioXml.trim()
      ? item.drawioXml
      : undefined
    const sourceMermaid = typeof item.sourceMermaid === 'string'
      ? item.sourceMermaid
      : (engine === 'drawio' && typeof item.code === 'string' && item.code.trim() ? item.code : undefined)
    const sourceDocumentId = typeof item.sourceDocumentId === 'string' && item.sourceDocumentId.trim()
      ? item.sourceDocumentId.trim()
      : undefined
    if (engine === 'mermaid' && typeof item.code !== 'string') return []
    if (engine === 'drawio' && !drawioXml) return []
    const code = engine === 'mermaid'
      ? item.code as string
      : (typeof item.code === 'string' ? item.code : (sourceMermaid ?? ''))
    const createdAt = validDate(item.createdAt, fallbackDate)
    const updatedAt = validDate(item.updatedAt, createdAt)
    const themeId = typeof item.themeId === 'string' && themeIds.has(item.themeId as DiagramThemeId)
      ? item.themeId as DiagramThemeId
      : 'paper'

    const documentId = uniqueId(item.id, 'diagram', used)
    const projectId = typeof item.projectId === 'string' && item.projectId.trim()
      ? item.projectId.trim()
      : `project-${sourceDocumentId ?? documentId}`
    const parentDocumentId = typeof item.parentDocumentId === 'string' && item.parentDocumentId.trim()
      ? item.parentDocumentId.trim()
      : undefined

    return [{
      id: documentId,
      projectId,
      ...(parentDocumentId ? { parentDocumentId } : {}),
      order: typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : index,
      title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : `导入图表 ${index + 1}`,
      description: typeof item.description === 'string' ? item.description : '',
      engine,
      code,
      ...(engine === 'drawio' ? {
        drawioXml,
        ...(sourceMermaid !== undefined ? { sourceMermaid } : {}),
        ...(sourceDocumentId !== undefined ? { sourceDocumentId } : {}),
      } : {}),
      kind: detectDiagramKind(engine === 'drawio' ? (sourceMermaid ?? '') : code),
      themeId,
      favorite: item.favorite === true,
      tags: Array.isArray(item.tags)
        ? [...new Set(item.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean))]
        : [],
      createdAt,
      updatedAt,
      versions: normalizeVersions(item.versions, engine),
    }]
  })
}

export function normalizeWorkspaceProjects(value: unknown, documents: DiagramDocument[]): DiagramProject[] {
  const fallbackDate = new Date().toISOString()
  const provided = Array.isArray(value) ? value : []
  const byId = new Map<string, DiagramProject>()
  for (const item of provided) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim()) continue
    const id = item.id.trim()
    if (byId.has(id)) continue
    byId.set(id, {
      id,
      title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : '未命名项目',
      description: typeof item.description === 'string' ? item.description : '',
      createdAt: validDate(item.createdAt, fallbackDate),
      updatedAt: validDate(item.updatedAt, fallbackDate),
    })
  }
  for (const document of documents) {
    if (byId.has(document.projectId)) continue
    const canonical = documents.find((item) => item.projectId === document.projectId && !item.sourceDocumentId)
    byId.set(document.projectId, {
      id: document.projectId,
      title: canonical?.title || document.title || '未命名项目',
      description: canonical?.description || '',
      createdAt: canonical?.createdAt || document.createdAt,
      updatedAt: canonical?.updatedAt || document.updatedAt,
    })
  }
  return [...byId.values()]
}

export function createWorkspaceBackup(documents: DiagramDocument[], projects?: DiagramProject[]): WorkspaceBackup {
  return {
    schema: 'mermaid-workbench',
    version: 3,
    exportedAt: new Date().toISOString(),
    projects: normalizeWorkspaceProjects(projects, documents),
    documents,
  }
}

export function parseWorkspaceBackup(text: string): WorkspaceBackup {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('备份文件不是有效的 JSON。')
  }
  if (!isRecord(parsed) || parsed.schema !== 'mermaid-workbench') {
    throw new Error('这不是有效的风沙工作区备份文件。')
  }
  if (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) {
    throw new Error('此备份版本暂不受支持，请先使用对应版本的风沙工作台打开。')
  }
  if (!Array.isArray(parsed.documents)) {
    throw new Error('备份文件缺少图表数据。')
  }

  const documents = normalizeWorkspaceDocuments(parsed.documents)
  if (documents.length !== parsed.documents.length || documents.length === 0) {
    throw new Error('备份中包含损坏的图表记录，未替换当前工作区。')
  }

  const projects = normalizeWorkspaceProjects(parsed.projects, documents)

  return {
    schema: 'mermaid-workbench',
    version: 3,
    exportedAt: validDate(parsed.exportedAt, new Date().toISOString()),
    projects,
    documents,
  }
}

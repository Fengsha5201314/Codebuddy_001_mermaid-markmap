import { detectDiagramKind } from '@/lib/diagram-engine'
import type { DiagramDocument, DiagramEngine, DiagramLastGood, DiagramProject, DiagramThemeId, DiagramVersion } from '@/types'

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
export const MAX_WORKSPACE_DOCUMENTS = 500
export const MAX_WORKSPACE_PROJECTS = 500
const MAX_IDENTIFIER_LENGTH = 160
const MAX_TITLE_LENGTH = 240
const MAX_DESCRIPTION_LENGTH = 4_000
const MAX_TAGS = 50
const MAX_TAG_LENGTH = 80

function boundedText(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function validDate(value: unknown, fallback: string): string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : fallback
}

function uniqueId(candidate: unknown, prefix: string, used: Set<string>): string {
  const normalized = boundedText(candidate, MAX_IDENTIFIER_LENGTH)
  const base = normalized
    ? normalized
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
    const sourceDocumentIdValue = boundedText(item.sourceDocumentId, MAX_IDENTIFIER_LENGTH)
    const sourceDocumentId = sourceDocumentIdValue
      ? sourceDocumentIdValue
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
      label: boundedText(item.label, MAX_TITLE_LENGTH) || `导入版本 ${index + 1}`,
    }]
  }).slice(0, 30)
}

function normalizeLastGood(value: unknown, engine: DiagramEngine): DiagramLastGood | undefined {
  if (!isRecord(value) || value.engine !== engine || typeof value.source !== 'string' || !value.source.trim()) return undefined
  if (value.quality !== 'standard' && value.quality !== 'professional') return undefined
  const sourceSha256 = boundedText(value.sourceSha256, 64)
  if (!/^[A-Fa-f0-9]{64}$/.test(sourceSha256)) return undefined
  const checksPassed = Number(value.checksPassed)
  const checksTotal = Number(value.checksTotal)
  if (!Number.isInteger(checksPassed) || !Number.isInteger(checksTotal) || checksPassed < 0 || checksTotal < checksPassed) return undefined
  return {
    engine,
    source: value.source,
    sourceSha256: sourceSha256.toUpperCase(),
    quality: value.quality,
    verifiedAt: validDate(value.verifiedAt, new Date().toISOString()),
    checksPassed,
    checksTotal,
  }
}

export function normalizeWorkspaceDocuments(value: unknown): DiagramDocument[] {
  if (!Array.isArray(value)) return []
  const used = new Set<string>()
  const fallbackDate = new Date().toISOString()

  return value.slice(0, MAX_WORKSPACE_DOCUMENTS).flatMap((item, index) => {
    if (!isRecord(item)) return []
    const engine = inferEngine(item)
    const drawioXml = typeof item.drawioXml === 'string' && item.drawioXml.trim()
      ? item.drawioXml
      : undefined
    const sourceMermaid = typeof item.sourceMermaid === 'string'
      ? item.sourceMermaid
      : (engine === 'drawio' && typeof item.code === 'string' && item.code.trim() ? item.code : undefined)
    const sourceDocumentIdValue = boundedText(item.sourceDocumentId, MAX_IDENTIFIER_LENGTH)
    const sourceDocumentId = sourceDocumentIdValue
      ? sourceDocumentIdValue
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
    const projectIdValue = boundedText(item.projectId, MAX_IDENTIFIER_LENGTH)
    const projectId = projectIdValue
      ? projectIdValue
      : `project-${sourceDocumentId ?? documentId}`
    const parentDocumentIdValue = boundedText(item.parentDocumentId, MAX_IDENTIFIER_LENGTH)
    const parentDocumentId = parentDocumentIdValue
      ? parentDocumentIdValue
      : undefined

    return [{
      id: documentId,
      projectId,
      ...(parentDocumentId ? { parentDocumentId } : {}),
      order: typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : index,
      title: boundedText(item.title, MAX_TITLE_LENGTH) || `导入图表 ${index + 1}`,
      description: boundedText(item.description, MAX_DESCRIPTION_LENGTH),
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
        ? [...new Set(item.tags
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => boundedText(tag, MAX_TAG_LENGTH))
          .filter(Boolean))].slice(0, MAX_TAGS)
        : [],
      createdAt,
      updatedAt,
      versions: normalizeVersions(item.versions, engine),
      ...(normalizeLastGood(item.lastGood, engine) ? { lastGood: normalizeLastGood(item.lastGood, engine) } : {}),
    }]
  })
}

export function normalizeWorkspaceProjects(value: unknown, documents: DiagramDocument[]): DiagramProject[] {
  const fallbackDate = new Date().toISOString()
  const provided = Array.isArray(value) ? value.slice(0, MAX_WORKSPACE_PROJECTS) : []
  const boundedDocuments = documents.slice(0, MAX_WORKSPACE_DOCUMENTS)
  const requiredProjectIds = new Set(boundedDocuments.map((document) => document.projectId))
  const byId = new Map<string, DiagramProject>()
  const addProvidedProject = (item: unknown) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim()) return
    const id = boundedText(item.id, MAX_IDENTIFIER_LENGTH)
    if (!id || byId.has(id) || byId.size >= MAX_WORKSPACE_PROJECTS) return
    byId.set(id, {
      id,
      title: boundedText(item.title, MAX_TITLE_LENGTH) || '未命名项目',
      description: boundedText(item.description, MAX_DESCRIPTION_LENGTH),
      createdAt: validDate(item.createdAt, fallbackDate),
      updatedAt: validDate(item.updatedAt, fallbackDate),
    })
  }
  for (const item of provided) {
    if (isRecord(item) && requiredProjectIds.has(boundedText(item.id, MAX_IDENTIFIER_LENGTH))) addProvidedProject(item)
  }
  const canonicalByProject = new Map<string, DiagramDocument>()
  for (const document of boundedDocuments) {
    if (!document.sourceDocumentId && !canonicalByProject.has(document.projectId)) {
      canonicalByProject.set(document.projectId, document)
    }
  }
  for (const document of boundedDocuments) {
    if (byId.has(document.projectId)) continue
    if (byId.size >= MAX_WORKSPACE_PROJECTS) break
    const canonical = canonicalByProject.get(document.projectId)
    byId.set(document.projectId, {
      id: document.projectId,
      title: canonical?.title || document.title || '未命名项目',
      description: canonical?.description || '',
      createdAt: canonical?.createdAt || document.createdAt,
      updatedAt: canonical?.updatedAt || document.updatedAt,
    })
  }
  for (const item of provided) addProvidedProject(item)
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
  if (parsed.documents.length > MAX_WORKSPACE_DOCUMENTS) {
    throw new Error(`备份中的图表数量超过 ${MAX_WORKSPACE_DOCUMENTS} 个，请拆分后再导入。`)
  }
  if (Array.isArray(parsed.projects) && parsed.projects.length > MAX_WORKSPACE_PROJECTS) {
    throw new Error(`备份中的项目数量超过 ${MAX_WORKSPACE_PROJECTS} 个，请拆分后再导入。`)
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

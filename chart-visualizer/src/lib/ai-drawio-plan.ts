import { validateDrawioXml } from '@/lib/drawio-xml'
import { fengshaPlanToLegacyDrawioSource, isFengshaPlanSource } from '@/lib/fengsha-plan'
import { wrapTextToPixelWidth } from '@/lib/mermaid-label-visibility'

type DrawioDirection = 'LR' | 'TB'
type DrawioNodeType = 'start' | 'end' | 'process' | 'decision' | 'document' | 'data' | 'system' | 'manual' | 'note'

interface DrawioLane {
  id: string
  label: string
}

interface DrawioNode {
  id: string
  type: DrawioNodeType
  label: string
  lane?: string
  column?: number
  x?: number
  y?: number
  width?: number
  height?: number
  after?: string
}

interface DrawioEdge {
  id?: string
  source: string
  target: string
  label?: string
  kind?: 'normal' | 'yes' | 'no' | 'return' | 'exception'
}

type DrawioOperation =
  | { op: 'addNode'; node: DrawioNode }
  | { op: 'updateNode'; id: string; label?: string; type?: DrawioNodeType }
  | { op: 'deleteNode'; id: string }
  | { op: 'moveNode'; id: string; x: number; y: number }
  | { op: 'addEdge'; edge: DrawioEdge }
  | { op: 'updateEdge'; id: string; label?: string; source?: string; target?: string }
  | { op: 'deleteEdge'; id: string }

interface ReplacePlan {
  version: 1
  mode: 'replace'
  title?: string
  direction?: DrawioDirection
  lanes?: DrawioLane[]
  nodes: DrawioNode[]
  edges?: DrawioEdge[]
}

interface PatchPlan {
  version: 1
  mode: 'patch'
  operations: DrawioOperation[]
}

type DrawioPlan = ReplacePlan | PatchPlan

const NODE_TYPES = new Set<DrawioNodeType>(['start', 'end', 'process', 'decision', 'document', 'data', 'system', 'manual', 'note'])
const EDGE_KINDS = new Set(['normal', 'yes', 'no', 'return', 'exception'])
const MAX_NODES = 160
const MAX_EDGES = 320
const MAX_OPERATIONS = 120

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function requiredText(value: unknown, field: string, maximum = 240): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}不能为空。`)
  const text = value.trim()
  if (text.length > maximum) throw new Error(`${field}不能超过 ${maximum} 个字符。`)
  return text
}

function optionalText(value: unknown, field: string, maximum = 240): string | undefined {
  if (value === undefined) return undefined
  return requiredText(value, field, maximum)
}

function finiteNumber(value: unknown, field: string, minimum = -20_000, maximum = 20_000): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${field}必须是 ${minimum} 到 ${maximum} 之间的数字。`)
  }
  return value
}

function requiredNumber(value: unknown, field: string, minimum = -20_000, maximum = 20_000): number {
  const result = finiteNumber(value, field, minimum, maximum)
  if (result === undefined) throw new Error(`${field}不能为空。`)
  return result
}

function parseNode(value: unknown, index: number): DrawioNode {
  const item = record(value)
  if (!item) throw new Error(`第 ${index + 1} 个节点格式不正确。`)
  const type = requiredText(item.type, `节点 ${index + 1} 的 type`, 30) as DrawioNodeType
  if (!NODE_TYPES.has(type)) throw new Error(`节点 ${index + 1} 使用了不支持的类型：${type}。`)
  return {
    id: requiredText(item.id, `节点 ${index + 1} 的 id`, 120),
    type,
    label: requiredText(item.label, `节点 ${index + 1} 的 label`, 500),
    lane: optionalText(item.lane, `节点 ${index + 1} 的 lane`, 120),
    column: finiteNumber(item.column, `节点 ${index + 1} 的 column`, 0, 100),
    x: finiteNumber(item.x, `节点 ${index + 1} 的 x`),
    y: finiteNumber(item.y, `节点 ${index + 1} 的 y`),
    width: finiteNumber(item.width, `节点 ${index + 1} 的 width`, 40, 600),
    height: finiteNumber(item.height, `节点 ${index + 1} 的 height`, 30, 400),
    after: optionalText(item.after, `节点 ${index + 1} 的 after`, 120),
  }
}

function parseEdge(value: unknown, index: number): DrawioEdge {
  const item = record(value)
  if (!item) throw new Error(`第 ${index + 1} 条连线格式不正确。`)
  const kind = optionalText(item.kind, `连线 ${index + 1} 的 kind`, 30)
  if (kind && !EDGE_KINDS.has(kind)) throw new Error(`连线 ${index + 1} 使用了不支持的 kind：${kind}。`)
  return {
    id: optionalText(item.id, `连线 ${index + 1} 的 id`, 120),
    source: requiredText(item.source, `连线 ${index + 1} 的 source`, 120),
    target: requiredText(item.target, `连线 ${index + 1} 的 target`, 120),
    label: optionalText(item.label, `连线 ${index + 1} 的 label`, 300),
    kind: kind as DrawioEdge['kind'],
  }
}

function parsePlan(code: string): DrawioPlan {
  const cleaned = code.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  let value: unknown
  try {
    value = JSON.parse(cleaned)
  } catch (error) {
    const detail = error instanceof Error ? error.message : '未知 JSON 错误'
    throw new Error(`AI 图形计划不是有效 JSON：${detail}`)
  }
  const plan = record(value)
  if (!plan || plan.version !== 1) throw new Error('AI 图形计划缺少 version: 1。')
  if (plan.mode === 'replace') {
    if (!Array.isArray(plan.nodes) || !plan.nodes.length) throw new Error('AI 图形计划至少需要一个节点。')
    if (plan.nodes.length > MAX_NODES) throw new Error(`单张图最多支持 ${MAX_NODES} 个节点，请拆分子流程。`)
    if (plan.edges !== undefined && !Array.isArray(plan.edges)) throw new Error('AI 图形计划的 edges 必须是数组。')
    if ((plan.edges?.length ?? 0) > MAX_EDGES) throw new Error(`单张图最多支持 ${MAX_EDGES} 条连线，请拆分子流程。`)
    if (plan.lanes !== undefined && !Array.isArray(plan.lanes)) throw new Error('AI 图形计划的 lanes 必须是数组。')
    const lanes = (plan.lanes ?? []).map((value, index) => {
      const lane = record(value)
      if (!lane) throw new Error(`第 ${index + 1} 个泳道格式不正确。`)
      return {
        id: requiredText(lane.id, `泳道 ${index + 1} 的 id`, 120),
        label: requiredText(lane.label, `泳道 ${index + 1} 的 label`, 200),
      }
    })
    const laneIds = new Set<string>()
    for (const lane of lanes) {
      if (laneIds.has(lane.id)) throw new Error(`存在重复泳道 ID：${lane.id}。`)
      laneIds.add(lane.id)
    }
    const nodes = plan.nodes.map(parseNode)
    const nodeIds = new Set<string>()
    for (const node of nodes) {
      if (nodeIds.has(node.id)) throw new Error(`存在重复节点 ID：${node.id}。`)
      nodeIds.add(node.id)
      if (node.lane && !laneIds.has(node.lane)) throw new Error(`节点 ${node.id} 引用了不存在的泳道：${node.lane}。`)
    }
    const edges = (plan.edges ?? []).map(parseEdge)
    const edgeIds = new Set<string>()
    for (const edge of edges) {
      if (edge.id && edgeIds.has(edge.id)) throw new Error(`存在重复连线 ID：${edge.id}。`)
      if (edge.id) edgeIds.add(edge.id)
      if (!nodeIds.has(edge.source)) throw new Error(`连线引用了不存在的起点：${edge.source}。`)
      if (!nodeIds.has(edge.target)) throw new Error(`连线引用了不存在的终点：${edge.target}。`)
    }
    const direction = plan.direction === undefined ? 'LR' : plan.direction
    if (direction !== 'LR' && direction !== 'TB') throw new Error(`不支持的布局方向：${String(direction)}。`)
    return {
      version: 1,
      mode: 'replace',
      title: optionalText(plan.title, 'title', 200),
      direction,
      lanes,
      nodes,
      edges,
    }
  }
  if (plan.mode === 'patch') {
    if (!Array.isArray(plan.operations) || !plan.operations.length) throw new Error('补丁计划至少需要一个操作。')
    if (plan.operations.length > MAX_OPERATIONS) throw new Error(`一次最多支持 ${MAX_OPERATIONS} 个修改操作。`)
    const operations = plan.operations.map((value, index): DrawioOperation => {
      const item = record(value)
      if (!item || typeof item.op !== 'string') throw new Error(`第 ${index + 1} 个修改操作格式不正确。`)
      if (item.op === 'addNode') return { op: item.op, node: parseNode(item.node, index) }
      if (item.op === 'updateNode') return {
        op: item.op,
        id: requiredText(item.id, `操作 ${index + 1} 的 id`, 120),
        label: optionalText(item.label, `操作 ${index + 1} 的 label`, 500),
        type: item.type === undefined ? undefined : parseNode({ id: 'type-check', label: 'type-check', type: item.type }, index).type,
      }
      if (item.op === 'deleteNode' || item.op === 'deleteEdge') return { op: item.op, id: requiredText(item.id, `操作 ${index + 1} 的 id`, 120) }
      if (item.op === 'moveNode') return {
        op: item.op,
        id: requiredText(item.id, `操作 ${index + 1} 的 id`, 120),
        x: requiredNumber(item.x, `操作 ${index + 1} 的 x`),
        y: requiredNumber(item.y, `操作 ${index + 1} 的 y`),
      }
      if (item.op === 'addEdge') return { op: item.op, edge: parseEdge(item.edge, index) }
      if (item.op === 'updateEdge') return {
        op: item.op,
        id: requiredText(item.id, `操作 ${index + 1} 的 id`, 120),
        label: optionalText(item.label, `操作 ${index + 1} 的 label`, 300),
        source: optionalText(item.source, `操作 ${index + 1} 的 source`, 120),
        target: optionalText(item.target, `操作 ${index + 1} 的 target`, 120),
      }
      throw new Error(`第 ${index + 1} 个修改操作不受支持：${item.op}。`)
    })
    return { version: 1, mode: 'patch', operations }
  }
  throw new Error('AI 图形计划的 mode 必须是 replace 或 patch。')
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function safeId(value: string, prefix: string, used: Set<string>): string {
  const normalized = value.normalize('NFKC').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  const base = normalized && normalized !== '0' && normalized !== '1' ? normalized : prefix
  let candidate = base
  let suffix = 2
  while (used.has(candidate)) candidate = `${base}-${suffix++}`
  used.add(candidate)
  return candidate
}

function nodeStyle(type: DrawioNodeType): string {
  const shared = 'html=1;whiteSpace=wrap;align=center;verticalAlign=middle;fontFamily=Microsoft YaHei;fontSize=14;fontColor=#1F2937;strokeWidth=1.5;shadow=0;'
  const styles: Record<DrawioNodeType, string> = {
    start: 'ellipse;aspect=fixed;fillColor=#ECFDF5;strokeColor=#10B981;fontStyle=1;',
    end: 'ellipse;aspect=fixed;fillColor=#EEF2FF;strokeColor=#6366F1;fontStyle=1;',
    process: 'rounded=1;arcSize=14;fillColor=#EFF6FF;strokeColor=#3B82F6;',
    decision: 'rhombus;fillColor=#FFF7ED;strokeColor=#F59E0B;fontStyle=1;',
    document: 'shape=document;boundedLbl=1;fillColor=#F5F3FF;strokeColor=#8B5CF6;',
    data: 'shape=parallelogram;perimeter=parallelogramPerimeter;fillColor=#ECFEFF;strokeColor=#06B6D4;',
    system: 'shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#F0FDFA;strokeColor=#14B8A6;',
    manual: 'shape=manualInput;fillColor=#FDF2F8;strokeColor=#EC4899;',
    note: 'shape=note;size=16;fillColor=#FFFBEB;strokeColor=#F59E0B;align=left;',
  }
  return shared + styles[type]
}

function edgeStyle(kind: DrawioEdge['kind']): string {
  const base = 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;fontFamily=Microsoft YaHei;fontSize=12;strokeWidth=1.5;endArrow=block;endFill=1;'
  if (kind === 'return') return `${base}strokeColor=#F59E0B;dashed=1;`
  if (kind === 'exception' || kind === 'no') return `${base}strokeColor=#EF4444;dashed=1;`
  if (kind === 'yes') return `${base}strokeColor=#10B981;`
  return `${base}strokeColor=#64748B;`
}

function nodeSize(node: DrawioNode): { width: number; height: number } {
  const base = node.type === 'start' || node.type === 'end'
    ? { width: 108, height: 58 }
    : node.type === 'decision'
      ? { width: 164, height: 104 }
      : node.type === 'note'
        ? { width: 196, height: 82 }
        : { width: 176, height: 68 }
  const width = node.width ?? base.width
  const contentWidth = Math.max(24, width - (node.type === 'decision' ? 60 : 28))
  const lines = node.label.split(/\r?\n/).flatMap((line) => wrapTextToPixelWidth(line, 14, contentWidth))
  const requiredHeight = Math.ceil(Math.max(1, lines.length) * 14 * 1.35 + (node.type === 'decision' ? 50 : 26))
  return { width, height: Math.max(node.height ?? 0, base.height, requiredHeight) }
}

function inferColumns(nodes: DrawioNode[], edges: DrawioEdge[]): Map<string, number> {
  const columns = new Map(nodes.map((node) => [node.id, node.column ?? 0]))
  const explicit = new Set(nodes.filter((node) => node.column !== undefined).map((node) => node.id))
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false
    for (const edge of edges) {
      if (edge.kind === 'return') continue
      const next = (columns.get(edge.source) ?? 0) + 1
      if (!explicit.has(edge.target) && next > (columns.get(edge.target) ?? 0)) {
        columns.set(edge.target, Math.min(next, nodes.length))
        changed = true
      }
    }
    if (!changed) break
  }
  return columns
}

function compileReplacement(plan: ReplacePlan): string {
  const direction = plan.direction ?? 'LR'
  const lanes = plan.lanes ?? []
  const edges = plan.edges ?? []
  const columns = inferColumns(plan.nodes, edges)
  const usedIds = new Set(['0', '1'])
  const laneIds = new Map<string, string>()
  for (const lane of lanes) laneIds.set(lane.id, safeId(`lane-${lane.id}`, 'lane', usedIds))
  const nodeIds = new Map<string, string>()
  for (const node of plan.nodes) nodeIds.set(node.id, safeId(node.id, 'node', usedIds))
  const maximumColumn = Math.max(0, ...[...columns.values()])
  const laneWidth = Math.max(920, 180 + (maximumColumn + 1) * 196)
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>']

  const laneHeights = new Map<string, number>()
  const laneOffsets = new Map<string, number>()
  for (const lane of lanes) {
    const laneNodes = plan.nodes.filter((node) => node.lane === lane.id)
    const perColumn = new Map<number, number>()
    for (const node of laneNodes) {
      const column = columns.get(node.id) ?? 0
      perColumn.set(column, (perColumn.get(column) ?? 0) + nodeSize(node).height + 22)
    }
    laneHeights.set(lane.id, Math.max(176, 76 + Math.max(0, ...perColumn.values())))
  }
  let nextLaneY = 30
  for (const lane of lanes) {
    laneOffsets.set(lane.id, nextLaneY)
    nextLaneY += (laneHeights.get(lane.id) ?? 176) + 14
  }

  lanes.forEach((lane) => {
    const laneId = laneIds.get(lane.id)!
    const x = 30
    const y = laneOffsets.get(lane.id) ?? 30
    const laneHeight = laneHeights.get(lane.id) ?? 176
    cells.push(`<mxCell id="${escapeXml(laneId)}" value="${escapeXml(lane.label)}" style="swimlane;html=1;horizontal=1;startSize=34;rounded=1;fillColor=#F8FAFC;swimlaneFillColor=#FFFFFF;strokeColor=#CBD5E1;fontFamily=Microsoft YaHei;fontSize=14;fontStyle=1;collapsible=0;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${laneWidth}" height="${laneHeight}" as="geometry"/></mxCell>`)
  })

  const rowBySlot = new Map<string, number>()
  const heightBySlot = new Map<string, number>()
  plan.nodes.forEach((node) => {
    const cellId = nodeIds.get(node.id)!
    const column = columns.get(node.id) ?? 0
    const laneIndex = node.lane ? lanes.findIndex((lane) => lane.id === node.lane) : -1
    const slot = `${node.lane ?? 'root'}:${column}`
    const row = rowBySlot.get(slot) ?? 0
    rowBySlot.set(slot, row + 1)
    const { width, height } = nodeSize(node)
    const previousHeight = heightBySlot.get(slot) ?? 0
    heightBySlot.set(slot, previousHeight + height + 22)
    const parent = node.lane ? laneIds.get(node.lane)! : '1'
    let x: number
    let y: number
    if (node.x !== undefined && node.y !== undefined) {
      x = node.x
      y = node.y
    } else if (node.lane) {
      x = 68 + column * 190
      y = 54 + previousHeight
    } else if (direction === 'TB') {
      x = 100 + row * 196
      y = 70 + column * 116
    } else {
      x = 70 + column * 190
      const lanesBottom = lanes.length ? nextLaneY + 16 : 50
      y = lanesBottom + row * 100 + Math.max(0, laneIndex) * 16
    }
    cells.push(`<mxCell id="${escapeXml(cellId)}" value="${escapeXml(node.label)}" style="${nodeStyle(node.type)}" vertex="1" parent="${escapeXml(parent)}"><mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/></mxCell>`)
  })

  edges.forEach((edge, index) => {
    const edgeId = safeId(edge.id ?? `edge-${index + 1}`, `edge-${index + 1}`, usedIds)
    cells.push(`<mxCell id="${escapeXml(edgeId)}" value="${escapeXml(edge.label ?? '')}" style="${edgeStyle(edge.kind)}" edge="1" parent="1" source="${escapeXml(nodeIds.get(edge.source)!)}" target="${escapeXml(nodeIds.get(edge.target)!)}"><mxGeometry relative="1" as="geometry"/></mxCell>`)
  })

  const pageName = escapeXml(plan.title ?? 'AI 生成流程图')
  const rootBottom = plan.nodes
    .filter((node) => !node.lane)
    .reduce((maximum, node) => Math.max(maximum, (node.y ?? nextLaneY + 80) + nodeSize(node).height), 0)
  const pageHeight = Math.max(827, nextLaneY + 70, rootBottom + 90)
  const pageWidth = Math.max(1169, laneWidth + 90)
  return `<mxfile host="embedded" modified="2026-01-01T00:00:00.000Z" agent="Fengsha Diagram" version="1"><diagram id="ai-page-1" name="${pageName}"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" math="0" shadow="0"><root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>`
}

function findCell(document: Document, id: string): Element | null {
  return [...document.querySelectorAll('mxCell')].find((cell) => cell.getAttribute('id') === id) ?? null
}

function createGeometry(document: Document, x: number, y: number, width: number, height: number, relative = false): Element {
  const geometry = document.createElement('mxGeometry')
  if (relative) geometry.setAttribute('relative', '1')
  else {
    geometry.setAttribute('x', String(x))
    geometry.setAttribute('y', String(y))
    geometry.setAttribute('width', String(width))
    geometry.setAttribute('height', String(height))
  }
  geometry.setAttribute('as', 'geometry')
  return geometry
}

function compilePatch(plan: PatchPlan, baseXml: string): string {
  if (!baseXml.trim()) throw new Error('当前画布为空，无法应用 patch；请使用 replace 模式。')
  const baseError = validateDrawioXml(baseXml)
  if (baseError) throw new Error(`当前画布不可修改：${baseError}`)
  const document = new DOMParser().parseFromString(baseXml, 'application/xml')
  const root = document.querySelector('mxGraphModel > root')
  if (!root) throw new Error('当前画布缺少 mxGraphModel/root。')
  const requireCell = (id: string, kind?: 'vertex' | 'edge'): Element => {
    const cell = findCell(document, id)
    if (!cell) throw new Error(`修改操作引用了不存在的图形 ID：${id}。`)
    if (kind && cell.getAttribute(kind) !== '1') throw new Error(`图形 ${id} 不是可用的${kind === 'vertex' ? '节点' : '连线'}。`)
    return cell
  }

  for (const operation of plan.operations) {
    if (operation.op === 'updateNode') {
      const cell = requireCell(operation.id, 'vertex')
      if (operation.label !== undefined) cell.setAttribute('value', operation.label)
      if (operation.type !== undefined) cell.setAttribute('style', nodeStyle(operation.type))
    } else if (operation.op === 'moveNode') {
      const cell = requireCell(operation.id, 'vertex')
      const geometry = cell.querySelector('mxGeometry')
      if (!geometry) throw new Error(`节点 ${operation.id} 缺少坐标信息。`)
      geometry.setAttribute('x', String(operation.x))
      geometry.setAttribute('y', String(operation.y))
    } else if (operation.op === 'deleteNode') {
      requireCell(operation.id, 'vertex')
      for (const edge of [...document.querySelectorAll('mxCell[edge="1"]')]) {
        if (edge.getAttribute('source') === operation.id || edge.getAttribute('target') === operation.id) edge.remove()
      }
      findCell(document, operation.id)?.remove()
    } else if (operation.op === 'addNode') {
      if (findCell(document, operation.node.id)) throw new Error(`无法新增节点，ID 已存在：${operation.node.id}。`)
      const cell = document.createElement('mxCell')
      cell.setAttribute('id', operation.node.id)
      cell.setAttribute('value', operation.node.label)
      cell.setAttribute('style', nodeStyle(operation.node.type))
      cell.setAttribute('vertex', '1')
      const anchor = operation.node.after ? requireCell(operation.node.after, 'vertex') : null
      const anchorGeometry = anchor?.querySelector('mxGeometry')
      const parent = operation.node.lane
        ? requireCell(operation.node.lane, 'vertex').getAttribute('id')!
        : anchor?.getAttribute('parent') ?? '1'
      cell.setAttribute('parent', parent)
      const size = nodeSize(operation.node)
      const x = operation.node.x ?? (Number(anchorGeometry?.getAttribute('x') ?? 0) + (anchor ? 190 : 80))
      const y = operation.node.y ?? Number(anchorGeometry?.getAttribute('y') ?? 80)
      cell.appendChild(createGeometry(document, x, y, size.width, size.height))
      root.appendChild(cell)
    } else if (operation.op === 'addEdge') {
      requireCell(operation.edge.source, 'vertex')
      requireCell(operation.edge.target, 'vertex')
      const edgeId = operation.edge.id ?? `ai-edge-${document.querySelectorAll('mxCell[edge="1"]').length + 1}`
      if (findCell(document, edgeId)) throw new Error(`无法新增连线，ID 已存在：${edgeId}。`)
      const cell = document.createElement('mxCell')
      cell.setAttribute('id', edgeId)
      cell.setAttribute('value', operation.edge.label ?? '')
      cell.setAttribute('style', edgeStyle(operation.edge.kind))
      cell.setAttribute('edge', '1')
      cell.setAttribute('parent', '1')
      cell.setAttribute('source', operation.edge.source)
      cell.setAttribute('target', operation.edge.target)
      cell.appendChild(createGeometry(document, 0, 0, 0, 0, true))
      root.appendChild(cell)
    } else if (operation.op === 'updateEdge') {
      const cell = requireCell(operation.id, 'edge')
      if (operation.source !== undefined) {
        requireCell(operation.source, 'vertex')
        cell.setAttribute('source', operation.source)
      }
      if (operation.target !== undefined) {
        requireCell(operation.target, 'vertex')
        cell.setAttribute('target', operation.target)
      }
      if (operation.label !== undefined) cell.setAttribute('value', operation.label)
    } else {
      requireCell(operation.id, 'edge').remove()
    }
  }

  return new XMLSerializer().serializeToString(document)
}

/**
 * Deep seam between probabilistic AI output and deterministic draw.io documents.
 * Accepts a small, validated JSON plan and returns the only format the canvas sees: valid mxGraph XML.
 * Valid legacy XML remains accepted so in-flight providers can roll over without breaking users.
 */
export function compileAiDrawioCode(code: string, baseXml: string): string {
  const trimmed = code.trim()
  if (/^<mxfile(?:\s|>)/i.test(trimmed)) {
    const error = validateDrawioXml(trimmed)
    if (error) throw new Error(error)
    return trimmed
  }
  const plan = parsePlan(isFengshaPlanSource(trimmed) ? fengshaPlanToLegacyDrawioSource(trimmed) : trimmed)
  const result = plan.mode === 'replace' ? compileReplacement(plan) : compilePatch(plan, baseXml)
  const error = validateDrawioXml(result)
  if (error) throw new Error(`本地生成的画布未通过检查：${error}`)
  return result
}

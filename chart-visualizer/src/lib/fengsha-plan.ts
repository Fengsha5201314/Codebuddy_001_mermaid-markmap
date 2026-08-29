export const FENGSHA_PLAN_SCHEMA = 'fengsha.plan/v1' as const

export type FengshaPlanDirection = 'LR' | 'TB'
export type FengshaPlanNodeType = 'start' | 'end' | 'process' | 'decision' | 'document' | 'data' | 'system' | 'manual' | 'note'
export type FengshaPlanEdgeKind = 'normal' | 'yes' | 'no' | 'return' | 'exception'

export interface FengshaPlanLane {
  id: string
  label: string
}

export interface FengshaPlanNode {
  id: string
  type: FengshaPlanNodeType
  label: string
  lane?: string
  column?: number
}

export interface FengshaPlanEdge {
  id: string
  source: string
  target: string
  label?: string
  kind: FengshaPlanEdgeKind
}

export interface FengshaPlanV1 {
  schemaVersion: typeof FENGSHA_PLAN_SCHEMA
  diagramType: 'workflow'
  title?: string
  direction: FengshaPlanDirection
  lanes: FengshaPlanLane[]
  nodes: FengshaPlanNode[]
  edges: FengshaPlanEdge[]
}

const NODE_TYPES = new Set<FengshaPlanNodeType>(['start', 'end', 'process', 'decision', 'document', 'data', 'system', 'manual', 'note'])
const EDGE_KINDS = new Set<FengshaPlanEdgeKind>(['normal', 'yes', 'no', 'return', 'exception'])
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/
const MAX_NODES = 160
const MAX_EDGES = 320

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}必须是对象。`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length) throw new Error(`${label}包含未知字段：${unknown.join('、')}。`)
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空。`)
  const result = value.trim()
  if (result.length > maximum) throw new Error(`${label}不能超过 ${maximum} 个字符。`)
  return result
}

function optionalText(value: unknown, label: string, maximum: number): string | undefined {
  return value === undefined ? undefined : text(value, label, maximum)
}

function id(value: unknown, label: string): string {
  const result = text(value, label, 80)
  if (!ID_PATTERN.test(result)) throw new Error(`${label}必须以英文字母开头，且只能包含字母、数字、点、下划线或短横线。`)
  return result
}

function unique(values: string[], label: string): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) throw new Error(`存在重复${label}：${value}。`)
    seen.add(value)
  }
}

export function isFengshaPlanSource(source: string): boolean {
  try {
    const value = JSON.parse(source.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as { schemaVersion?: unknown }
    return value?.schemaVersion === FENGSHA_PLAN_SCHEMA
  } catch {
    return false
  }
}

export function parseFengshaPlan(source: string): FengshaPlanV1 {
  let value: unknown
  try {
    value = JSON.parse(source.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
  } catch (error) {
    throw new Error(`风沙图纸不是有效 JSON：${error instanceof Error ? error.message : '格式错误'}。`)
  }
  const plan = record(value, '风沙图纸')
  exactKeys(plan, ['schemaVersion', 'diagramType', 'title', 'direction', 'lanes', 'nodes', 'edges'], '风沙图纸')
  if (plan.schemaVersion !== FENGSHA_PLAN_SCHEMA) throw new Error(`风沙图纸 schemaVersion 必须是 ${FENGSHA_PLAN_SCHEMA}。`)
  if (plan.diagramType !== 'workflow') throw new Error('当前只支持 workflow 业务流程图。')
  const direction = plan.direction === undefined ? 'LR' : plan.direction
  if (direction !== 'LR' && direction !== 'TB') throw new Error('direction 只支持 LR 或 TB。')
  if (plan.lanes !== undefined && !Array.isArray(plan.lanes)) throw new Error('lanes 必须是数组。')
  if (!Array.isArray(plan.nodes) || !plan.nodes.length) throw new Error('nodes 至少需要一个节点。')
  if (plan.nodes.length > MAX_NODES) throw new Error(`单张图最多支持 ${MAX_NODES} 个节点，请拆分子流程。`)
  if (plan.edges !== undefined && !Array.isArray(plan.edges)) throw new Error('edges 必须是数组。')
  if ((plan.edges?.length ?? 0) > MAX_EDGES) throw new Error(`单张图最多支持 ${MAX_EDGES} 条连线，请拆分子流程。`)

  const lanes = (plan.lanes ?? []).map((raw, index): FengshaPlanLane => {
    const lane = record(raw, `第 ${index + 1} 个泳道`)
    exactKeys(lane, ['id', 'label'], `第 ${index + 1} 个泳道`)
    return { id: id(lane.id, `泳道 ${index + 1} 的 id`), label: text(lane.label, `泳道 ${index + 1} 的 label`, 200) }
  })
  unique(lanes.map((lane) => lane.id), '泳道 ID')
  const laneIds = new Set(lanes.map((lane) => lane.id))

  const nodes = plan.nodes.map((raw, index): FengshaPlanNode => {
    const node = record(raw, `第 ${index + 1} 个节点`)
    exactKeys(node, ['id', 'type', 'label', 'lane', 'column'], `第 ${index + 1} 个节点`)
    const type = text(node.type, `节点 ${index + 1} 的 type`, 30) as FengshaPlanNodeType
    if (!NODE_TYPES.has(type)) throw new Error(`节点 ${index + 1} 使用了不支持的类型：${type}。`)
    const lane = optionalText(node.lane, `节点 ${index + 1} 的 lane`, 80)
    if (lane && !laneIds.has(lane)) throw new Error(`节点 ${String(node.id)} 引用了不存在的泳道：${lane}。`)
    if (node.column !== undefined && (!Number.isInteger(node.column) || Number(node.column) < 0 || Number(node.column) > 100)) {
      throw new Error(`节点 ${index + 1} 的 column 必须是 0 到 100 的整数。`)
    }
    return {
      id: id(node.id, `节点 ${index + 1} 的 id`),
      type,
      label: text(node.label, `节点 ${index + 1} 的 label`, 500),
      ...(lane ? { lane } : {}),
      ...(node.column !== undefined ? { column: Number(node.column) } : {}),
    }
  })
  unique(nodes.map((node) => node.id), '节点 ID')
  const nodeIds = new Set(nodes.map((node) => node.id))

  const edges = (plan.edges ?? []).map((raw, index): FengshaPlanEdge => {
    const edge = record(raw, `第 ${index + 1} 条连线`)
    exactKeys(edge, ['id', 'source', 'target', 'label', 'kind'], `第 ${index + 1} 条连线`)
    const source = id(edge.source, `连线 ${index + 1} 的 source`)
    const target = id(edge.target, `连线 ${index + 1} 的 target`)
    if (!nodeIds.has(source)) throw new Error(`连线 ${index + 1} 引用了不存在的起点：${source}。`)
    if (!nodeIds.has(target)) throw new Error(`连线 ${index + 1} 引用了不存在的终点：${target}。`)
    const kind = (edge.kind === undefined ? 'normal' : text(edge.kind, `连线 ${index + 1} 的 kind`, 30)) as FengshaPlanEdgeKind
    if (!EDGE_KINDS.has(kind)) throw new Error(`连线 ${index + 1} 使用了不支持的 kind：${kind}。`)
    return {
      id: id(edge.id ?? `edge-${index + 1}`, `连线 ${index + 1} 的 id`),
      source,
      target,
      kind,
      ...(edge.label === undefined ? {} : { label: text(edge.label, `连线 ${index + 1} 的 label`, 300) }),
    }
  })
  unique(edges.map((edge) => edge.id), '连线 ID')

  return {
    schemaVersion: FENGSHA_PLAN_SCHEMA,
    diagramType: 'workflow',
    title: optionalText(plan.title, 'title', 200),
    direction,
    lanes,
    nodes,
    edges,
  }
}

function mermaidLabel(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '<br/>')
}

function mermaidNode(node: FengshaPlanNode): string {
  const label = mermaidLabel(node.label)
  if (node.type === 'start' || node.type === 'end') return `${node.id}(["${label}"])`
  if (node.type === 'decision') return `${node.id}{"${label}"}`
  if (node.type === 'data') return `${node.id}[/"${label}"/]`
  if (node.type === 'system') return `${node.id}[("${label}")]`
  // Keep the portable Mermaid subset deliberately small. New shape syntax is
  // renderer-version sensitive and used to be a frequent source of retries.
  if (node.type === 'document' || node.type === 'manual') return `${node.id}["${label}"]`
  if (node.type === 'note') return `${node.id}["${label}"]`
  return `${node.id}["${label}"]`
}

export function compileFengshaPlanToMermaid(planOrSource: FengshaPlanV1 | string): string {
  const plan = typeof planOrSource === 'string' ? parseFengshaPlan(planOrSource) : planOrSource
  const lines = [`flowchart ${plan.direction}`]
  const inLane = new Set<string>()
  const orderedNodes = [...plan.nodes].sort((left, right) => (
    (left.column ?? 0) - (right.column ?? 0) || left.id.localeCompare(right.id)
  ))
  for (const lane of plan.lanes) {
    lines.push(`  subgraph ${lane.id}["${mermaidLabel(lane.label)}"]`)
    for (const node of orderedNodes.filter((item) => item.lane === lane.id)) {
      lines.push(`    ${mermaidNode(node)}`)
      inLane.add(node.id)
    }
    lines.push('  end')
  }
  for (const node of orderedNodes.filter((item) => !inLane.has(item.id))) lines.push(`  ${mermaidNode(node)}`)
  for (const edge of plan.edges) {
    const label = edge.label ? `|"${mermaidLabel(edge.label)}"|` : ''
    const arrow = edge.kind === 'return' || edge.kind === 'exception' ? '-.->' : '-->'
    lines.push(`  ${edge.source} ${arrow}${label} ${edge.target}`)
  }
  return lines.join('\n')
}

export function fengshaPlanToLegacyDrawioSource(planOrSource: FengshaPlanV1 | string): string {
  const plan = typeof planOrSource === 'string' ? parseFengshaPlan(planOrSource) : planOrSource
  return JSON.stringify({
    version: 1,
    mode: 'replace',
    title: plan.title,
    direction: plan.direction,
    lanes: plan.lanes,
    nodes: plan.nodes,
    edges: plan.edges,
  })
}

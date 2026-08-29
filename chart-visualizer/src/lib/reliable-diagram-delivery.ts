import { generateDiagramArtifact, type GeneratedDiagramArtifact } from '@/lib/diagram-artifact'
import { parseDrawioPageModels, type DrawioPageModel } from '@/lib/drawio-xml'
import {
  estimateSvgTextWidth,
  findClippedRenderedNodeLabelDetails,
  findOverflowingNodeLabelDetails,
} from '@/lib/mermaid-label-visibility'
import type { CliRenderOptions } from '@/cli-contracts'
import type { RenderResult } from '@/types'

export type DiagramQualityProfile = 'standard' | 'professional'
export type DiagramQualityEngine = 'mermaid' | 'drawio'
export type DiagramDiagnosticSeverity = 'error' | 'warning'
export type DiagramCheckStatus = 'passed' | 'failed' | 'warning'

export interface DiagramDiagnosticSubject {
  kind: 'diagram' | 'node' | 'edge' | 'lane' | 'source' | 'artifact'
  id?: string
  field?: string
  line?: number
}

export interface DiagramDiagnostic {
  code: string
  severity: DiagramDiagnosticSeverity
  message: string
  subject: DiagramDiagnosticSubject
  evidence?: Record<string, string | number | boolean>
  supportedFixes: string[]
}

export interface DiagramQualityCheck {
  id: string
  label: string
  status: DiagramCheckStatus
  diagnosticCodes: string[]
}

export interface DiagramQualityReceipt {
  receiptVersion: 1
  engine: DiagramQualityEngine
  quality: DiagramQualityProfile
  ok: boolean
  /** Automated checks passed, but a person has not yet approved aesthetics/business meaning. */
  acceptance: 'rejected' | 'provisional' | 'passed'
  generatedAt: string
  inputSha256: string
  outputSha256?: string
  outputBytes?: number
  dimensions?: { width: number; height: number }
  counts: { nodes: number; edges: number; lanes: number }
  checks: DiagramQualityCheck[]
  diagnostics: DiagramDiagnostic[]
  visualReview: 'pending' | 'passed' | 'failed'
}

export interface MermaidDeliveryResult {
  artifact: GeneratedDiagramArtifact
  receipt: DiagramQualityReceipt
}

interface Rect {
  id: string
  parent: string
  x: number
  y: number
  width: number
  height: number
  lane: boolean
  group: boolean
  label: string
  fontSize: number
}

interface DrawioCellEntry {
  holder: Element
  cell: Element
}

const SVG_MAX_DIMENSION = 100_000
const SVG_MAX_AREA = 600_000_000

function severity(profile: DiagramQualityProfile): DiagramDiagnosticSeverity {
  return profile === 'professional' ? 'error' : 'warning'
}

function diagnostic(
  code: string,
  message: string,
  subject: DiagramDiagnosticSubject,
  supportedFixes: string[],
  profile: DiagramQualityProfile,
  evidence?: DiagramDiagnostic['evidence'],
): DiagramDiagnostic {
  return { code, message, subject, supportedFixes, evidence, severity: severity(profile) }
}

function check(id: string, label: string, codes: string[], diagnostics: DiagramDiagnostic[]): DiagramQualityCheck {
  const related = diagnostics.filter((item) => codes.includes(item.code))
  return {
    id,
    label,
    status: related.some((item) => item.severity === 'error')
      ? 'failed'
      : related.length
        ? 'warning'
        : 'passed',
    diagnosticCodes: [...new Set(related.map((item) => item.code))],
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

async function sha256(value: string | Blob): Promise<string> {
  const bytes = value instanceof Blob ? await value.arrayBuffer() : new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function artifactText(data: string | Blob): Promise<string | Blob> {
  return Promise.resolve(data)
}

function parseSvg(svg: string): SVGSVGElement | null {
  const document = new DOMParser().parseFromString(svg, 'text/html')
  return document.querySelector('svg')
}

function svgCounts(svg: SVGSVGElement) {
  const nodes = svg.querySelectorAll([
    '.node',
    '.actor',
    '.classGroup',
    '.statediagram-state',
    '.entityBox',
    '.task',
    '.mindmap-node',
    '.architecture-service',
    '.architecture-junction',
    '.person',
    '.system',
    '.container',
    '.component',
  ].join(',')).length
  const edgeGroups = svg.querySelectorAll('.edgePath').length
  const edges = edgeGroups || svg.querySelectorAll('path.flowchart-link, .messageLine0, .messageLine1').length
  const lanes = svg.querySelectorAll('.cluster, .lane, [data-lane]').length
  return { nodes, edges, lanes }
}

function hasMermaidBusinessContent(svg: SVGSVGElement, kind: RenderResult['kind']): boolean {
  const selectors: Partial<Record<RenderResult['kind'], string>> = {
    flowchart: '.node',
    swimlane: '.node',
    architecture: '.architecture-service, .architecture-junction',
    sequence: '.actor',
    class: '.classGroup, .node',
    state: '.statediagram-state, .node',
    er: '.entityBox, .node',
    gantt: '.task',
    mindmap: '.mindmap-node',
    journey: '.task',
    c4: '.person, .system, .container, .component',
  }
  const selector = selectors[kind]
  if (selector) return Boolean(svg.querySelector(selector))
  return [...svg.querySelectorAll('text, foreignObject')]
    .some((entry) => (entry.textContent ?? '').replace(/\u00a0/g, ' ').trim().length > 0)
}

function inspectSvgMarkup(
  svgMarkup: string,
  result: RenderResult,
  profile: DiagramQualityProfile,
): { diagnostics: DiagramDiagnostic[]; counts: DiagramQualityReceipt['counts'] } {
  const diagnostics: DiagramDiagnostic[] = []
  const parsed = parseSvg(svgMarkup)
  if (!parsed) {
    diagnostics.push({
      code: 'artifact/svg-invalid',
      severity: 'error',
      message: '生成结果不是可解析的 SVG。',
      subject: { kind: 'artifact' },
      supportedFixes: ['rerender-artifact'],
    })
    return { diagnostics, counts: { nodes: 0, edges: 0, lanes: 0 } }
  }

  if (![result.width, result.height].every((value) => Number.isFinite(value) && value > 0)) {
    diagnostics.push({
      code: 'geometry/non-finite',
      severity: 'error',
      message: '图表尺寸不是有效的有限数字。',
      subject: { kind: 'diagram' },
      evidence: { width: result.width, height: result.height },
      supportedFixes: ['rerender-layout'],
    })
  } else if (result.width > SVG_MAX_DIMENSION || result.height > SVG_MAX_DIMENSION || result.width * result.height > SVG_MAX_AREA) {
    diagnostics.push(diagnostic(
      'artifact/canvas-too-large',
      '图表画布过大，常用文档或办公软件可能无法稳定打开。',
      { kind: 'artifact' },
      ['split-diagram', 'change-layout', 'reduce-spacing'],
      profile,
      { width: Math.ceil(result.width), height: Math.ceil(result.height) },
    ))
  }

  for (const overflow of findOverflowingNodeLabelDetails(svgMarkup)) {
    diagnostics.push(diagnostic(
      'layout/text-overflow',
      `节点文字“${overflow.text.slice(0, 80)}”可能超出边框。`,
      { kind: 'node', field: 'label' },
      ['wrap-label', 'grow-node', 'shorten-label'],
      profile,
      { maximumLineUnits: overflow.maximumLineUnits },
    ))
  }

  const unsafe = parsed.querySelector('script, iframe, object, embed, foreignObject script')
  if (unsafe) {
    diagnostics.push({
      code: 'artifact/unsafe-content',
      severity: 'error',
      message: 'SVG 中包含不允许的可执行内容。',
      subject: { kind: 'artifact' },
      supportedFixes: ['sanitize-artifact'],
    })
  }

  const counts = svgCounts(parsed)
  if (!hasMermaidBusinessContent(parsed, result.kind)) {
    diagnostics.push({
      code: 'structure/empty-diagram',
      severity: 'error',
      message: 'Mermaid 图中没有可交付的业务节点。',
      subject: { kind: 'diagram' },
      supportedFixes: ['add-node', 'regenerate-plan'],
    })
  }

  return { diagnostics, counts }
}

function inspectMountedMermaidSvg(svgMarkup: string, profile: DiagramQualityProfile): DiagramDiagnostic[] {
  const diagnostics: DiagramDiagnostic[] = []
  const staging = document.createElement('div')
  staging.setAttribute('aria-hidden', 'true')
  staging.style.cssText = 'position:fixed;left:-100000px;top:0;opacity:0;pointer-events:none;'
  staging.innerHTML = svgMarkup
  document.body.appendChild(staging)
  try {
    for (const overflow of findClippedRenderedNodeLabelDetails(staging)) {
      diagnostics.push(diagnostic(
        'layout/text-clipped',
        `节点文字“${overflow.text.slice(0, 80)}”在浏览器实际排版中被裁切。`,
        { kind: 'node', field: 'label' },
        ['wrap-label', 'grow-node', 'shorten-label'],
        profile,
        { maximumLineUnits: overflow.maximumLineUnits },
      ))
    }

    const nodes = [...staging.querySelectorAll<SVGGElement>('svg .node')]
      .slice(0, 500)
      .map((node, index) => ({ id: node.id || `node-${index + 1}`, box: node.getBoundingClientRect() }))
      .filter((item) => item.box.width > 0 && item.box.height > 0)
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const a = nodes[left]
        const b = nodes[right]
        const width = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left)
        const height = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top)
        if (width > 2 && height > 2) {
          diagnostics.push(diagnostic(
            'layout/node-overlap',
            `节点 ${a.id} 与 ${b.id} 发生重叠。`,
            { kind: 'node', id: a.id },
            ['increase-spacing', 'change-layout', 'move-node'],
            profile,
            { otherNodeId: b.id, overlapWidth: Math.round(width), overlapHeight: Math.round(height) },
          ))
        }
      }
    }
  } finally {
    staging.remove()
  }
  return diagnostics
}

function styleValue(style: string, key: string): string | undefined {
  const entry = style.split(';').find((item) => item.slice(0, item.indexOf('=')).trim() === key)
  return entry?.slice(entry.indexOf('=') + 1).trim()
}

function plainDrawioText(value: string): string {
  const container = document.createElement('div')
  container.innerHTML = value.replace(/<br\s*\/?>/gi, '\n')
  return (container.textContent ?? '').replace(/\u00a0/g, ' ').trim()
}

function drawioCellEntries(parsed: ParentNode): DrawioCellEntry[] {
  return [...parsed.querySelectorAll('mxCell')].map((cell) => {
    const parent = cell.parentElement
    const wrapped = parent && /^(?:userobject|object)$/i.test(parent.tagName)
    return { holder: wrapped ? parent : cell, cell }
  })
}

function drawioCellAttribute(entry: DrawioCellEntry, name: string): string | null {
  return entry.holder.getAttribute(name) ?? entry.cell.getAttribute(name)
}

function drawioCellLabel(entry: DrawioCellEntry): string {
  const candidates = [
    entry.holder.getAttribute('value'),
    entry.holder.getAttribute('label'),
    entry.cell.getAttribute('value'),
    entry.cell.getAttribute('label'),
  ]
  return plainDrawioText(candidates.find((value) => value?.trim()) ?? '')
}

function drawioRectangles(parsed: ParentNode): Rect[] {
  const entries = drawioCellEntries(parsed)
  const cells = new Map(entries.map((entry) => [drawioCellAttribute(entry, 'id') ?? '', entry]))
  const cache = new Map<string, { x: number; y: number }>()
  const origin = (id: string, seen = new Set<string>()): { x: number; y: number } => {
    if (cache.has(id)) return cache.get(id)!
    if (seen.has(id)) return { x: 0, y: 0 }
    seen.add(id)
    const entry = cells.get(id)
    const geometry = entry?.cell.querySelector(':scope > mxGeometry')
    const own = {
      x: Number.parseFloat(geometry?.getAttribute('x') ?? '0') || 0,
      y: Number.parseFloat(geometry?.getAttribute('y') ?? '0') || 0,
    }
    const parent = entry ? drawioCellAttribute(entry, 'parent') ?? '' : ''
    const parentOrigin = parent && parent !== '0' && parent !== '1' ? origin(parent, seen) : { x: 0, y: 0 }
    const value = { x: own.x + parentOrigin.x, y: own.y + parentOrigin.y }
    cache.set(id, value)
    return value
  }

  return entries.filter((entry) => drawioCellAttribute(entry, 'vertex') === '1').flatMap((entry) => {
    const id = drawioCellAttribute(entry, 'id') ?? ''
    const geometry = entry.cell.querySelector(':scope > mxGeometry')
    const width = Number.parseFloat(geometry?.getAttribute('width') ?? '')
    const height = Number.parseFloat(geometry?.getAttribute('height') ?? '')
    const style = drawioCellAttribute(entry, 'style') ?? ''
    const edgeLabel = /(?:^|;)edgeLabel(?:=|;)/i.test(style)
    if (!id || edgeLabel || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return []
    const point = origin(id)
    return [{
      id,
      parent: drawioCellAttribute(entry, 'parent') ?? '1',
      x: point.x,
      y: point.y,
      width,
      height,
      lane: /(?:^|;)swimlane(?:=|;)/i.test(style),
      group: /(?:^|;)group(?:=|;)/i.test(style),
      label: drawioCellLabel(entry),
      fontSize: Number.parseFloat(styleValue(style, 'fontSize') ?? '') || 14,
    }]
  })
}

function drawioPageEvidence(page: DrawioPageModel, evidence: DiagramDiagnostic['evidence'] = {}): DiagramDiagnostic['evidence'] {
  return { pageIndex: page.pageIndex + 1, pageId: page.pageId, pageName: page.pageName, ...evidence }
}

function drawioPageDiagnostics(
  page: DrawioPageModel,
  profile: DiagramQualityProfile,
): {
  diagnostics: DiagramDiagnostic[]
  counts: DiagramQualityReceipt['counts']
  dimensions: NonNullable<DiagramQualityReceipt['dimensions']>
} {
  const diagnostics: DiagramDiagnostic[] = []
  const rectangles = drawioRectangles(page.model)
  const lanes = rectangles.filter((item) => item.lane)
  const nodes = rectangles.filter((item) => !item.lane && !item.group)
  const cells = drawioCellEntries(page.model)
  const parentById = new Map(cells.map((entry) => [
    drawioCellAttribute(entry, 'id') ?? '',
    drawioCellAttribute(entry, 'parent') ?? '',
  ]))
  const isAncestor = (candidateId: string, childId: string): boolean => {
    const visited = new Set<string>()
    let parent = parentById.get(childId)
    while (parent && !visited.has(parent)) {
      if (parent === candidateId) return true
      visited.add(parent)
      parent = parentById.get(parent)
    }
    return false
  }
  if (!nodes.length) {
    diagnostics.push({
      code: 'structure/empty-diagram',
      severity: 'error',
      message: `${page.pageName}中没有可交付的业务节点。`,
      subject: { kind: 'diagram' },
      supportedFixes: ['add-node', 'regenerate-plan'],
      evidence: drawioPageEvidence(page),
    })
  }
  for (const node of nodes) {
    if (![node.x, node.y, node.width, node.height].every(Number.isFinite) || node.width <= 0 || node.height <= 0) {
      diagnostics.push({
        code: 'geometry/non-finite',
        severity: 'error',
        message: `节点 ${node.id} 缺少有效几何尺寸。`,
        subject: { kind: 'node', id: node.id },
        evidence: drawioPageEvidence(page, { x: node.x, y: node.y, width: node.width, height: node.height }),
        supportedFixes: ['grow-node', 'move-node'],
      })
      continue
    }
    if (node.label) {
      const availableWidth = Math.max(12, node.width - 20)
      const explicitLines = node.label.split(/\r?\n/)
      const requiredLines = explicitLines.reduce((total, line) => total + Math.max(1, Math.ceil(estimateSvgTextWidth(line, node.fontSize) / availableWidth)), 0)
      const requiredHeight = Math.ceil(requiredLines * node.fontSize * 1.32 + 16)
      if (requiredHeight > node.height + 1) {
        diagnostics.push(diagnostic(
          'layout/text-overflow',
          `节点 ${node.id} 的文字需要约 ${requiredHeight}px 高度，当前只有 ${Math.round(node.height)}px。`,
          { kind: 'node', id: node.id, field: 'label' },
          ['wrap-label', 'grow-node', 'shorten-label'],
          profile,
          drawioPageEvidence(page, { requiredHeight, availableHeight: Math.round(node.height), availableWidth: Math.round(availableWidth) }),
        ))
      }
    }
  }

  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const a = nodes[left]
      const b = nodes[right]
      // Containers and their children intentionally occupy the same area.
      // Only sibling/cross-branch intersections are actionable overlaps.
      if (isAncestor(a.id, b.id) || isAncestor(b.id, a.id)) continue
      const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      if (overlapWidth > 2 && overlapHeight > 2) {
        diagnostics.push(diagnostic(
          'layout/node-overlap',
          `节点 ${a.id} 与 ${b.id} 发生重叠。`,
          { kind: 'node', id: a.id },
          ['increase-spacing', 'move-node', 'change-layout'],
          profile,
          drawioPageEvidence(page, { otherNodeId: b.id, overlapWidth: Math.round(overlapWidth), overlapHeight: Math.round(overlapHeight) }),
        ))
      }
    }
  }

  const laneById = new Map(lanes.map((lane) => [lane.id, lane]))
  for (const node of nodes) {
    const visited = new Set<string>()
    let ancestorId = parentById.get(node.id)
    while (ancestorId && !visited.has(ancestorId)) {
      visited.add(ancestorId)
      const lane = laneById.get(ancestorId)
      if (lane) {
        const contained = node.x >= lane.x - 1
          && node.y >= lane.y - 1
          && node.x + node.width <= lane.x + lane.width + 1
          && node.y + node.height <= lane.y + lane.height + 1
        if (!contained) {
          diagnostics.push(diagnostic(
            'layout/lane-overflow',
            `节点 ${node.id} 超出了泳道 ${lane.id} 的边界。`,
            { kind: 'node', id: node.id },
            ['grow-lane', 'move-node', 'reflow-lane'],
            profile,
            drawioPageEvidence(page, { laneId: lane.id }),
          ))
        }
      }
      ancestorId = parentById.get(ancestorId)
    }
  }
  for (let left = 0; left < lanes.length; left += 1) {
    for (let right = left + 1; right < lanes.length; right += 1) {
      const a = lanes[left]
      const b = lanes[right]
      // A parent swimlane is a container for nested lanes, so their shared
      // area is intentional and must not be reported as a sibling collision.
      if (isAncestor(a.id, b.id) || isAncestor(b.id, a.id)) continue
      const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      if (overlapWidth > 2 && overlapHeight > 2) {
        diagnostics.push(diagnostic(
          'layout/lane-overlap',
          `泳道 ${a.id} 与 ${b.id} 发生重叠。`,
          { kind: 'lane', id: a.id },
          ['reflow-lanes', 'move-lane'],
          profile,
          drawioPageEvidence(page, { otherLaneId: b.id, overlapWidth: Math.round(overlapWidth), overlapHeight: Math.round(overlapHeight) }),
        ))
      }
    }
  }

  const ids = new Set(cells.map((entry) => drawioCellAttribute(entry, 'id') ?? ''))
  const edges = cells.filter((entry) => drawioCellAttribute(entry, 'edge') === '1')
  for (const edge of edges) {
    const id = drawioCellAttribute(edge, 'id') ?? ''
    for (const field of ['source', 'target'] as const) {
      const reference = drawioCellAttribute(edge, field) ?? ''
      if (!reference || !ids.has(reference)) {
        diagnostics.push({
          code: 'structure/missing-reference',
          severity: 'error',
          message: `连线 ${id} 的 ${field} 引用了不存在的节点。`,
          subject: { kind: 'edge', id, field },
          evidence: drawioPageEvidence(page, { reference }),
          supportedFixes: ['repair-reference', 'delete-edge'],
        })
      }
    }
  }

  const minX = Math.min(0, ...rectangles.map((item) => item.x))
  const minY = Math.min(0, ...rectangles.map((item) => item.y))
  const maxX = Math.max(1, ...rectangles.map((item) => item.x + item.width))
  const maxY = Math.max(1, ...rectangles.map((item) => item.y + item.height))
  if (minX < 0 || minY < 0) {
    diagnostics.push(diagnostic(
      'artifact/canvas-clipped',
      '存在位于画布负坐标区域的图形，导出时可能被裁切。',
      { kind: 'diagram' },
      ['move-node', 'expand-canvas'],
      profile,
      drawioPageEvidence(page, { minX: Math.round(minX), minY: Math.round(minY) }),
    ))
  }

  return {
    diagnostics,
    counts: { nodes: nodes.length, edges: edges.length, lanes: lanes.length },
    dimensions: { width: Math.ceil(maxX - minX), height: Math.ceil(maxY - minY) },
  }
}

function drawioDiagnostics(
  xml: string,
  profile: DiagramQualityProfile,
): {
  diagnostics: DiagramDiagnostic[]
  counts: DiagramQualityReceipt['counts']
  dimensions?: DiagramQualityReceipt['dimensions']
} {
  const parsed = parseDrawioPageModels(xml)
  if (parsed.error) {
    return {
      diagnostics: [{
        code: 'structure/drawio-invalid',
        severity: 'error',
        message: parsed.error,
        subject: { kind: 'source' },
        supportedFixes: ['repair-xml', 'regenerate-plan'],
      }],
      counts: { nodes: 0, edges: 0, lanes: 0 },
      dimensions: undefined,
    }
  }

  const aggregate = {
    diagnostics: [] as DiagramDiagnostic[],
    counts: { nodes: 0, edges: 0, lanes: 0 },
    dimensions: { width: 1, height: 1 },
  }
  for (const page of parsed.pages) {
    const inspection = drawioPageDiagnostics(page, profile)
    aggregate.diagnostics.push(...inspection.diagnostics)
    aggregate.counts.nodes += inspection.counts.nodes
    aggregate.counts.edges += inspection.counts.edges
    aggregate.counts.lanes += inspection.counts.lanes
    aggregate.dimensions.width = Math.max(aggregate.dimensions.width, inspection.dimensions.width)
    aggregate.dimensions.height = Math.max(aggregate.dimensions.height, inspection.dimensions.height)
  }
  return aggregate
}

function qualityChecks(diagnostics: DiagramDiagnostic[]): DiagramQualityCheck[] {
  return [
    check('structure', '结构与引用完整', ['structure/drawio-invalid', 'structure/missing-reference', 'structure/empty-diagram', 'artifact/svg-invalid'], diagnostics),
    check('geometry', '几何尺寸有效', ['geometry/non-finite'], diagnostics),
    check('text', '所有文字在边框内', ['layout/text-overflow', 'layout/text-clipped'], diagnostics),
    check('overlap', '节点与泳道互不重叠', ['layout/node-overlap', 'layout/lane-overlap', 'layout/lane-overflow'], diagnostics),
    check('canvas', '画布完整且未裁切', ['artifact/canvas-clipped', 'artifact/canvas-too-large'], diagnostics),
    check('safety', '成品不含可执行内容', ['artifact/unsafe-content'], diagnostics),
  ]
}

async function receipt(
  engine: DiagramQualityEngine,
  source: string,
  profile: DiagramQualityProfile,
  diagnostics: DiagramDiagnostic[],
  counts: DiagramQualityReceipt['counts'],
  dimensions?: DiagramQualityReceipt['dimensions'],
  output?: string | Blob,
  originalInput = source,
): Promise<DiagramQualityReceipt> {
  const checks = qualityChecks(diagnostics)
  return {
    receiptVersion: 1,
    engine,
    quality: profile,
    ok: !diagnostics.some((item) => item.severity === 'error'),
    acceptance: diagnostics.some((item) => item.severity === 'error') ? 'rejected' : 'provisional',
    generatedAt: new Date().toISOString(),
    inputSha256: await sha256(originalInput),
    ...(output ? {
      outputSha256: await sha256(await artifactText(output)),
      outputBytes: output instanceof Blob ? output.size : byteLength(output),
    } : {}),
    ...(dimensions ? { dimensions } : {}),
    counts,
    checks,
    diagnostics,
    visualReview: 'pending',
  }
}

/**
 * Deep module interface for deterministic assessment and delivery. Desktop AI,
 * both canvases and the CLI cross this same seam; renderers remain internal
 * adapters so diagnostics and acceptance rules stay identical.
 */
export async function assessMermaidDiagram(
  source: string,
  result: RenderResult,
  profile: DiagramQualityProfile = 'professional',
  output?: string | Blob,
  originalInput?: string,
): Promise<DiagramQualityReceipt> {
  const finalSvg = typeof output === 'string' && /<svg\b/i.test(output) ? output : result.svg
  const staticInspection = inspectSvgMarkup(finalSvg, result, profile)
  const diagnostics = [...staticInspection.diagnostics, ...inspectMountedMermaidSvg(finalSvg, profile)]
  const unique = diagnostics.filter((item, index, all) => all.findIndex((candidate) => (
    candidate.code === item.code
    && candidate.subject.id === item.subject.id
    && candidate.message === item.message
  )) === index)
  return receipt(
    'mermaid',
    source,
    profile,
    unique,
    staticInspection.counts,
    { width: Math.ceil(result.width), height: Math.ceil(result.height) },
    output,
    originalInput,
  )
}

export async function assessDrawioDiagram(
  xml: string,
  profile: DiagramQualityProfile = 'professional',
  output?: string | Blob,
  originalInput?: string,
): Promise<DiagramQualityReceipt> {
  const outputSvg = typeof output === 'string' && /<svg\b/i.test(output) ? output : ''
  const inspection = drawioDiagnostics(xml, profile)
  if (outputSvg) {
    const parsed = parseSvg(outputSvg)
    if (!parsed) {
      inspection.diagnostics.push({
        code: 'artifact/svg-invalid',
        severity: 'error',
        message: '可视化画布导出的最终 SVG 无法解析。',
        subject: { kind: 'artifact' },
        supportedFixes: ['rerender-artifact'],
      })
    } else {
      const unsafe = parsed.querySelector('script, iframe, object, embed, foreignObject script')
      if (unsafe) inspection.diagnostics.push({
        code: 'artifact/unsafe-content',
        severity: 'error',
        message: '最终 SVG 中包含不允许的可执行内容。',
        subject: { kind: 'artifact' },
        supportedFixes: ['sanitize-artifact'],
      })
      const visibleText = [...parsed.querySelectorAll('text')]
        .some((item) => (item.textContent ?? '').replace(/\u00a0/g, ' ').trim().length > 0)
      const businessShapeCount = parsed.querySelectorAll('rect:not([data-fengsha-export-background]), path, ellipse, polygon').length
      if (!visibleText || businessShapeCount < 2) {
        inspection.diagnostics.push({
          code: 'structure/empty-diagram',
          severity: 'error',
          message: '最终 SVG 中没有检测到可交付的文字与图形。',
          subject: { kind: 'artifact' },
          evidence: { visibleText, businessShapeCount },
          supportedFixes: ['rerender-artifact', 'regenerate-plan'],
        })
      }
      if (!inspection.counts.nodes) inspection.counts = svgCounts(parsed)
      if (!inspection.dimensions) {
        const viewBox = parsed.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number)
        if (viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
          inspection.dimensions = { width: Math.ceil(viewBox[2]), height: Math.ceil(viewBox[3]) }
        }
      }
    }
  }
  return receipt('drawio', xml, profile, inspection.diagnostics, inspection.counts, inspection.dimensions, output, originalInput)
}

export async function deliverMermaidDiagram(
  source: string,
  options: CliRenderOptions,
  profile: DiagramQualityProfile = 'professional',
  originalInput?: string,
): Promise<MermaidDeliveryResult> {
  const artifact = await generateDiagramArtifact(source, options)
  const receiptResult = await assessMermaidDiagram(source, artifact.result, profile, artifact.canonicalSvg, originalInput)
  receiptResult.outputSha256 = await sha256(artifact.data)
  receiptResult.outputBytes = artifact.data instanceof Blob ? artifact.data.size : byteLength(artifact.data)
  receiptResult.dimensions = { width: artifact.outputWidth, height: artifact.outputHeight }
  return { artifact, receipt: receiptResult }
}

export function firstBlockingDiagnostic(receiptResult: DiagramQualityReceipt): DiagramDiagnostic | undefined {
  return receiptResult.diagnostics.find((item) => item.severity === 'error')
}

export function qualityFailureMessage(receiptResult: DiagramQualityReceipt): string {
  return receiptResult.diagnostics
    .filter((item) => item.severity === 'error')
    .slice(0, 6)
    .map((item) => {
      const target = item.subject.id ? ` ${item.subject.kind}:${item.subject.id}` : ''
      const fixes = item.supportedFixes.length ? `；可用修复：${item.supportedFixes.join(', ')}` : ''
      return `[${item.code}]${target} ${item.message}${fixes}`
    })
    .join(' | ') || '图表未通过专业质量检查。'
}

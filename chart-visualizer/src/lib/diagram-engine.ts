import type { DiagramKind, DiagramTheme, RenderError, RenderResult } from '@/types'
import { findClippedRenderedNodeLabelDetails, repairMermaidLabelVisibility } from '@/lib/mermaid-label-visibility'

let renderSequence = 0
let mermaidLoader: Promise<typeof import('mermaid')['default']> | null = null

function loadMermaid() {
  mermaidLoader ??= import('mermaid').then((module) => module.default)
  return mermaidLoader
}

export function detectDiagramKind(code: string): DiagramKind {
  const first = code
    .replace(/^---[\s\S]*?---\s*/m, '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('%%'))
    ?.toLowerCase() ?? ''

  if (/^(flowchart|graph)\b/.test(first)) return 'flowchart'
  if (/^swimlane-beta\b/.test(first)) return 'swimlane'
  if (/^architecture-beta\b/.test(first)) return 'architecture'
  if (/^sequencediagram\b/.test(first)) return 'sequence'
  if (/^classdiagram\b/.test(first)) return 'class'
  if (/^statediagram/.test(first)) return 'state'
  if (/^erdiagram\b/.test(first)) return 'er'
  if (/^gantt\b/.test(first)) return 'gantt'
  if (/^mindmap\b/.test(first)) return 'mindmap'
  if (/^journey\b/.test(first)) return 'journey'
  if (/^c4/.test(first)) return 'c4'
  return 'other'
}

function dimensionsFromSvg(svg: string): { width: number; height: number } {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const element = parsed.documentElement
  const viewBox = element.getAttribute('viewBox')?.split(/[ ,]+/).map(Number)
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
    return { width: Math.max(1, viewBox[2]), height: Math.max(1, viewBox[3]) }
  }
  const width = Number.parseFloat(element.getAttribute('width') ?? '')
  const height = Number.parseFloat(element.getAttribute('height') ?? '')
  return {
    width: Number.isFinite(width) ? width : 1200,
    height: Number.isFinite(height) ? height : 800,
  }
}

function normalizeError(error: unknown): RenderError {
  const raw = error instanceof Error ? error.message : String(error)
  const lineMatch = raw.match(/line\s+(\d+)/i) ?? raw.match(/(?:^|\n)(\d+):\d+/)
  const compact = raw
    .replace(/^Error:\s*/i, '')
    .replace(/Parse error on line \d+:?\s*/i, '')
    .split('\n')[0]
    .trim()

  return {
    message: compact || '图表语法无法解析，请检查代码。',
    line: lineMatch ? Number(lineMatch[1]) : undefined,
    raw,
  }
}

function clippedLabelsFromSvg(svgMarkup: string) {
  const staging = document.createElement('div')
  staging.setAttribute('aria-hidden', 'true')
  staging.style.cssText = 'position:fixed;left:-100000px;top:0;opacity:0;pointer-events:none;'
  staging.innerHTML = svgMarkup
  document.body.appendChild(staging)
  try {
    return findClippedRenderedNodeLabelDetails(staging)
  } finally {
    staging.remove()
  }
}

export async function renderDiagram(code: string, theme: DiagramTheme): Promise<RenderResult> {
  if (!code.trim()) {
    throw { message: '请输入 Mermaid 图表代码。', raw: 'Empty diagram source' } satisfies RenderError
  }

  const mermaid = await loadMermaid()
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: true,
    suppressErrorRendering: true,
    theme: theme.mermaidTheme,
    fontFamily: '"Aptos", "Noto Sans SC", "Microsoft YaHei", sans-serif',
    themeVariables: {
      background: theme.surface,
      primaryColor: theme.secondary,
      primaryTextColor: theme.text,
      primaryBorderColor: theme.primary,
      secondaryColor: theme.note,
      secondaryTextColor: theme.text,
      secondaryBorderColor: theme.line,
      tertiaryColor: theme.surface,
      tertiaryTextColor: theme.text,
      tertiaryBorderColor: theme.line,
      lineColor: theme.line,
      textColor: theme.text,
      mainBkg: theme.secondary,
      nodeBorder: theme.primary,
      clusterBkg: theme.surface,
      clusterBorder: theme.line,
      edgeLabelBackground: theme.surface,
      noteBkgColor: theme.note,
      noteTextColor: theme.text,
      noteBorderColor: theme.line,
      actorBkg: theme.secondary,
      actorBorder: theme.primary,
      actorTextColor: theme.text,
      signalColor: theme.line,
      signalTextColor: theme.text,
      labelBoxBkgColor: theme.surface,
      labelBoxBorderColor: theme.line,
      labelTextColor: theme.text,
    },
    flowchart: {
      curve: 'basis',
      padding: 18,
    },
    sequence: {
      useMaxWidth: false,
      wrap: true,
      diagramMarginX: 36,
      diagramMarginY: 24,
    },
  })

  try {
    await mermaid.parse(code)
    let renderCode = code
    let svg = ''
    // Mermaid lays out HTML labels before the browser has applied its final
    // Chinese font metrics. Compile, measure the real foreignObject viewport,
    // then recompile with deterministic line breaks. This keeps user source
    // untouched while preview, SVG and raster exports share one safe geometry.
    for (let pass = 0; pass < 3; pass += 1) {
      const id = `diagram-${Date.now()}-${renderSequence++}`
      ;({ svg } = await mermaid.render(id, renderCode))
      if (detectDiagramKind(code) !== 'flowchart') break
      const clipped = clippedLabelsFromSvg(svg)
      if (!clipped.length) break
      const repaired = repairMermaidLabelVisibility(renderCode, clipped)
      if (!repaired.changedLabels) break
      renderCode = repaired.code
    }
    const dimensions = dimensionsFromSvg(svg)
    return { svg, ...dimensions, kind: detectDiagramKind(code) }
  } catch (error) {
    throw normalizeError(error)
  }
}

export function isRenderError(error: unknown): error is RenderError {
  return Boolean(error && typeof error === 'object' && 'message' in error && 'raw' in error)
}

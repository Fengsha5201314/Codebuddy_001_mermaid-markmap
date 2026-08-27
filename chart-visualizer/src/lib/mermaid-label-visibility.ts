export interface MermaidLabelRepairResult {
  code: string
  changedLabels: number
  insertedBreaks: number
}

export interface OverflowingNodeLabel {
  text: string
  maximumLineUnits: number
}

const BREAK_TAG = /<br\s*\/?>/gi

function characterUnits(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0
  if (/\s/u.test(character)) return 0.33
  if (codePoint >= 0x2e80 || codePoint > 0xffff) return 1
  if (/[A-Z0-9]/.test(character)) return 0.62
  if (/[a-z]/.test(character)) return 0.54
  return 0.5
}

function textUnits(value: string): number {
  return [...value].reduce((total, character) => total + characterUnits(character), 0)
}

export function estimateSvgTextWidth(value: string, fontSize: number): number {
  return textUnits(value) * fontSize
}

function preferredBreakIndex(value: string): number {
  const characters = [...value]
  for (let index = characters.length - 1; index >= Math.max(0, characters.length - 7); index -= 1) {
    if (/[\s／/、，,；;：:]/u.test(characters[index])) return index + 1
  }
  return -1
}

function wrapPlainLine(value: string, maximumUnits: number): string[] {
  const trimmed = value.trim()
  if (!trimmed || textUnits(trimmed) <= maximumUnits) return trimmed ? [trimmed] : []

  const output: string[] = []
  let current = ''
  for (const character of [...trimmed]) {
    if (current && textUnits(current + character) > maximumUnits) {
      const breakIndex = preferredBreakIndex(current)
      if (breakIndex > 0 && breakIndex < [...current].length) {
        const currentCharacters = [...current]
        output.push(currentCharacters.slice(0, breakIndex).join('').trim())
        current = currentCharacters.slice(breakIndex).join('').trimStart()
      } else {
        output.push(current.trim())
        current = ''
      }
    }
    current += character
  }
  if (current.trim()) output.push(current.trim())
  return output.filter(Boolean)
}

export function wrapTextToPixelWidth(value: string, fontSize: number, maximumWidth: number): string[] {
  const maximumUnits = Math.max(4, maximumWidth / Math.max(1, fontSize))
  return value
    .split(BREAK_TAG)
    .flatMap((line) => wrapPlainLine(line, maximumUnits))
}

function comparisonKey(value: string): string {
  return value
    .replace(BREAK_TAG, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, '')
    .replace(/\s+/g, '')
    .trim()
}

function shapeWidth(node: Element): number {
  const rect = node.querySelector('.label-container[width], rect.label-container[width]')
  const rectWidth = Number.parseFloat(rect?.getAttribute('width') ?? '')
  if (Number.isFinite(rectWidth) && rectWidth > 0) return rectWidth

  const ellipse = node.querySelector('ellipse.label-container, ellipse')
  const radiusX = Number.parseFloat(ellipse?.getAttribute('rx') ?? '')
  if (Number.isFinite(radiusX) && radiusX > 0) return radiusX * 2

  const polygon = node.querySelector('polygon.label-container, polygon')
  const points = polygon?.getAttribute('points')?.trim().split(/\s+/).map((point) => Number.parseFloat(point.split(',')[0])).filter(Number.isFinite)
  return points?.length ? Math.max(...points) - Math.min(...points) : 0
}

function foreignObjectLines(foreignObject: Element): string[] {
  const root = foreignObject.querySelector('.nodeLabel') ?? foreignObject
  const lines = ['']
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      lines[lines.length - 1] += node.textContent ?? ''
      return
    }
    if (!(node instanceof Element)) return
    if (node.localName.toLowerCase() === 'br') {
      lines.push('')
      return
    }
    node.childNodes.forEach(visit)
  }
  visit(root)
  return lines.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

/**
 * Inspect the actual mounted SVG. Mermaid's foreignObject is a clipping
 * viewport, so only live layout metrics can reliably tell whether a browser
 * has hidden the end of a Chinese label.
 */
export function findClippedRenderedNodeLabelDetails(root: ParentNode): OverflowingNodeLabel[] {
  const clipped = new Map<string, OverflowingNodeLabel>()
  root.querySelectorAll<SVGForeignObjectElement>('.node foreignObject').forEach((foreignObject) => {
    const content = foreignObject.firstElementChild
    if (!(content instanceof HTMLElement)) return
    const width = Number.parseFloat(foreignObject.getAttribute('width') ?? '') || foreignObject.getBoundingClientRect().width
    const height = Number.parseFloat(foreignObject.getAttribute('height') ?? '') || foreignObject.getBoundingClientRect().height
    const scrollWidth = Math.max(content.scrollWidth, content.firstElementChild?.scrollWidth ?? 0)
    const scrollHeight = Math.max(content.scrollHeight, content.firstElementChild?.scrollHeight ?? 0)
    if (scrollWidth <= width + 0.5 && scrollHeight <= height + 0.5) return
    const lines = foreignObjectLines(foreignObject)
    const label = lines.join('').replace(/\s+/g, ' ').trim()
    if (!label) return
    const fontSize = Number.parseFloat(window.getComputedStyle(content).fontSize) || 16
    const detail = {
      text: label,
      maximumLineUnits: Math.max(4, Math.floor(Math.max(24, width - 8) / fontSize * 10) / 10),
    }
    const key = comparisonKey(label)
    const existing = clipped.get(key)
    if (!existing || detail.maximumLineUnits < existing.maximumLineUnits) clipped.set(key, detail)
  })
  return [...clipped.values()]
}

export function findOverflowingNodeLabelDetails(svgMarkup: string): OverflowingNodeLabel[] {
  // Mermaid embeds XHTML and CSS that some strict XML parsers reject. HTML
  // parsing keeps the SVG tree queryable for reliable in-app diagnostics.
  const parsed = new DOMParser().parseFromString(svgMarkup, 'text/html')
  const overflowing = new Map<string, OverflowingNodeLabel>()

  parsed.querySelectorAll('.node').forEach((node) => {
    const width = shapeWidth(node)
    const text = node.querySelector('text')
    const foreignObject = node.querySelector('foreignObject')
    if ((!text && !foreignObject) || width <= 24) return
    const fontSize = Number.parseFloat(text?.getAttribute('font-size') ?? node.getAttribute('font-size') ?? '') || 16
    const tspans = text ? [...text.querySelectorAll('tspan')] : []
    const lines = foreignObject
      ? foreignObjectLines(foreignObject)
      : tspans.length
        ? tspans.map((tspan) => tspan.textContent ?? '')
        : [text?.textContent ?? '']
    // Static SVG inspection remains useful for non-mounted callers, but the
    // button uses findClippedRenderedNodeLabelDetails for exact browser metrics.
    const maximumWidth = width - 24
    if (lines.some((line) => estimateSvgTextWidth(line, fontSize) > maximumWidth)) {
      const label = lines.join('').replace(/\s+/g, ' ').trim()
      if (label) {
        const key = comparisonKey(label)
        const detail = { text: label, maximumLineUnits: Math.max(4, Math.floor(maximumWidth / fontSize * 10) / 10) }
        const existing = overflowing.get(key)
        if (!existing || detail.maximumLineUnits < existing.maximumLineUnits) overflowing.set(key, detail)
      }
    }
  })

  return [...overflowing.values()]
}

export function findOverflowingNodeLabels(svgMarkup: string): string[] {
  return findOverflowingNodeLabelDetails(svgMarkup).map((item) => item.text)
}

export function repairMermaidLabelVisibility(
  code: string,
  overflowingLabels: Array<string | OverflowingNodeLabel>,
  maximumLineUnits = 13,
): MermaidLabelRepairResult {
  const targets = new Map<string, number>()
  overflowingLabels.forEach((item) => {
    const text = typeof item === 'string' ? item : item.text
    const key = comparisonKey(text)
    if (!key) return
    const requestedMaximum = typeof item === 'string' ? maximumLineUnits : Math.min(maximumLineUnits, item.maximumLineUnits)
    const existing = targets.get(key)
    if (existing === undefined || requestedMaximum < existing) targets.set(key, requestedMaximum)
  })
  let changedLabels = 0
  let insertedBreaks = 0

  const repairedCode = code.split('\n').map((line) => {
    return line.replace(/"((?:\\.|[^"\\])*)"/g, (quoted, label: string, offset: number) => {
      const preceding = line[offset - 1] ?? ''
      const targetMaximum = targets.get(comparisonKey(label))
      if (!'[({'.includes(preceding) || targetMaximum === undefined) return quoted
      const wrappedLines = label.split(BREAK_TAG).flatMap((part) => wrapPlainLine(part, targetMaximum))
      const replacement = wrappedLines.join('<br/>')
      if (!replacement || replacement === label) return quoted
      changedLabels += 1
      insertedBreaks += Math.max(0, wrappedLines.length - 1) - Math.max(0, label.split(BREAK_TAG).length - 1)
      return `"${replacement}"`
    })
  }).join('\n')

  return { code: repairedCode, changedLabels, insertedBreaks }
}

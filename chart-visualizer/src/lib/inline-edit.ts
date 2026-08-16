import type { DiagramKind } from '@/types'

export type InlineTextContext =
  | 'quoted'
  | 'delimited'
  | 'message'
  | 'alias'
  | 'heading'
  | 'task'
  | 'mindmap'

export interface InlineTextMatch {
  start: number
  end: number
  line: number
  column: number
  context: InlineTextContext
  closingDelimiter?: string
  preview: string
}

export function normalizeRenderedText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function classifyOccurrence(
  line: string,
  startInLine: number,
  text: string,
  kind: DiagramKind,
): Pick<InlineTextMatch, 'context' | 'closingDelimiter'> | null {
  const prefix = line.slice(0, startInLine)
  const suffix = line.slice(startInLine + text.length)
  const previous = prefix.at(-1)
  const next = suffix[0]

  if (previous === '"' && next === '"') return { context: 'quoted', closingDelimiter: '"' }
  if (previous === '|' && next === '|') return { context: 'delimited', closingDelimiter: '|' }
  if (previous && next && '[{('.includes(previous) && ']})'.includes(next)) {
    return { context: 'delimited', closingDelimiter: next }
  }

  if (/\b(?:actor|participant)\s+[\w.-]+\s+as\s*$/i.test(prefix) && !suffix.trim()) {
    return { context: 'alias' }
  }

  if (/^\s*(?:title|section)\s+$/i.test(prefix) && !suffix.trim()) {
    return { context: 'heading' }
  }

  if (
    kind === 'sequence'
    && /^\s*(?:alt|else|opt|loop|par|and|rect|critical|option|break)\s+$/i.test(prefix)
    && !suffix.trim()
  ) {
    return { context: 'heading' }
  }

  if (['sequence', 'state', 'er'].includes(kind) && prefix.includes(':') && !suffix.trim()) {
    return { context: 'message' }
  }

  if (['gantt', 'journey'].includes(kind) && !prefix.trim() && /^\s*:/.test(suffix)) {
    return { context: 'task' }
  }

  if (kind === 'mindmap' && !prefix.trim() && !suffix.trim()) {
    return { context: 'mindmap' }
  }

  return null
}

export function findEditableTextMatches(
  code: string,
  renderedText: string,
  kind: DiagramKind,
): InlineTextMatch[] {
  const text = normalizeRenderedText(renderedText)
  if (!text) return []

  const matches: InlineTextMatch[] = []
  const lines = code.split('\n')
  let lineStart = 0

  lines.forEach((line, lineIndex) => {
    if (/^\s*%%/.test(line)) {
      lineStart += line.length + 1
      return
    }

    let fromIndex = 0
    while (fromIndex <= line.length - text.length) {
      const startInLine = line.indexOf(text, fromIndex)
      if (startInLine < 0) break
      const classification = classifyOccurrence(line, startInLine, text, kind)
      if (classification) {
        matches.push({
          start: lineStart + startInLine,
          end: lineStart + startInLine + text.length,
          line: lineIndex + 1,
          column: startInLine + 1,
          preview: line.trim().slice(0, 96),
          ...classification,
        })
      }
      fromIndex = startInLine + Math.max(1, text.length)
    }

    lineStart += line.length + 1
  })

  return matches
}

function safeReplacement(value: string, match: InlineTextMatch): string {
  let normalized = normalizeRenderedText(value)
  if (match.context === 'quoted') normalized = normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  if (match.closingDelimiter === '|') normalized = normalized.replace(/\|/g, '｜')
  if (match.closingDelimiter === ']') normalized = normalized.replace(/\]/g, '］')
  if (match.closingDelimiter === '}') normalized = normalized.replace(/}/g, '｝')
  if (match.closingDelimiter === ')') normalized = normalized.replace(/\)/g, '）')
  if (match.context === 'task') normalized = normalized.replace(/:/g, '：')
  return normalized
}

export function replaceEditableText(code: string, match: InlineTextMatch, nextText: string): string {
  const replacement = safeReplacement(nextText, match)
  if (!replacement) return code
  return `${code.slice(0, match.start)}${replacement}${code.slice(match.end)}`
}

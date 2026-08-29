import { Inflate } from 'pako'

export interface DrawioPageModel {
  pageIndex: number
  pageId: string
  pageName: string
  model: Element
}

export type DrawioPageModelsResult =
  | { error: null; pages: DrawioPageModel[] }
  | { error: string; pages: [] }

const MAX_COMPRESSED_PAGE_BYTES = 5 * 1024 * 1024
const MAX_INFLATED_PAGE_BYTES = 24 * 1024 * 1024
const MAX_DRAWIO_SOURCE_BYTES = 8 * 1024 * 1024
const MAX_DRAWIO_PAGES = 500
const UNSAFE_XML_PATTERN = /<\?xml-stylesheet|(?:<|&lt;)(?:script|iframe|object|embed|link|meta)\b|(?:(?:javascript|vbscript)\s*:|data\s*:\s*text\/html)|\son[a-z0-9_-]+\s*=/i

function parserErrorMessage(parsed: Document, prefix = '画布 XML'): string | null {
  const parserError = parsed.querySelector('parsererror')
  if (!parserError) return null
  const detail = (parserError.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 360)
  const location = detail.match(/(?:line\s*)?(\d+)\s*[: ,]\s*(?:column\s*)?(\d+)\s*[: -]?\s*(.*)/i)
  if (location) {
    const reason = location[3]?.trim()
    return `${prefix} 格式不正确（第 ${location[1]} 行，第 ${location[2]} 列${reason ? `：${reason}` : ''}）。`
  }
  return `${prefix} 格式不正确${detail ? `：${detail}` : '。'}`
}

function base64Bytes(value: string): Uint8Array {
  const compact = value.replace(/\s+/g, '')
  if (compact.length < 16 || compact.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new Error('不是可识别的 draw.io 压缩数据')
  }
  const estimatedBytes = Math.floor(compact.length * 3 / 4)
  if (estimatedBytes > MAX_COMPRESSED_PAGE_BYTES) throw new Error('压缩数据超过安全大小限制')
  let binary = ''
  try {
    binary = atob(compact)
  } catch {
    throw new Error('不是有效的 Base64 压缩数据')
  }
  if (binary.length > MAX_COMPRESSED_PAGE_BYTES) throw new Error('压缩数据超过安全大小限制')
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function inflateDrawioPage(value: string, maximumBytes: number): { xml: string; byteLength: number } {
  const inflater = new Inflate({ raw: true, chunkSize: 64 * 1024 })
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  inflater.onData = (chunk) => {
    totalBytes += chunk.byteLength
    if (totalBytes > maximumBytes) throw new Error('解压结果超过安全大小限制')
    chunks.push(chunk)
  }
  inflater.push(base64Bytes(value), true)
  if (inflater.err || !inflater.ended) throw new Error(inflater.msg || '压缩数据不完整')

  const inflated = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    inflated.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    const encodedXml = new TextDecoder('utf-8', { fatal: true }).decode(inflated)
    return { xml: decodeURIComponent(encodedXml), byteLength: totalBytes }
  } catch {
    throw new Error('解压结果不是有效的 draw.io XML 文本')
  }
}

/**
 * Parses both uncompressed and standard diagrams.net compressed pages.
 * Decompression is bounded and every returned page owns an independent model.
 */
export function parseDrawioPageModels(xml: string): DrawioPageModelsResult {
  const source = xml.trim()
  if (!source) return { error: '画布 XML 为空。', pages: [] }
  if (new TextEncoder().encode(source).byteLength > MAX_DRAWIO_SOURCE_BYTES) return { error: '画布 XML 超过安全大小限制。', pages: [] }
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) return { error: '画布 XML 不能包含外部实体。', pages: [] }
  if (UNSAFE_XML_PATTERN.test(source)) return { error: '画布 XML 包含不安全的脚本内容。', pages: [] }

  const parsed = new DOMParser().parseFromString(source, 'application/xml')
  const parseError = parserErrorMessage(parsed)
  if (parseError) return { error: parseError, pages: [] }
  const root = parsed.documentElement
  if (root.tagName !== 'mxfile') return { error: '画布 XML 缺少 mxfile 根节点。', pages: [] }
  const diagrams = [...root.querySelectorAll(':scope > diagram')]
  if (!diagrams.length) return { error: '画布 XML 中没有图页。', pages: [] }
  if (diagrams.length > MAX_DRAWIO_PAGES) return { error: `画布 XML 图页数量超过安全上限 ${MAX_DRAWIO_PAGES}。`, pages: [] }

  const pages: DrawioPageModel[] = []
  let totalInflatedBytes = 0
  for (const [pageIndex, diagram] of diagrams.entries()) {
    let model = diagram.querySelector(':scope > mxGraphModel')
    if (!model) {
      const compressed = diagram.textContent?.trim() ?? ''
      let inflated = ''
      try {
        const result = inflateDrawioPage(compressed, MAX_INFLATED_PAGE_BYTES - totalInflatedBytes)
        inflated = result.xml
        totalInflatedBytes += result.byteLength
      } catch (error) {
        const reason = error instanceof Error ? error.message : '无法安全解压'
        return { error: `第 ${pageIndex + 1} 个图页不是可识别的 mxGraphModel 或 draw.io 压缩数据：${reason}。`, pages: [] }
      }
      if (/<!DOCTYPE|<!ENTITY/i.test(inflated)) return { error: `第 ${pageIndex + 1} 个图页不能包含外部实体。`, pages: [] }
      if (UNSAFE_XML_PATTERN.test(inflated)) return { error: `第 ${pageIndex + 1} 个图页包含不安全的脚本内容。`, pages: [] }
      const modelDocument = new DOMParser().parseFromString(inflated, 'application/xml')
      const modelError = parserErrorMessage(modelDocument, `第 ${pageIndex + 1} 个图页`)
      if (modelError) return { error: modelError, pages: [] }
      model = modelDocument.documentElement.tagName === 'mxGraphModel' ? modelDocument.documentElement : null
      if (!model) return { error: `第 ${pageIndex + 1} 个图页解压后缺少 mxGraphModel 根节点。`, pages: [] }
    }
    pages.push({
      pageIndex,
      pageId: diagram.getAttribute('id')?.trim() || `page-${pageIndex + 1}`,
      pageName: diagram.getAttribute('name')?.trim() || `第 ${pageIndex + 1} 页`,
      model,
    })
  }
  const validationError = validateDrawioPageModels(pages)
  return validationError ? { error: validationError, pages: [] } : { error: null, pages }
}

function validateDrawioPageModels(pages: DrawioPageModel[]): string | null {
  for (const page of pages) {
    const pageIndex = page.pageIndex
    const model = page.model
    const graphRoot = model.querySelector(':scope > root')
    if (!graphRoot) return `第 ${pageIndex + 1} 个图页缺少 mxGraphModel/root。`
    // diagrams.net may wrap a cell in UserObject/object so metadata such as the
    // original Mermaid source survives round-trips. The cell identity and
    // references then live on the wrapper while geometry remains on mxCell.
    const cells = [...graphRoot.children].flatMap((holder) => {
      if (holder.tagName === 'mxCell') return [{ holder, cell: holder }]
      const cell = holder.querySelector(':scope > mxCell')
      return cell ? [{ holder, cell }] : []
    })
    const attribute = (entry: (typeof cells)[number], name: string) => (
      entry.holder.getAttribute(name) ?? entry.cell.getAttribute(name)
    )
    const ids = new Set<string>()
    for (const entry of cells) {
      const id = attribute(entry, 'id')?.trim()
      if (!id) return `第 ${pageIndex + 1} 个图页存在缺少 ID 的 mxCell。`
      if (ids.has(id)) return `第 ${pageIndex + 1} 个图页存在重复 ID：${id}。`
      ids.add(id)
    }
    if (!ids.has('0') || !ids.has('1')) return `第 ${pageIndex + 1} 个图页缺少标准根节点 0 或 1。`
    for (const entry of cells) {
      const id = attribute(entry, 'id')!
      for (const referenceName of ['parent', 'source', 'target'] as const) {
        const reference = attribute(entry, referenceName)?.trim()
        if (reference && !ids.has(reference)) return `图形 ${id} 引用了不存在的 ${referenceName}：${reference}。`
      }
      const isVertex = attribute(entry, 'vertex') === '1'
      const isEdge = attribute(entry, 'edge') === '1'
      const style = attribute(entry, 'style') ?? ''
      const isAutoSizedGroup = /(?:^|;)group(?:=|;)/i.test(style)
      const geometry = entry.cell.querySelector(':scope > mxGeometry')
      if ((isVertex || isEdge) && !geometry) return `图形 ${id} 缺少 mxGeometry。`
      if (isVertex && geometry) {
        const isRelative = geometry.getAttribute('relative') === '1'
        for (const geometryName of ['x', 'y', 'width', 'height'] as const) {
          const raw = geometry.getAttribute(geometryName)
          const isSize = geometryName === 'width' || geometryName === 'height'
          if (isSize && raw === null && !isAutoSizedGroup && !isRelative) return `图形 ${id} 缺少 ${geometryName}。`
          if (raw === null) continue
          const value = Number(raw)
          if (!Number.isFinite(value) || (isSize && (value < 0 || (!isRelative && value === 0)))) {
            return `图形 ${id} 的 ${geometryName} 不是有效几何数值。`
          }
        }
      }
      if (isEdge && (!attribute(entry, 'source') || !attribute(entry, 'target'))) return `连线 ${id} 缺少 source 或 target。`
    }
  }
  return null
}

export function validateDrawioXml(xml: string): string | null {
  return parseDrawioPageModels(xml).error
}

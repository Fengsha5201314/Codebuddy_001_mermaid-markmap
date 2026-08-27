export function validateDrawioXml(xml: string): string | null {
  const source = xml.trim()
  if (!source) return '画布 XML 为空。'
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) return '画布 XML 不能包含外部实体。'
  if (/<\?xml-stylesheet|(?:<|&lt;)(?:script|iframe|object|embed|link|meta)\b|(?:(?:javascript|vbscript)\s*:|data\s*:\s*text\/html)|\son[a-z0-9_-]+\s*=/i.test(source)) {
    return '画布 XML 包含不安全的脚本内容。'
  }

  const parsed = new DOMParser().parseFromString(source, 'application/xml')
  const parserError = parsed.querySelector('parsererror')
  if (parserError) {
    const detail = (parserError.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 360)
    const location = detail.match(/(?:line\s*)?(\d+)\s*[: ,]\s*(?:column\s*)?(\d+)\s*[: -]?\s*(.*)/i)
    if (location) {
      const reason = location[3]?.trim()
      return `画布 XML 格式不正确（第 ${location[1]} 行，第 ${location[2]} 列${reason ? `：${reason}` : ''}）。`
    }
    return `画布 XML 格式不正确${detail ? `：${detail}` : '。'}`
  }
  const root = parsed.documentElement
  if (root.tagName !== 'mxfile') return '画布 XML 缺少 mxfile 根节点。'
  const diagrams = root.querySelectorAll('diagram')
  if (!diagrams.length) return '画布 XML 中没有图页。'
  const hasGraph = [...diagrams].some((diagram) => diagram.querySelector('mxGraphModel') || diagram.textContent?.trim())
  if (!hasGraph) return '画布 XML 中没有可用的图形数据。'

  for (const [pageIndex, diagram] of [...diagrams].entries()) {
    const model = diagram.querySelector('mxGraphModel')
    if (!model) continue
    const graphRoot = model.querySelector(':scope > root')
    if (!graphRoot) return `第 ${pageIndex + 1} 个图页缺少 mxGraphModel/root。`
    const cells = [...graphRoot.querySelectorAll(':scope > mxCell')]
    const ids = new Set<string>()
    for (const cell of cells) {
      const id = cell.getAttribute('id')?.trim()
      if (!id) return `第 ${pageIndex + 1} 个图页存在缺少 ID 的 mxCell。`
      if (ids.has(id)) return `第 ${pageIndex + 1} 个图页存在重复 ID：${id}。`
      ids.add(id)
    }
    if (!ids.has('0') || !ids.has('1')) return `第 ${pageIndex + 1} 个图页缺少标准根节点 0 或 1。`
    for (const cell of cells) {
      const id = cell.getAttribute('id')!
      for (const attribute of ['parent', 'source', 'target'] as const) {
        const reference = cell.getAttribute(attribute)?.trim()
        if (reference && !ids.has(reference)) return `图形 ${id} 引用了不存在的 ${attribute}：${reference}。`
      }
      const isVertex = cell.getAttribute('vertex') === '1'
      const isEdge = cell.getAttribute('edge') === '1'
      if ((isVertex || isEdge) && !cell.querySelector(':scope > mxGeometry')) return `图形 ${id} 缺少 mxGeometry。`
      if (isEdge && (!cell.getAttribute('source') || !cell.getAttribute('target'))) return `连线 ${id} 缺少 source 或 target。`
    }
  }
  return null
}

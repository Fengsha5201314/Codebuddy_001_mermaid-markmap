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
    if (!model) {
      const compressed = diagram.textContent?.trim() ?? ''
      // draw.io compressed pages are long URI/base64 payloads. Accepting any
      // arbitrary text here previously made "not-a-graph" a valid diagram.
      if (compressed.length < 16 || !/^[A-Za-z0-9%+/=_]+$/.test(compressed)) {
        return `第 ${pageIndex + 1} 个图页不是可识别的 mxGraphModel 或 draw.io 压缩数据。`
      }
      continue
    }
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
      for (const attribute of ['parent', 'source', 'target'] as const) {
        const reference = (entry.holder.getAttribute(attribute) ?? entry.cell.getAttribute(attribute))?.trim()
        if (reference && !ids.has(reference)) return `图形 ${id} 引用了不存在的 ${attribute}：${reference}。`
      }
      const isVertex = (entry.holder.getAttribute('vertex') ?? entry.cell.getAttribute('vertex')) === '1'
      const isEdge = (entry.holder.getAttribute('edge') ?? entry.cell.getAttribute('edge')) === '1'
      const style = entry.holder.getAttribute('style') ?? entry.cell.getAttribute('style') ?? ''
      const isAutoSizedGroup = /(?:^|;)group(?:=|;)/i.test(style)
      const geometry = entry.cell.querySelector(':scope > mxGeometry')
      if ((isVertex || isEdge) && !geometry) return `图形 ${id} 缺少 mxGeometry。`
      if (isVertex && geometry) {
        for (const attribute of ['x', 'y', 'width', 'height'] as const) {
          const raw = geometry.getAttribute(attribute)
          if ((attribute === 'width' || attribute === 'height') && raw === null && !isAutoSizedGroup) return `图形 ${id} 缺少 ${attribute}。`
          if (raw !== null && (!Number.isFinite(Number(raw)) || ((attribute === 'width' || attribute === 'height') && Number(raw) <= 0))) {
            return `图形 ${id} 的 ${attribute} 不是有效几何数值。`
          }
        }
      }
      if (isEdge && (!attribute(entry, 'source') || !attribute(entry, 'target'))) return `连线 ${id} 缺少 source 或 target。`
    }
  }
  return null
}

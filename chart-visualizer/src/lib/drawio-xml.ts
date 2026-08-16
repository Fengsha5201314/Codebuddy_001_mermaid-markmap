export function validateDrawioXml(xml: string): string | null {
  const source = xml.trim()
  if (!source) return '画布 XML 为空。'
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) return '画布 XML 不能包含外部实体。'
  if (/<script|javascript:|\son(?:load|error)\s*=/i.test(source)) return '画布 XML 包含不安全的脚本内容。'

  const parsed = new DOMParser().parseFromString(source, 'application/xml')
  if (parsed.querySelector('parsererror')) return '画布 XML 格式不正确。'
  const root = parsed.documentElement
  if (root.tagName !== 'mxfile') return '画布 XML 缺少 mxfile 根节点。'
  const diagrams = root.querySelectorAll('diagram')
  if (!diagrams.length) return '画布 XML 中没有图页。'
  const hasGraph = [...diagrams].some((diagram) => diagram.querySelector('mxGraphModel') || diagram.textContent?.trim())
  if (!hasGraph) return '画布 XML 中没有可用的图形数据。'
  return null
}

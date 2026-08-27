function partialJsonString(source: string, field: string): string {
  const marker = source.indexOf(`"${field}"`)
  if (marker < 0) return ''
  const colon = source.indexOf(':', marker)
  const quote = colon < 0 ? -1 : source.indexOf('"', colon)
  if (quote < 0) return ''

  let value = ''
  let escaped = false
  for (let index = quote + 1; index < source.length; index += 1) {
    const character = source[index]
    if (escaped) {
      value += character === 'n' ? '\n' : character === 't' ? '\t' : character
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === '"') {
      break
    } else {
      value += character
    }
  }
  return value
}

function jsonValueStart(source: string, field: string): number {
  const marker = source.indexOf(`"${field}"`)
  if (marker < 0) return -1
  const colon = source.indexOf(':', marker)
  if (colon < 0) return -1
  let index = colon + 1
  while (/\s/.test(source[index] ?? '')) index += 1
  return index
}

export function visualAiStreamPreview(source: string): string {
  const summary = partialJsonString(source, 'summary')
  const codeStart = jsonValueStart(source, 'code')
  if (codeStart >= 0 && source[codeStart] === '{') {
    const plan = source.slice(codeStart)
    const nodeCount = (plan.match(/"type"\s*:\s*"(?:start|end|process|decision|document|data|system|manual|note)"/g) ?? []).length
    const edgeCount = (plan.match(/"source"\s*:/g) ?? []).length
    const operationCount = (plan.match(/"op"\s*:/g) ?? []).length
    const progress = operationCount
      ? `已整理 ${operationCount} 项局部修改`
      : `已整理 ${nodeCount} 个节点${edgeCount ? `、${edgeCount} 条连线` : ''}`
    return `${summary || '正在生成专业图表结构'}\n\n正在生成结构化画布计划 · ${progress}`
  }
  const code = partialJsonString(source, 'code')
  if (code) {
    if (code.trimStart().startsWith('<')) {
      return `${summary || '正在生成可视化画布'}\n\n正在生成 draw.io XML…\n${code.slice(-1800)}`
    }
    return `${summary || '正在生成图表结构'}\n\n正在生成 Mermaid 源码…\n${code.slice(-1200)}`
  }
  if (summary) return `${summary}\n\n模型仍在继续输出 · 已接收 ${source.length} 字符`
  return `已连接模型，正在流式接收内容 · ${source.length} 字符`
}

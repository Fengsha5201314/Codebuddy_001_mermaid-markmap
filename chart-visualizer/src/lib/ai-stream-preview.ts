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

export function visualAiStreamPreview(source: string): string {
  const summary = partialJsonString(source, 'summary')
  const code = partialJsonString(source, 'code')
  if (code) {
    if (code.trimStart().startsWith('<')) {
      return `${summary || '正在生成可视化画布'}\n\n正在生成画布结构 · 已接收 ${code.length} 字符`
    }
    return `${summary || '正在生成图表结构'}\n\n正在生成 Mermaid 源码…\n${code.slice(-1200)}`
  }
  if (summary) return `${summary}\n\n模型仍在继续输出 · 已接收 ${source.length} 字符`
  return `已连接模型，正在流式接收内容 · ${source.length} 字符`
}

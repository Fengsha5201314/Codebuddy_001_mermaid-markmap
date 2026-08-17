import type { AiAttachment } from '@/lib/ai-contract'

export const AI_ATTACHMENT_ACCEPT = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  '.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.yaml', '.yml',
  '.mmd', '.mermaid', '.js', '.jsx', '.ts', '.tsx', '.css', '.html',
  '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.sql',
  '.abap', '.sh', '.ps1', '.bat', '.log',
].join(',')

const MAX_FILES = 6
const MAX_TEXT_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_IMAGE_TOTAL_BYTES = 5 * 1024 * 1024
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const textExtensions = new Set([
  'txt', 'md', 'markdown', 'csv', 'json', 'xml', 'yaml', 'yml', 'mmd', 'mermaid',
  'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'py', 'java', 'c', 'cpp', 'h', 'hpp',
  'cs', 'go', 'rs', 'sql', 'abap', 'sh', 'ps1', 'bat', 'log',
])

function extension(name: string): string {
  return name.toLowerCase().split('.').pop() ?? ''
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`无法读取图片“${file.name}”。`))
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error(`无法读取图片“${file.name}”。`))
    reader.readAsDataURL(file)
  })
}

export async function readAiAttachments(files: FileList | File[]): Promise<AiAttachment[]> {
  const selected = Array.from(files)
  if (selected.length > MAX_FILES) throw new Error(`每次最多添加 ${MAX_FILES} 个附件。`)
  const result: AiAttachment[] = []
  let imageBytes = 0
  for (const file of selected) {
    if (imageTypes.has(file.type)) {
      if (file.size > MAX_IMAGE_BYTES) throw new Error(`图片“${file.name}”超过 5 MB，请压缩后再添加。`)
      imageBytes += file.size
      if (imageBytes > MAX_IMAGE_TOTAL_BYTES) throw new Error('图片附件合计超过 5 MB，请压缩或分批添加。')
      result.push({ kind: 'image', name: file.name, mimeType: file.type, content: await readDataUrl(file) })
      continue
    }
    if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
      throw new Error('当前版本专注图表整理，不接收音频或视频文件。')
    }
    if (!textExtensions.has(extension(file.name))) {
      throw new Error(`暂不支持“${file.name}”。当前可添加图片、文本、Markdown、表格数据和常见代码文件。`)
    }
    if (file.size > MAX_TEXT_BYTES) throw new Error(`文件“${file.name}”超过 2 MB，请拆分后再添加。`)
    result.push({ kind: 'text', name: file.name, mimeType: file.type || 'text/plain', content: await file.text() })
  }
  return result
}

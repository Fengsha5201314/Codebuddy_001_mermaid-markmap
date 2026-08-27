import type { AiAttachment } from '@/lib/ai-contract'
import type { AiConversationAttachment } from '@/store/ai-conversation-store'

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
const MAX_CONVERSATION_PREVIEW_CHARACTERS = 180_000
const CONVERSATION_PREVIEW_WIDTH = 260
const CONVERSATION_PREVIEW_HEIGHT = 180
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const textExtensions = new Set([
  'txt', 'md', 'markdown', 'csv', 'json', 'xml', 'yaml', 'yml', 'mmd', 'mermaid',
  'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'py', 'java', 'c', 'cpp', 'h', 'hpp',
  'cs', 'go', 'rs', 'sql', 'abap', 'sh', 'ps1', 'bat', 'log',
])

function extension(name: string): string {
  return name.toLowerCase().split('.').pop() ?? ''
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function clipboardImageName(type: string, capturedAt: Date, index: number): string {
  const suffix = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : type === 'image/gif' ? 'gif' : 'png'
  const timestamp = `${capturedAt.getFullYear()}${pad(capturedAt.getMonth() + 1)}${pad(capturedAt.getDate())}-${pad(capturedAt.getHours())}${pad(capturedAt.getMinutes())}${pad(capturedAt.getSeconds())}`
  return `剪贴板截图-${timestamp}${index ? `-${index + 1}` : ''}.${suffix}`
}

function dataUrlBytes(content: string): number {
  const comma = content.indexOf(',')
  if (comma < 0) return new TextEncoder().encode(content).byteLength
  const header = content.slice(0, comma)
  const body = content.slice(comma + 1)
  if (!/;base64/i.test(header)) return new TextEncoder().encode(decodeURIComponent(body)).byteLength
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor(body.length * 3 / 4) - padding)
}

export function imageFilesFromClipboard(clipboard: DataTransfer, capturedAt = new Date()): File[] {
  const itemFiles = Array.from(clipboard.items ?? [])
    .filter((item) => item.kind === 'file' && imageTypes.has(item.type))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
  const source = itemFiles.length
    ? itemFiles
    : Array.from(clipboard.files ?? []).filter((file) => imageTypes.has(file.type))
  return source.map((file, index) => {
    const genericName = !file.name || /^(?:image|screenshot|clipboard)(?:[-_ ]?\d+)?\.(?:png|jpe?g|webp|gif)$/i.test(file.name)
    if (!genericName) return file
    return new File([file], clipboardImageName(file.type, capturedAt, index), {
      type: file.type,
      lastModified: file.lastModified || capturedAt.getTime(),
    })
  })
}

export function mergeAiAttachments(existing: AiAttachment[], next: AiAttachment[]): AiAttachment[] {
  const merged = [...existing, ...next]
  if (merged.length > MAX_FILES) throw new Error(`每次最多添加 ${MAX_FILES} 个附件。`)
  const totalImageBytes = merged.reduce((total, attachment) => attachment.kind === 'image'
    ? total + dataUrlBytes(attachment.content)
    : total, 0)
  if (totalImageBytes > MAX_IMAGE_TOTAL_BYTES) throw new Error('图片附件合计超过 5 MB，请压缩或分批添加。')
  return merged
}

export async function appendAiAttachmentFiles(existing: AiAttachment[], files: FileList | File[]): Promise<AiAttachment[]> {
  return mergeAiAttachments(existing, await readAiAttachments(files))
}

async function createConversationImagePreview(content: string): Promise<string | undefined> {
  if (!/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(content)) return undefined
  if (content.length <= MAX_CONVERSATION_PREVIEW_CHARACTERS) return content
  if (typeof document === 'undefined' || typeof Image === 'undefined') return undefined
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('image preview failed'))
      image.src = content
    })
    const scale = Math.min(1, CONVERSATION_PREVIEW_WIDTH / image.naturalWidth, CONVERSATION_PREVIEW_HEIGHT / image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) return undefined
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const webp = canvas.toDataURL('image/webp', 0.72)
    if (webp.length <= MAX_CONVERSATION_PREVIEW_CHARACTERS) return webp
    const jpeg = canvas.toDataURL('image/jpeg', 0.6)
    return jpeg.length <= MAX_CONVERSATION_PREVIEW_CHARACTERS ? jpeg : undefined
  } catch {
    return undefined
  }
}

export async function buildConversationAttachments(attachments: AiAttachment[]): Promise<AiConversationAttachment[]> {
  return Promise.all(attachments.slice(0, 6).map(async (item) => ({
    kind: item.kind,
    name: item.name,
    mimeType: item.mimeType,
    ...(item.kind === 'image' ? { preview: await createConversationImagePreview(item.content) } : {}),
  })))
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

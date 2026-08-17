import type { DiagramDocument, DiagramProject } from '@/types'
import { validateDrawioXml } from '@/lib/drawio-xml'
import { createWorkspaceBackup, parseWorkspaceBackup } from '@/lib/workspace-data'

const MAX_IMPORT_BYTES = 10 * 1024 * 1024

export function downloadWorkspace(documents: DiagramDocument[], projects?: DiagramProject[]): void {
  const payload = createWorkspaceBackup(documents, projects)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `风沙工作区备份-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function parseImportFile(file: File): Promise<
  | { type: 'workspace'; documents: DiagramDocument[]; projects: DiagramProject[] }
  | { type: 'diagram'; title: string; code: string }
  | { type: 'visual'; title: string; drawioXml: string }
> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error('文件超过 10 MB，请拆分后再导入。')
  }
  const text = await file.text()
  if (!text.trim()) throw new Error('文件内容为空。')
  if (file.name.toLowerCase().endsWith('.json')) {
    const parsed = parseWorkspaceBackup(text)
    return { type: 'workspace', documents: parsed.documents, projects: parsed.projects }
  }
  if (file.name.toLowerCase().endsWith('.drawio')) {
    const drawioXml = text.trim()
    const validationError = validateDrawioXml(drawioXml)
    if (validationError) throw new Error(`无法导入 draw.io 文件：${validationError}`)
    return {
      type: 'visual',
      title: file.name.replace(/\.drawio$/i, '').trim() || '导入的可视化画布',
      drawioXml,
    }
  }

  const codeBlock = text.match(/```mermaid\s*([\s\S]*?)```/i)
  return {
    type: 'diagram',
    title: file.name.replace(/\.(mmd|mermaid|md|txt)$/i, ''),
    code: codeBlock?.[1]?.trim() || text.trim(),
  }
}

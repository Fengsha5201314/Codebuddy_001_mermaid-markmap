import type { DiagramEngine, DiagramKind } from '@/types'

export const AI_ACTIONS = ['auto', 'generate', 'edit', 'fix', 'explain'] as const
export const AI_PROVIDERS = ['cpa', 'deepseek', 'custom'] as const

export type AiAction = (typeof AI_ACTIONS)[number]
export type AiProviderId = (typeof AI_PROVIDERS)[number]

export interface AiModelSelection {
  provider: AiProviderId
  model: string
}

export interface AiAttachment {
  kind: 'text' | 'image'
  name: string
  mimeType: string
  content: string
}

export interface AiRequest {
  action: AiAction
  prompt: string
  code: string
  diagramKind: DiagramKind
  diagramEngine?: DiagramEngine
  provider: AiProviderId
  model: string
  renderError?: string
  phase?: 'discuss' | 'generate'
  conversation?: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  attachments?: AiAttachment[]
}

export interface AiResponse {
  requestId: string
  action: AiAction
  summary: string
  code: string
  changes: string[]
  provider: AiProviderId
  model: string
}

export interface AiStatus {
  providers: Array<{
    id: AiProviderId
    label: string
    configured: boolean
    baseUrl: string
    builtIn: boolean
  }>
}

export interface AiProviderSettingsInput {
  provider: AiProviderId
  baseUrl: string
  label?: string
  apiKey?: string
  clearApiKey?: boolean
}

export interface AiLineStats {
  added: number
  removed: number
  unchanged: number
}

export function isAiAction(value: unknown): value is AiAction {
  return typeof value === 'string' && AI_ACTIONS.includes(value as AiAction)
}

export function isAiProvider(value: unknown): value is AiProviderId {
  return typeof value === 'string' && AI_PROVIDERS.includes(value as AiProviderId)
}

export function aiModelKey(selection: AiModelSelection): string {
  return `${selection.provider}:${selection.model}`
}

export function parseAiModelKey(value: string): AiModelSelection | null {
  const separator = value.indexOf(':')
  if (separator <= 0) return null
  const provider = value.slice(0, separator)
  const model = value.slice(separator + 1)
  return isAiProvider(provider) && model ? { provider, model } : null
}

export function parseAiResponse(value: unknown): AiResponse {
  if (!value || typeof value !== 'object') throw new Error('AI 返回内容为空。')
  const candidate = value as Partial<AiResponse>
  if (!isAiAction(candidate.action)) throw new Error('AI 返回了未知操作。')
  if (typeof candidate.requestId !== 'string' || !candidate.requestId) throw new Error('AI 请求编号缺失。')
  if (typeof candidate.summary !== 'string' || !candidate.summary.trim()) throw new Error('AI 没有返回结果说明。')
  if (typeof candidate.code !== 'string') throw new Error('AI 没有返回图表内容。')
  if (!Array.isArray(candidate.changes) || !candidate.changes.every((item) => typeof item === 'string')) {
    throw new Error('AI 返回的变更清单格式不正确。')
  }
  if (!isAiProvider(candidate.provider)) throw new Error('AI 服务来源不正确。')
  if (typeof candidate.model !== 'string' || !candidate.model) throw new Error('AI 模型信息缺失。')
  return candidate as AiResponse
}

export function getAiLineStats(before: string, after: string): AiLineStats {
  const beforeLines = before.replace(/\r\n/g, '\n').split('\n')
  const afterLines = after.replace(/\r\n/g, '\n').split('\n')
  let prefix = 0
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < beforeLines.length - prefix
    && suffix < afterLines.length - prefix
    && beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  return {
    added: Math.max(0, afterLines.length - prefix - suffix),
    removed: Math.max(0, beforeLines.length - prefix - suffix),
    unchanged: prefix + suffix,
  }
}

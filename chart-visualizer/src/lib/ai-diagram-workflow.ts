import type { AiRequest, AiResponse } from '@/lib/ai-contract'

export const DEFAULT_AI_DIAGRAM_ACTION: AiRequest['action'] = 'auto'

export type AiWorkflowStage = 'generating' | 'validating' | 'repairing' | 'ready' | 'failed'

type AiRequestRunner = (
  payload: AiRequest,
  onDelta?: (text: string) => void,
  signal?: AbortSignal,
) => Promise<AiResponse>

interface MermaidAiWorkflowOptions {
  payload: AiRequest
  request: AiRequestRunner
  validate: (code: string) => Promise<unknown>
  onDelta?: (text: string) => void
  onStage?: (stage: AiWorkflowStage) => void
  signal?: AbortSignal
}

export interface MermaidAiWorkflowResult {
  response: AiResponse
  validationError: string | null
  repairAttempts: number
}

function validationMessage(error: unknown): string {
  const candidate = error && typeof error === 'object'
    ? error as { message?: unknown; raw?: unknown }
    : null
  const raw = typeof candidate?.raw === 'string'
    ? candidate.raw
    : typeof candidate?.message === 'string'
      ? candidate.message
      : error instanceof Error
        ? error.message
        : 'Mermaid 语法或结构不正确。'
  return raw.replace(/\s+/g, ' ').trim().slice(0, 800) || 'Mermaid 语法或结构不正确。'
}

function localizedValidationMessage(message: string): string {
  const line = message.match(/(?:line|第)\s*(\d+)\s*(?:行)?/i)?.[1]
  if (!line) return message
  const detail = message.replace(/(?:on\s+)?line\s*\d+/i, '').replace(/第\s*\d+\s*行/, '').trim()
  return `第 ${line} 行附近存在语法问题${detail ? `：${detail}` : '。'}`
}

function mergeRepairResponse(originalAction: AiResponse['action'], first: AiResponse, repaired: AiResponse): AiResponse {
  return {
    ...repaired,
    action: originalAction,
    summary: `已按要求处理，并自动修复了生成结果中的 Mermaid 问题。${repaired.summary}`,
    changes: [...new Set([...first.changes, ...repaired.changes])].slice(0, 6),
  }
}

export async function runAiDiagramWorkflow({
  payload,
  request,
  validate,
  onDelta,
  onStage,
  signal,
}: MermaidAiWorkflowOptions): Promise<MermaidAiWorkflowResult> {
  const formatName = payload.diagramEngine === 'drawio' ? 'draw.io XML' : 'Mermaid'
  onStage?.('generating')
  const first = await request(payload, onDelta, signal)
  if (first.action === 'explain') {
    onStage?.('ready')
    return { response: first, validationError: null, repairAttempts: 0 }
  }

  onStage?.('validating')
  try {
    await validate(first.code)
    onStage?.('ready')
    return { response: first, validationError: null, repairAttempts: 0 }
  } catch (error) {
    const firstError = validationMessage(error)
    onStage?.('repairing')
    let repaired: AiResponse
    try {
      repaired = await request({
        ...payload,
        action: 'fix',
        prompt: `自动修复刚才生成的候选图，只修复 ${formatName} 语法和结构，不改变原始需求：${payload.prompt || '保持当前业务语义'}`,
        code: first.code,
        renderError: firstError,
      }, onDelta, signal)
    } catch (repairRequestError) {
      onStage?.('failed')
      return {
        response: first,
        validationError: `候选图无法渲染，自动修复请求也未完成：${validationMessage(repairRequestError)}`,
        repairAttempts: 1,
      }
    }

    onStage?.('validating')
    try {
      await validate(repaired.code)
      onStage?.('ready')
      return {
        response: mergeRepairResponse(first.action, first, repaired),
        validationError: null,
        repairAttempts: 1,
      }
    } catch (repairError) {
      onStage?.('failed')
      return {
        response: mergeRepairResponse(first.action, first, repaired),
        validationError: `自动修复后仍无法通过结构检查：${localizedValidationMessage(validationMessage(repairError))}`,
        repairAttempts: 1,
      }
    }
  }
}

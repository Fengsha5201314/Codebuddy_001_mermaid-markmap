import {
  parseAiResponse,
  type AiProviderId,
  type AiProviderSettingsInput,
  type AiRequest,
  type AiResponse,
  type AiStatus,
} from '@/lib/ai-contract'

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
  }
}

export class AiApiError extends Error {
  code: string
  status: number

  constructor(message: string, code = 'AI_REQUEST_FAILED', status = 500) {
    super(message)
    this.name = 'AiApiError'
    this.code = code
    this.status = status
  }
}

async function readError(response: Response): Promise<AiApiError> {
  let body: ApiErrorBody | null = null
  try {
    body = await response.json() as ApiErrorBody
  } catch {
    // Keep the stable fallback below when an upstream gateway returns HTML or plain text.
  }
  return new AiApiError(
    body?.error?.message || 'AI 服务暂时不可用，请稍后重试。',
    body?.error?.code || 'AI_REQUEST_FAILED',
    response.status,
  )
}

function networkError(): AiApiError {
  const desktop = typeof window !== 'undefined' && Boolean(window.fengshaDesktop)
  return new AiApiError(
    desktop
      ? '无法连接本地 AI 服务。请完全退出并重新打开风沙图表工作台，然后点击“刷新状态”。'
      : '无法连接本地 AI 服务。网页版需要通过项目服务启动，不能直接打开静态网页；请确认配套后端正在运行后重试。',
    'AI_SERVICE_UNREACHABLE',
    0,
  )
}

async function fetchAi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw networkError()
  }
}

export async function getAiStatus(signal?: AbortSignal): Promise<AiStatus> {
  const response = await fetchAi('/api/ai', { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw await readError(response)
  return response.json() as Promise<AiStatus>
}

export async function getAiModels(provider: AiProviderId, signal?: AbortSignal): Promise<string[]> {
  const response = await fetchAi(`/api/ai/models?provider=${encodeURIComponent(provider)}`, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw await readError(response)
  const body = await response.json() as { models?: unknown }
  if (!Array.isArray(body.models) || !body.models.every((model) => typeof model === 'string')) {
    throw new AiApiError('模型列表格式不正确。', 'AI_INVALID_OUTPUT', 502)
  }
  return body.models
}

export async function updateAiProviderSettings(
  settings: AiProviderSettingsInput,
  signal?: AbortSignal,
): Promise<AiStatus> {
  const response = await fetchAi('/api/ai/settings', {
    method: 'PUT',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!response.ok) throw await readError(response)
  return response.json() as Promise<AiStatus>
}

export async function requestAiChange(payload: AiRequest, signal?: AbortSignal): Promise<AiResponse> {
  const response = await fetchAi('/api/ai', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw await readError(response)
  return parseAiResponse(await response.json())
}

type AiStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'result'; result: unknown }
  | { type: 'error'; error?: { code?: string; message?: string } }

export async function requestAiChangeStream(
  payload: AiRequest,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<AiResponse> {
  const response = await fetchAi('/api/ai/stream', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw await readError(response)
  if (!response.body) throw new AiApiError('浏览器无法读取 AI 流式响应。', 'AI_STREAM_UNAVAILABLE', 502)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let result: AiResponse | null = null

  const consumeLine = (line: string) => {
    if (!line.trim()) return
    let event: AiStreamEvent
    try {
      event = JSON.parse(line) as AiStreamEvent
    } catch {
      throw new AiApiError('AI 流式响应格式不正确。', 'AI_INVALID_OUTPUT', 502)
    }
    if (event.type === 'delta') {
      if (typeof event.text !== 'string') throw new AiApiError('AI 流式内容格式不正确。', 'AI_INVALID_OUTPUT', 502)
      onDelta(event.text)
      return
    }
    if (event.type === 'result') {
      result = parseAiResponse(event.result)
      return
    }
    if (event.type === 'error') {
      throw new AiApiError(
        event.error?.message || 'AI 服务暂时不可用，请稍后重试。',
        event.error?.code || 'AI_REQUEST_FAILED',
        502,
      )
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    pending += decoder.decode(value, { stream: true })
    let newline = pending.indexOf('\n')
    while (newline >= 0) {
      consumeLine(pending.slice(0, newline))
      pending = pending.slice(newline + 1)
      newline = pending.indexOf('\n')
    }
  }
  pending += decoder.decode()
  if (pending.trim()) consumeLine(pending)
  if (!result) throw new AiApiError('AI 流式响应提前结束，请重试。', 'AI_STREAM_INCOMPLETE', 502)
  return result
}

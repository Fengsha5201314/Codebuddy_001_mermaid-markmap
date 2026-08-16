import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAiStatus, requestAiChangeStream } from '@/lib/ai-client'

const payload = {
  action: 'edit',
  prompt: '增加复核',
  code: 'flowchart LR\nA --> B',
  diagramKind: 'flowchart',
  provider: 'cpa',
  model: 'gpt-test',
} as const

afterEach(() => {
  vi.unstubAllGlobals()
  delete window.fengshaDesktop
})

describe('AI connection diagnostics', () => {
  it('explains how to restore the local backend when the web request cannot connect', async () => {
    delete window.fengshaDesktop
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    await expect(getAiStatus()).rejects.toMatchObject({
      code: 'AI_SERVICE_UNREACHABLE',
      status: 0,
      message: expect.stringContaining('网页版需要通过项目服务启动'),
    })
  })

  it('gives desktop restart guidance without exposing the browser error', async () => {
    window.fengshaDesktop = {} as typeof window.fengshaDesktop
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    await expect(getAiStatus()).rejects.toMatchObject({
      code: 'AI_SERVICE_UNREACHABLE',
      message: expect.stringContaining('重新打开风沙图表工作台'),
    })
  })
})

describe('AI streaming client', () => {
  it('emits partial text before returning the validated final result', async () => {
    const result = {
      requestId: 'req-stream',
      action: 'edit',
      summary: '完成',
      code: 'flowchart LR\nA --> Review --> B',
      changes: ['新增复核'],
      provider: 'cpa',
      model: 'gpt-test',
    }
    const ndjson = [
      JSON.stringify({ type: 'delta', text: '{"summary":"完' }),
      JSON.stringify({ type: 'delta', text: '成"}' }),
      JSON.stringify({ type: 'result', result }),
      '',
    ].join('\n')
    const encoded = new TextEncoder().encode(ndjson)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoded.slice(0, 31))
        controller.enqueue(encoded.slice(31))
        controller.close()
      },
    }), { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })))
    const deltas: string[] = []

    await expect(requestAiChangeStream(payload, (text) => deltas.push(text))).resolves.toEqual(result)
    expect(deltas).toEqual(['{"summary":"完', '成"}'])
  })

  it('surfaces an error event from an already-open stream', async () => {
    const body = `${JSON.stringify({ type: 'error', error: { code: 'AI_UPSTREAM_ERROR', message: '模型忙碌' } })}\n`
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    })))

    await expect(requestAiChangeStream(payload, () => undefined)).rejects.toMatchObject({
      code: 'AI_UPSTREAM_ERROR',
      message: '模型忙碌',
    })
  })
})

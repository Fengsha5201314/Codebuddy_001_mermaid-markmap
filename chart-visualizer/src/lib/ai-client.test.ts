import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestAiChangeStream } from '@/lib/ai-client'

const payload = {
  action: 'edit',
  prompt: '增加复核',
  code: 'flowchart LR\nA --> B',
  diagramKind: 'flowchart',
  provider: 'cpa',
  model: 'gpt-test',
} as const

afterEach(() => vi.unstubAllGlobals())

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

import { describe, expect, it, vi } from 'vitest'
import type { AiRequest, AiResponse } from '@/lib/ai-contract'
import { DEFAULT_AI_DIAGRAM_ACTION, runAiDiagramWorkflow } from '@/lib/ai-diagram-workflow'

const baseRequest: AiRequest = {
  action: 'auto',
  prompt: '在付款前增加财务复核',
  code: 'flowchart LR\n  submit --> pay',
  diagramKind: 'flowchart',
  provider: 'cpa',
  model: 'gpt-test',
}

function response(code: string, action: AiResponse['action'] = 'edit'): AiResponse {
  return {
    requestId: `request-${action}`,
    action,
    summary: '已按要求修改。',
    code,
    changes: ['增加财务复核'],
    provider: 'cpa',
    model: 'gpt-test',
  }
}

describe('Mermaid AI edit workflow', () => {
  it('defaults to unified intent detection instead of a hidden action mode', () => {
    expect(DEFAULT_AI_DIAGRAM_ACTION).toBe('auto')
  })

  it('sends the current source for editing and automatically repairs invalid output once', async () => {
    const invalidCode = 'flowchart LR\n  submit -->'
    const repairedCode = 'flowchart LR\n  submit --> review[财务复核] --> pay'
    const request = vi.fn()
      .mockResolvedValueOnce(response(invalidCode))
      .mockResolvedValueOnce(response(repairedCode, 'fix'))
    const validate = vi.fn(async (code: string) => {
      if (code === invalidCode) throw new Error('Parse error on line 2')
    })
    const stages: string[] = []

    const result = await runAiDiagramWorkflow({
      payload: baseRequest,
      request,
      validate,
      onStage: (stage) => stages.push(stage),
    })

    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[0][0]).toMatchObject({
      action: 'auto',
      code: baseRequest.code,
      prompt: baseRequest.prompt,
    })
    expect(request.mock.calls[1][0]).toMatchObject({
      action: 'fix',
      code: invalidCode,
      renderError: 'Parse error on line 2',
    })
    expect(result.response).toMatchObject({ action: 'edit', code: repairedCode })
    expect(result.validationError).toBeNull()
    expect(result.repairAttempts).toBe(1)
    expect(stages).toEqual(['generating', 'validating', 'repairing', 'validating', 'ready'])
  })

  it('uses the action resolved by AI and does not validate an explanation response', async () => {
    const request = vi.fn().mockResolvedValue(response(baseRequest.code, 'explain'))
    const validate = vi.fn()

    const result = await runAiDiagramWorkflow({ payload: baseRequest, request, validate })

    expect(validate).not.toHaveBeenCalled()
    expect(result.response.action).toBe('explain')
    expect(result.validationError).toBeNull()
  })

  it('returns an actionable validation error when the automatic repair still cannot render', async () => {
    const invalidCode = 'flowchart LR\n  submit -->'
    const request = vi.fn()
      .mockResolvedValueOnce(response(invalidCode))
      .mockResolvedValueOnce(response(invalidCode, 'fix'))
    const validate = vi.fn(async () => {
      throw new Error('Parse error on line 2')
    })

    const result = await runAiDiagramWorkflow({ payload: baseRequest, request, validate })

    expect(result.validationError).toContain('自动修复后仍无法通过结构检查')
    expect(result.validationError).toContain('第 2 行')
    expect(result.repairAttempts).toBe(1)
  })

  it('keeps the generated candidate visible when the automatic repair request fails', async () => {
    const invalidCode = 'flowchart LR\n  submit -->'
    const request = vi.fn()
      .mockResolvedValueOnce(response(invalidCode))
      .mockRejectedValueOnce(new Error('AI 服务超时'))
    const validate = vi.fn(async () => {
      throw { message: 'Parse error', raw: 'Parse error on line 2' }
    })

    const result = await runAiDiagramWorkflow({ payload: baseRequest, request, validate })

    expect(result.response.code).toBe(invalidCode)
    expect(result.validationError).toContain('自动修复请求也未完成')
    expect(result.validationError).toContain('AI 服务超时')
  })

  it('uses the same automatic repair loop for draw.io XML edits', async () => {
    const sourceXml = '<mxfile><diagram><mxGraphModel /></diagram></mxfile>'
    const invalidXml = '<mxfile><diagram>'
    const repairedXml = '<mxfile><diagram><mxGraphModel /></diagram></mxfile>'
    const request = vi.fn()
      .mockResolvedValueOnce(response(invalidXml))
      .mockResolvedValueOnce(response(repairedXml, 'fix'))
    const validate = vi.fn(async (code: string) => {
      if (code === invalidXml) throw new Error('画布 XML 格式不正确。')
    })

    const result = await runAiDiagramWorkflow({
      payload: { ...baseRequest, diagramEngine: 'drawio', code: sourceXml },
      request,
      validate,
    })

    expect(request.mock.calls[1][0]).toMatchObject({
      action: 'fix',
      code: invalidXml,
      renderError: '画布 XML 格式不正确。',
    })
    expect(request.mock.calls[1][0].prompt).toContain('draw.io 结构化计划')
    expect(result.response.code).toBe(repairedXml)
    expect(result.validationError).toBeNull()
  })

  it('prepares a compact draw.io plan into deterministic XML before validation', async () => {
    const plan = '{"version":1,"mode":"replace"}'
    const compiled = '<mxfile><diagram><mxGraphModel /></diagram></mxfile>'
    const request = vi.fn().mockResolvedValue(response(plan, 'generate'))
    const prepare = vi.fn().mockReturnValue(compiled)
    const validate = vi.fn()

    const result = await runAiDiagramWorkflow({
      payload: { ...baseRequest, diagramEngine: 'drawio', code: '' },
      request,
      prepare,
      validate,
    })

    expect(prepare).toHaveBeenCalledWith(plan, expect.objectContaining({ action: 'generate' }))
    expect(validate).toHaveBeenCalledWith(compiled)
    expect(result.response.code).toBe(compiled)
    expect(result.repairAttempts).toBe(0)
  })

  it('repairs the original plan when local compilation reports an exact structural error', async () => {
    const invalidPlan = '{"version":1,"mode":"replace","nodes":[]}'
    const repairedPlan = '{"version":1,"mode":"replace","nodes":[{"id":"start"}]}'
    const compiled = '<mxfile><diagram><mxGraphModel /></diagram></mxfile>'
    const request = vi.fn()
      .mockResolvedValueOnce(response(invalidPlan, 'generate'))
      .mockResolvedValueOnce(response(repairedPlan, 'fix'))
    const prepare = vi.fn((code: string) => {
      if (code === invalidPlan) throw new Error('AI 图形计划至少需要一个节点。')
      return compiled
    })

    const result = await runAiDiagramWorkflow({
      payload: { ...baseRequest, diagramEngine: 'drawio', code: '' },
      request,
      prepare,
      validate: vi.fn(),
    })

    expect(request.mock.calls[1][0]).toMatchObject({
      action: 'fix',
      code: invalidPlan,
      renderError: 'AI 图形计划至少需要一个节点。',
    })
    expect(request.mock.calls[1][0].prompt).toContain('错误详情：AI 图形计划至少需要一个节点。')
    expect(result.response.code).toBe(compiled)
    expect(result.response.summary).toContain('draw.io 结构化计划问题')
    expect(result.validationError).toBeNull()
  })
})

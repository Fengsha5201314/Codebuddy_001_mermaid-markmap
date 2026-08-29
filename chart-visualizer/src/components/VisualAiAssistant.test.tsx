import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAiConversationStore } from '@/store/ai-conversation-store'
import { aiTaskKey, resetAiTaskStoreForTests, useAiTaskStore } from '@/store/ai-task-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { DiagramDocument } from '@/types'
import { VisualAiAssistant } from './VisualAiAssistant'

const aiMocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  requestStream: vi.fn(),
}))

vi.mock('@/lib/ai-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai-client')>()
  return {
    ...actual,
    getAiStatus: aiMocks.getStatus,
    requestAiChangeStream: aiMocks.requestStream,
  }
})

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useAiConversationStore.setState(useAiConversationStore.getInitialState(), true)
  resetAiTaskStoreForTests()
  aiMocks.getStatus.mockResolvedValue({
    providers: [{ id: 'cpa', label: 'CPA AI', configured: true, baseUrl: 'https://cpa.example/v1', builtIn: true }],
  })
  aiMocks.requestStream.mockImplementation(async (_payload, onDelta) => {
    onDelta('{"summary":"正在整理"')
    return await new Promise(() => undefined)
  })
  const visualId = useWorkspaceStore.getState().convertActiveToVisual()
  useWorkspaceStore.getState().updatePreferences({
    aiEnabledModels: [{ provider: 'cpa', model: 'gpt-test', vision: false }],
    aiSelectedModel: 'cpa:gpt-test',
  })
  expect(visualId).toBeTruthy()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  resetAiTaskStoreForTests()
  host.remove()
  vi.clearAllMocks()
})

describe('Visual AI composer', () => {
  it('keeps an in-flight request alive when the AI panel is closed', async () => {
    const state = useWorkspaceStore.getState()
    const document = state.documents.find((item) => item.id === state.activeDocumentId) as DiagramDocument
    let requestSignal: AbortSignal | undefined
    let resolveRequest: ((response: {
      requestId: string
      action: 'explain'
      summary: string
      code: string
      changes: string[]
      provider: 'cpa'
      model: string
    }) => void) | undefined
    aiMocks.requestStream.mockImplementation(async (_payload, _onDelta, signal) => {
      requestSignal = signal
      return await new Promise((resolve) => { resolveRequest = resolve })
    })

    await act(async () => {
      root.render(<VisualAiAssistant document={document} onApplyXml={() => undefined} onApplyMermaid={() => undefined} onOpenSettings={() => undefined} />)
      await Promise.resolve()
    })
    const textarea = host.querySelector<HTMLTextAreaElement>('#visual-ai-prompt')!
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    await act(async () => {
      valueSetter?.call(textarea, '继续优化当前流程图')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      host.querySelector<HTMLButtonElement>('.ai-send-button')!.click()
      await Promise.resolve()
    })

    expect(requestSignal).toBeDefined()
    await act(async () => root.unmount())
    root = createRoot(host)

    expect(requestSignal?.aborted).toBe(false)
    await act(async () => {
      resolveRequest?.({
        requestId: 'background-1',
        action: 'explain',
        summary: '后台任务已完成，切回后可以继续查看。',
        code: document.drawioXml ?? '',
        changes: [],
        provider: 'cpa',
        model: 'gpt-test',
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const completedThread = useAiConversationStore.getState().threads
      .find((thread) => thread.projectId === document.projectId)
    expect(completedThread?.messages.some((message) => message.content === '后台任务已完成，切回后可以继续查看。')).toBe(true)

    await act(async () => {
      root.render(<VisualAiAssistant document={document} onApplyXml={() => undefined} onApplyMermaid={() => undefined} onOpenSettings={() => undefined} />)
      await Promise.resolve()
    })
    expect(host.textContent).toContain('后台任务已完成，切回后可以继续查看。')
    expect(host.textContent).not.toContain('正在读取画布结构')
  })

  it('clears submitted text immediately while the streamed request is still running', async () => {
    const state = useWorkspaceStore.getState()
    const document = state.documents.find((item) => item.id === state.activeDocumentId) as DiagramDocument
    await act(async () => {
      root.render(<VisualAiAssistant document={document} onApplyXml={() => undefined} onApplyMermaid={() => undefined} onOpenSettings={() => undefined} />)
      await Promise.resolve()
    })

    const textarea = host.querySelector<HTMLTextAreaElement>('#visual-ai-prompt')!
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    await act(async () => {
      valueSetter?.call(textarea, '把 AI 学习步骤整理成思维导图')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(textarea.value).toBe('把 AI 学习步骤整理成思维导图')

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.ai-send-button')!.click()
      await Promise.resolve()
    })

    expect(aiMocks.requestStream).toHaveBeenCalledOnce()
    expect(textarea.value).toBe('')
  })

  it('keeps background tasks isolated when the user switches to another diagram', async () => {
    const initialState = useWorkspaceStore.getState()
    const firstDocument = initialState.documents.find((item) => item.id === initialState.activeDocumentId) as DiagramDocument
    let requestSignal: AbortSignal | undefined
    aiMocks.requestStream.mockImplementation(async (_payload, _onDelta, signal) => {
      requestSignal = signal
      return await new Promise(() => undefined)
    })

    await act(async () => {
      root.render(<VisualAiAssistant document={firstDocument} onApplyXml={() => undefined} onApplyMermaid={() => undefined} onOpenSettings={() => undefined} />)
      await Promise.resolve()
    })
    const textarea = host.querySelector<HTMLTextAreaElement>('#visual-ai-prompt')!
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    await act(async () => {
      valueSetter?.call(textarea, '后台处理第一个图')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      host.querySelector<HTMLButtonElement>('.ai-send-button')!.click()
      await Promise.resolve()
    })

    const secondId = useWorkspaceStore.getState().createVisualDocument('第二个图')
    const secondDocument = useWorkspaceStore.getState().documents.find((item) => item.id === secondId) as DiagramDocument
    await act(async () => {
      root.render(<VisualAiAssistant document={secondDocument} onApplyXml={() => undefined} onApplyMermaid={() => undefined} onOpenSettings={() => undefined} />)
      await Promise.resolve()
    })

    expect(requestSignal?.aborted).toBe(false)
    const tasks = Object.entries(useAiTaskStore.getState().tasks)
    expect(tasks.some(([key, task]) => key.startsWith(aiTaskKey('drawio', firstDocument.id)) && task.running)).toBe(true)
    expect(tasks.some(([key, task]) => key.startsWith(aiTaskKey('drawio', secondDocument.id)) && task.running)).toBe(false)
    expect(host.textContent).not.toContain('正在读取画布结构')
  })

  it('still stops a background task when the user explicitly clicks stop', async () => {
    const state = useWorkspaceStore.getState()
    const document = state.documents.find((item) => item.id === state.activeDocumentId) as DiagramDocument
    let requestSignal: AbortSignal | undefined
    aiMocks.requestStream.mockImplementation(async (_payload, _onDelta, signal) => {
      requestSignal = signal
      return await new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true })
      })
    })

    await act(async () => {
      root.render(<VisualAiAssistant document={document} onApplyXml={() => undefined} onApplyMermaid={() => undefined} onOpenSettings={() => undefined} />)
      await Promise.resolve()
    })
    const textarea = host.querySelector<HTMLTextAreaElement>('#visual-ai-prompt')!
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    await act(async () => {
      valueSetter?.call(textarea, '测试主动停止')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      host.querySelector<HTMLButtonElement>('.ai-send-button')!.click()
      await Promise.resolve()
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.ai-stop-button')!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(requestSignal?.aborted).toBe(true)
    expect(host.textContent).toContain('已停止本次 AI 请求。')
    expect(host.querySelector('.ai-stop-button')).toBeNull()
  })

  it('compiles a structured AI plan locally before allowing it onto the canvas', async () => {
    const state = useWorkspaceStore.getState()
    const document = state.documents.find((item) => item.id === state.activeDocumentId) as DiagramDocument
    const onApplyXml = vi.fn()
    aiMocks.requestStream
      .mockResolvedValueOnce({
        requestId: 'discuss-1',
        action: 'explain',
        summary: '方案已具备生成条件。',
        code: document.drawioXml ?? '',
        changes: [],
        provider: 'cpa',
        model: 'gpt-test',
      })
      .mockResolvedValueOnce({
        requestId: 'generate-1',
        action: 'generate',
        summary: '已生成采购审批流程。',
        code: JSON.stringify({
          version: 1,
          mode: 'replace',
          title: '采购审批',
          nodes: [
            { id: 'start', type: 'start', label: '开始', column: 0 },
            { id: 'approve', type: 'decision', label: '审批通过？', column: 1 },
            { id: 'end', type: 'end', label: '完成', column: 2 },
          ],
          edges: [
            { source: 'start', target: 'approve' },
            { source: 'approve', target: 'end', label: '通过' },
          ],
        }),
        changes: ['创建审批主流程'],
        provider: 'cpa',
        model: 'gpt-test',
      })

    await act(async () => {
      root.render(<VisualAiAssistant document={document} onApplyXml={onApplyXml} onApplyMermaid={() => undefined} onOpenSettings={() => undefined} />)
      await Promise.resolve()
    })
    const textarea = host.querySelector<HTMLTextAreaElement>('#visual-ai-prompt')!
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    await act(async () => {
      valueSetter?.call(textarea, '生成采购审批流程')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      host.querySelector<HTMLButtonElement>('.ai-send-button')!.click()
      await Promise.resolve()
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.ai-action-buttons .primary')!.click()
      await Promise.resolve()
    })

    expect(host.textContent).toContain('候选已通过专业检查')
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.ai-action-buttons .primary')!.click()
    })
    expect(onApplyXml).toHaveBeenCalledOnce()
    const xml = onApplyXml.mock.calls[0][0] as string
    expect(xml).toContain('<mxfile')
    expect(xml).toContain('value="审批通过？"')
    expect(xml).not.toContain('"mode":"replace"')
  })

  it('adds a clipboard screenshot as an image attachment when pasted into the prompt', async () => {
    const state = useWorkspaceStore.getState()
    useWorkspaceStore.getState().updatePreferences({
      aiEnabledModels: [{ provider: 'cpa', model: 'gpt-test', vision: true }],
      aiSelectedModel: 'cpa:gpt-test',
    })
    const document = state.documents.find((item) => item.id === state.activeDocumentId) as DiagramDocument
    await act(async () => {
      root.render(<VisualAiAssistant document={document} onApplyXml={() => undefined} onApplyMermaid={() => undefined} onOpenSettings={() => undefined} />)
      await Promise.resolve()
    })

    const screenshot = new File(['clipboard-image'], 'image.png', { type: 'image/png' })
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => screenshot }],
        files: [] as unknown as FileList,
      },
    })
    act(() => { host.querySelector<HTMLTextAreaElement>('#visual-ai-prompt')!.dispatchEvent(paste) })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })

    expect(paste.defaultPrevented).toBe(true)
    expect(host.querySelector('.ai-attachment-list img')).not.toBeNull()
    expect(host.textContent).toContain('剪贴板截图-')

    const textarea = host.querySelector<HTMLTextAreaElement>('#visual-ai-prompt')!
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    await act(async () => {
      valueSetter?.call(textarea, '根据这张截图整理流程')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.ai-send-button')!.click()
      await Promise.resolve()
    })
    expect(aiMocks.requestStream).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [expect.objectContaining({ kind: 'image', mimeType: 'image/png', content: expect.stringMatching(/^data:image\/png;base64,/) })],
      }),
      expect.any(Function),
      expect.any(AbortSignal),
    )
    const sentMessage = useAiConversationStore.getState().threads
      .find((thread) => thread.projectId === document.projectId)?.messages
      .find((message) => message.role === 'user')
    expect(sentMessage?.attachments).toEqual([
      expect.objectContaining({ kind: 'image', name: expect.stringContaining('剪贴板截图-'), preview: expect.stringMatching(/^data:image\/png;base64,/) }),
    ])
    expect(host.querySelector('.ai-message-attachments img')).not.toBeNull()
  })

  it('does not falsely block image input for a multimodal CPA GPT 5.6 model saved by an older version', async () => {
    const state = useWorkspaceStore.getState()
    useWorkspaceStore.getState().updatePreferences({
      aiEnabledModels: [{ provider: 'cpa', model: 'gpt-5.6-terra', vision: false }],
      aiSelectedModel: 'cpa:gpt-5.6-terra',
    })
    const document = state.documents.find((item) => item.id === state.activeDocumentId) as DiagramDocument
    await act(async () => {
      root.render(<VisualAiAssistant document={document} onApplyXml={() => undefined} onApplyMermaid={() => undefined} onOpenSettings={() => undefined} />)
      await Promise.resolve()
    })

    const screenshot = new File(['clipboard-image'], 'image.png', { type: 'image/png' })
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => screenshot }],
        files: [] as unknown as FileList,
      },
    })
    act(() => { host.querySelector<HTMLTextAreaElement>('#visual-ai-prompt')!.dispatchEvent(paste) })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })

    const textarea = host.querySelector<HTMLTextAreaElement>('#visual-ai-prompt')!
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    await act(async () => {
      valueSetter?.call(textarea, '识别截图并优化流程')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(host.textContent).not.toContain('当前模型未启用图片识别')
    expect(host.querySelector<HTMLButtonElement>('.ai-send-button')!.disabled).toBe(false)
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.ai-send-button')!.click()
      await Promise.resolve()
    })
    expect(aiMocks.requestStream).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'cpa',
        model: 'gpt-5.6-terra',
        attachments: [expect.objectContaining({ kind: 'image', mimeType: 'image/png' })],
      }),
      expect.any(Function),
      expect.any(AbortSignal),
    )
  })

  it('does not intercept normal text paste when the clipboard has no image', async () => {
    const state = useWorkspaceStore.getState()
    const document = state.documents.find((item) => item.id === state.activeDocumentId) as DiagramDocument
    await act(async () => {
      root.render(<VisualAiAssistant document={document} onApplyXml={() => undefined} onApplyMermaid={() => undefined} onOpenSettings={() => undefined} />)
      await Promise.resolve()
    })
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
        files: [] as unknown as FileList,
      },
    })

    act(() => { host.querySelector<HTMLTextAreaElement>('#visual-ai-prompt')!.dispatchEvent(paste) })
    expect(paste.defaultPrevented).toBe(false)
    expect(host.querySelector('.ai-attachment-list')).toBeNull()
  })
})

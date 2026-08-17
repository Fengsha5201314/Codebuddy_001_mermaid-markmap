import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAiConversationStore } from '@/store/ai-conversation-store'
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
  host.remove()
  vi.clearAllMocks()
})

describe('Visual AI composer', () => {
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
})

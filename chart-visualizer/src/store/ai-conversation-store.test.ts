import { beforeEach, describe, expect, it } from 'vitest'
import { useAiConversationStore } from '@/store/ai-conversation-store'

describe('project AI conversations', () => {
  beforeEach(() => {
    localStorage.clear()
    useAiConversationStore.setState(useAiConversationStore.getInitialState(), true)
  })

  it('keeps multiple conversations under one project', () => {
    const first = useAiConversationStore.getState().ensureThread('project-1')
    useAiConversationStore.getState().appendMessage(first, 'user', '先梳理现有审批流程')
    const second = useAiConversationStore.getState().createThread('project-1')

    expect(second).not.toBe(first)
    expect(useAiConversationStore.getState().threads.filter((item) => item.projectId === 'project-1')).toHaveLength(2)
    expect(useAiConversationStore.getState().threads.find((item) => item.id === first)?.title).toContain('先梳理')
  })

  it('does not leak conversation context between projects', () => {
    const first = useAiConversationStore.getState().ensureThread('project-1')
    const second = useAiConversationStore.getState().ensureThread('project-2')
    useAiConversationStore.getState().appendMessage(first, 'assistant', '项目一结论')

    expect(useAiConversationStore.getState().threads.find((item) => item.id === second)?.messages).toEqual([])
  })

  it('keeps sent screenshot metadata and a bounded preview in the conversation record', () => {
    const threadId = useAiConversationStore.getState().ensureThread('project-1')
    const attachments = [{
      kind: 'image',
      name: '剪贴板截图-20260826.png',
      mimeType: 'image/png',
      preview: 'data:image/webp;base64,dGlueQ==',
    }]
    const appendMessage = useAiConversationStore.getState().appendMessage as unknown as (...args: unknown[]) => void
    appendMessage(threadId, 'user', '根据截图优化流程', attachments)

    expect(useAiConversationStore.getState().threads.find((item) => item.id === threadId)?.messages[0]).toMatchObject({
      content: '根据截图优化流程',
      attachments,
    })
  })

  it('deletes a conversation without leaving the project without an active chat', () => {
    const threadId = useAiConversationStore.getState().ensureThread('project-1')
    useAiConversationStore.getState().deleteThread('project-1', threadId)

    const state = useAiConversationStore.getState()
    expect(state.activeThreadByProject['project-1']).not.toBe(threadId)
    expect(state.threads.some((item) => item.id === state.activeThreadByProject['project-1'])).toBe(true)
  })
})

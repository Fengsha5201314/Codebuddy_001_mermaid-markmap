import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AiConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  attachments?: AiConversationAttachment[]
}

export interface AiConversationAttachment {
  kind: 'text' | 'image'
  name: string
  mimeType: string
  preview?: string
}

export interface AiConversationThread {
  id: string
  projectId: string
  title: string
  createdAt: string
  updatedAt: string
  messages: AiConversationMessage[]
}

export function buildAiConversationContext(messages: AiConversationMessage[], maximumCharacters = 32_000) {
  if (!messages.length) return []
  const firstUserIndex = messages.findIndex((message) => message.role === 'user')
  const anchor = firstUserIndex >= 0 ? messages[firstUserIndex] : undefined
  const selected: AiConversationMessage[] = []
  let usedCharacters = anchor?.content.length ?? 0

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.id === anchor?.id) continue
    if (selected.length >= 6 && usedCharacters + message.content.length > maximumCharacters) break
    selected.unshift(message)
    usedCharacters += message.content.length
  }

  const context = anchor && !selected.some((message) => message.id === anchor.id)
    ? [anchor, ...selected]
    : selected
  return context.map(({ role, content }) => ({ role, content }))
}

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

interface AiConversationState {
  threads: AiConversationThread[]
  activeThreadByProject: Record<string, string>
  ensureThread: (projectId: string) => string
  createThread: (projectId: string) => string
  setActiveThread: (projectId: string, threadId: string) => void
  appendMessage: (threadId: string, role: AiConversationMessage['role'], content: string, attachments?: AiConversationAttachment[]) => void
  deleteThread: (projectId: string, threadId: string) => void
}

export const useAiConversationStore = create<AiConversationState>()(
  persist(
    (set, get) => ({
      threads: [],
      activeThreadByProject: {},
      ensureThread: (projectId) => {
        const activeId = get().activeThreadByProject[projectId]
        if (activeId && get().threads.some((thread) => thread.id === activeId)) return activeId
        return get().createThread(projectId)
      },
      createThread: (projectId) => {
        const timestamp = new Date().toISOString()
        const thread: AiConversationThread = {
          id: id('chat'),
          projectId,
          title: '新对话',
          createdAt: timestamp,
          updatedAt: timestamp,
          messages: [],
        }
        set((state) => ({
          threads: [thread, ...state.threads].slice(0, 80),
          activeThreadByProject: { ...state.activeThreadByProject, [projectId]: thread.id },
        }))
        return thread.id
      },
      setActiveThread: (projectId, threadId) => {
        if (get().threads.some((thread) => thread.id === threadId && thread.projectId === projectId)) {
          set((state) => ({ activeThreadByProject: { ...state.activeThreadByProject, [projectId]: threadId } }))
        }
      },
      appendMessage: (threadId, role, rawContent, rawAttachments = []) => {
        const content = rawContent.trim()
        if (!content) return
        const attachments = rawAttachments.slice(0, 6).flatMap((item) => {
          if (!item || (item.kind !== 'image' && item.kind !== 'text')) return []
          const name = item.name?.trim().slice(0, 180)
          const mimeType = item.mimeType?.trim().slice(0, 100)
          if (!name || !mimeType) return []
          const preview = item.kind === 'image'
            && typeof item.preview === 'string'
            && /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(item.preview)
            && item.preview.length <= 200_000
            ? item.preview
            : undefined
          return [{ kind: item.kind, name, mimeType, ...(preview ? { preview } : {}) } satisfies AiConversationAttachment]
        })
        const timestamp = new Date().toISOString()
        set((state) => ({
          threads: state.threads.map((thread) => {
            if (thread.id !== threadId) return thread
            const firstUserMessage = role === 'user' && !thread.messages.some((message) => message.role === 'user')
            return {
              ...thread,
              title: firstUserMessage ? content.replace(/\s+/g, ' ').slice(0, 22) : thread.title,
              updatedAt: timestamp,
              messages: [...thread.messages, {
                id: id('message'),
                role,
                content: content.slice(0, 4000),
                createdAt: timestamp,
                ...(attachments.length ? { attachments } : {}),
              }].slice(-120),
            }
          }),
        }))
      },
      deleteThread: (projectId, threadId) => {
        let remaining = get().threads.filter((thread) => thread.id !== threadId)
        let next = remaining.find((thread) => thread.projectId === projectId)
        if (!next) {
          const timestamp = new Date().toISOString()
          next = {
            id: id('chat'),
            projectId,
            title: '新对话',
            createdAt: timestamp,
            updatedAt: timestamp,
            messages: [],
          }
          remaining = [next, ...remaining]
        }
        set((state) => ({
          threads: remaining,
          activeThreadByProject: { ...state.activeThreadByProject, [projectId]: next.id },
        }))
      },
    }),
    { name: 'fengsha-ai-conversations-v1', version: 1 },
  ),
)

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AiWorkflowStage } from '@/lib/ai-diagram-workflow'

export type AiTaskEngine = 'mermaid' | 'drawio'

export interface AiTaskSnapshot {
  engine: AiTaskEngine
  documentId: string
  running: boolean
  applying: boolean
  streamText: string
  workflowStage: AiWorkflowStage | null
  requestError: string | null
  candidate: unknown | null
  candidateStale: boolean
  applied: boolean
  appliedBefore: string | null
  startedAt: string | null
  completedAt: string | null
}

interface AiTaskState {
  tasks: Record<string, AiTaskSnapshot>
  patchTask: (taskKey: string, patch: Partial<AiTaskSnapshot>) => void
}

interface AiTaskRuntime {
  controller: AbortController
  streamBuffer: string
  streamFlushTimer: number
}

const runtimes = new Map<string, AiTaskRuntime>()

export const useAiTaskStore = create<AiTaskState>()(persist((set) => ({
  tasks: {},
  patchTask: (taskKey, patch) => set((state) => ({
    tasks: {
      ...state.tasks,
      [taskKey]: {
        ...state.tasks[taskKey],
        ...patch,
      } as AiTaskSnapshot,
    },
  })),
}), {
  name: 'fengsha-ai-tasks-v1',
  partialize: (state) => ({ tasks: state.tasks }),
  merge: (persistedState, currentState) => {
    const saved = persistedState as { tasks?: Record<string, AiTaskSnapshot> } | undefined
    const tasks = Object.fromEntries(Object.entries(saved?.tasks ?? {}).map(([key, task]) => [key, task.running || task.applying
      ? {
          ...task,
          running: false,
          applying: false,
          workflowStage: 'failed' as const,
          requestError: task.requestError || '应用在任务执行期间关闭，已保留中断前输出；请重新发送以继续。',
          completedAt: task.completedAt ?? new Date().toISOString(),
        }
      : { ...task, applying: false }]))
    return { ...currentState, tasks }
  },
}))

export function aiTaskKey(engine: AiTaskEngine, documentId: string, threadId?: string): string {
  return `${engine}:${documentId}${threadId ? `:${threadId}` : ''}`
}

export function beginAiTask(
  taskKey: string,
  engine: AiTaskEngine,
  documentId: string,
  preserveCandidate: boolean,
): AbortController {
  const previous = useAiTaskStore.getState().tasks[taskKey]
  const existing = runtimes.get(taskKey)
  if (existing) {
    existing.controller.abort('replaced')
    window.clearTimeout(existing.streamFlushTimer)
  }

  const controller = new AbortController()
  runtimes.set(taskKey, { controller, streamBuffer: '', streamFlushTimer: 0 })
  useAiTaskStore.getState().patchTask(taskKey, {
    engine,
    documentId,
    running: true,
    applying: false,
    streamText: '',
    workflowStage: null,
    requestError: null,
    candidate: preserveCandidate ? previous?.candidate ?? null : null,
    candidateStale: preserveCandidate && Boolean(previous?.candidate),
    applied: false,
    appliedBefore: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  })
  return controller
}

export function patchAiTask(taskKey: string, patch: Partial<AiTaskSnapshot>): void {
  useAiTaskStore.getState().patchTask(taskKey, patch)
}

export function appendAiTaskDelta(taskKey: string, delta: string): void {
  const runtime = runtimes.get(taskKey)
  if (!runtime || runtime.controller.signal.aborted) return
  runtime.streamBuffer += delta
  if (runtime.streamFlushTimer) return
  runtime.streamFlushTimer = window.setTimeout(() => {
    runtime.streamFlushTimer = 0
    if (runtimes.get(taskKey) !== runtime) return
    patchAiTask(taskKey, { streamText: runtime.streamBuffer })
  }, 32)
}

export function setAiTaskStage(taskKey: string, stage: AiWorkflowStage): void {
  const runtime = runtimes.get(taskKey)
  if (stage === 'repairing' && runtime) {
    window.clearTimeout(runtime.streamFlushTimer)
    runtime.streamFlushTimer = 0
    runtime.streamBuffer = ''
    patchAiTask(taskKey, { workflowStage: stage, streamText: '' })
    return
  }
  patchAiTask(taskKey, { workflowStage: stage })
}

export function stopAiTask(taskKey: string): void {
  runtimes.get(taskKey)?.controller.abort('user')
}

export function finishAiTask(taskKey: string, controller: AbortController): void {
  const runtime = runtimes.get(taskKey)
  if (!runtime || runtime.controller !== controller) return
  window.clearTimeout(runtime.streamFlushTimer)
  const streamText = runtime.streamBuffer || useAiTaskStore.getState().tasks[taskKey]?.streamText || ''
  runtimes.delete(taskKey)
  patchAiTask(taskKey, {
    running: false,
    streamText,
    completedAt: new Date().toISOString(),
  })
}

export function resetAiTaskStoreForTests(): void {
  for (const runtime of runtimes.values()) {
    runtime.controller.abort('test-reset')
    window.clearTimeout(runtime.streamFlushTimer)
  }
  runtimes.clear()
  useAiTaskStore.setState({ tasks: {} })
  try {
    localStorage.removeItem('fengsha-ai-tasks-v1')
  } catch {
    // Some non-browser test environments intentionally do not expose storage.
  }
}

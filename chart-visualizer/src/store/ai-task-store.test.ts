import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aiTaskKey,
  appendAiTaskDelta,
  beginAiTask,
  finishAiTask,
  resetAiTaskStoreForTests,
  useAiTaskStore,
} from '@/store/ai-task-store'

describe('AI task stream buffering', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetAiTaskStoreForTests()
  })

  afterEach(() => {
    resetAiTaskStoreForTests()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('flushes live text even when animation frames are suspended in a hidden window', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 999)
    const taskKey = aiTaskKey('mermaid', 'hidden-window', 'thread')
    const controller = beginAiTask(taskKey, 'mermaid', 'hidden-window', false)

    appendAiTaskDelta(taskKey, '{"summary":"第一段"')
    appendAiTaskDelta(taskKey, ',"code":{"schemaVersion":"fengsha.plan/v1"')
    await vi.advanceTimersByTimeAsync(80)

    expect(useAiTaskStore.getState().tasks[taskKey]?.streamText).toContain('fengsha.plan/v1')
    finishAiTask(taskKey, controller)
  })
})

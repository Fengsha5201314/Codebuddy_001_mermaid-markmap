import { describe, expect, it } from 'vitest'
import type { AiProviderId, AiStatus } from '@/lib/ai-contract'
import {
  canFetchProviderModels,
  inferModelVision,
  maskProviderDrafts,
  modelSupportsVision,
  providerDraftIsDirty,
  type ProviderConnectionDraft,
} from '@/lib/provider-settings'

const drafts: Record<AiProviderId, ProviderConnectionDraft> = {
  cpa: { label: 'CPA AI', baseUrl: 'https://example.test/v1', apiKey: 'temporary-secret', showKey: true },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKey: '', showKey: false },
  custom: { label: '自定义 API', baseUrl: '', apiKey: '', showKey: false },
}

const configured: AiStatus['providers'][number] = {
  id: 'cpa',
  label: 'CPA AI',
  configured: true,
  baseUrl: 'https://example.test/v1',
  builtIn: true,
}

describe('AI provider settings UI state', () => {
  it('always clears and masks a typed key after status refresh', () => {
    const refreshed = maskProviderDrafts(drafts, [configured])
    expect(refreshed.cpa).toMatchObject({ apiKey: '', showKey: false })
    expect(refreshed.cpa.baseUrl).toBe(configured.baseUrl)
  })

  it('only unlocks model loading after the saved connection matches the draft', () => {
    expect(providerDraftIsDirty('cpa', drafts.cpa, configured)).toBe(true)
    expect(canFetchProviderModels('cpa', drafts.cpa, configured)).toBe(false)

    const savedDraft = { ...drafts.cpa, apiKey: '', showKey: false }
    expect(providerDraftIsDirty('cpa', savedDraft, configured)).toBe(false)
    expect(canFetchProviderModels('cpa', savedDraft, configured)).toBe(true)
  })

  it('auto-enables multimodal CPA GPT 5 models while keeping a manual off switch', () => {
    const selection = { provider: 'cpa' as const, model: 'gpt-5.6-terra' }
    expect(inferModelVision(selection)).toBe(true)
    expect(modelSupportsVision(selection, { ...selection, vision: false })).toBe(true)
    expect(modelSupportsVision(selection, { ...selection, visionMode: 'disabled' })).toBe(false)
  })

  it('keeps unknown models conservative until the user explicitly enables vision', () => {
    const selection = { provider: 'custom' as const, model: 'private-text-model' }
    expect(modelSupportsVision(selection, { ...selection, visionMode: 'auto' })).toBe(false)
    expect(modelSupportsVision(selection, { ...selection, visionMode: 'enabled' })).toBe(true)
  })
})

import type { AiModelSelection, AiProviderId, AiStatus } from '@/lib/ai-contract'

export interface ProviderConnectionDraft {
  label: string
  baseUrl: string
  apiKey: string
  showKey: boolean
}

type ProviderStatus = AiStatus['providers'][number]

export type ModelVisionMode = 'auto' | 'enabled' | 'disabled'

export interface ModelVisionPreference extends AiModelSelection {
  visionMode?: ModelVisionMode
  vision?: boolean
}

export function inferModelVision(selection: AiModelSelection): boolean {
  if (selection.provider === 'deepseek') return false
  const model = selection.model.trim().toLowerCase()
  return /^(?:gpt-(?:4o|4\.1|4\.5|5(?:[.\-_]|$))|o(?:1|3|4)(?:[.\-_]|$)|gemini(?:[.\-_]|$)|claude-(?:3|4)(?:[.\-_]|$))/.test(model)
    || /(?:^|[.\-_])(?:vision|multimodal|vl)(?:[.\-_]|$)/.test(model)
}

export function modelVisionMode(preference?: ModelVisionPreference): ModelVisionMode {
  if (preference?.visionMode === 'enabled' || preference?.visionMode === 'disabled' || preference?.visionMode === 'auto') {
    return preference.visionMode
  }
  // v1.5.3 and earlier wrote false for every newly enabled model. Treat that
  // legacy default as auto; a legacy true remains an explicit opt-in.
  return preference?.vision === true ? 'enabled' : 'auto'
}

export function modelSupportsVision(
  selection: AiModelSelection | null | undefined,
  preference?: ModelVisionPreference,
): boolean {
  if (!selection || selection.provider === 'deepseek') return false
  const mode = modelVisionMode(preference)
  if (mode === 'enabled') return true
  if (mode === 'disabled') return false
  return inferModelVision(selection)
}

export function maskProviderDrafts(
  drafts: Record<AiProviderId, ProviderConnectionDraft>,
  providers: ProviderStatus[] = [],
): Record<AiProviderId, ProviderConnectionDraft> {
  const updated = { ...drafts }
  for (const provider of providers) {
    updated[provider.id] = {
      ...drafts[provider.id],
      label: provider.label,
      baseUrl: provider.baseUrl,
      apiKey: '',
      showKey: false,
    }
  }
  for (const providerId of Object.keys(updated) as AiProviderId[]) {
    updated[providerId] = { ...updated[providerId], apiKey: '', showKey: false }
  }
  return updated
}

export function providerDraftIsDirty(
  providerId: AiProviderId,
  draft: ProviderConnectionDraft,
  provider?: ProviderStatus,
): boolean {
  if (!provider) return true
  return draft.baseUrl.trim() !== provider.baseUrl
    || (providerId === 'custom' && draft.label.trim() !== provider.label)
    || Boolean(draft.apiKey.trim())
}

export function canFetchProviderModels(
  providerId: AiProviderId,
  draft: ProviderConnectionDraft,
  provider?: ProviderStatus,
): boolean {
  return Boolean(provider?.configured && !providerDraftIsDirty(providerId, draft, provider))
}

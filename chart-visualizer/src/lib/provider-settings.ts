import type { AiProviderId, AiStatus } from '@/lib/ai-contract'

export interface ProviderConnectionDraft {
  label: string
  baseUrl: string
  apiKey: string
  showKey: boolean
}

type ProviderStatus = AiStatus['providers'][number]

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

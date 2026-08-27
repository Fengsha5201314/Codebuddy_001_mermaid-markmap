import { useEffect, useMemo, useState } from 'react'
import {
  AppWindow,
  Check,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Gauge,
  Grid3X3,
  HardDrive,
  KeyRound,
  LoaderCircle,
  PanelLeft,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  Workflow,
  Trash2,
  X,
} from 'lucide-react'
import { Modal } from '@/components/Modal'
import {
  AI_PROVIDERS,
  aiModelKey,
  type AiModelSelection,
  type AiProviderId,
  type AiStatus,
} from '@/lib/ai-contract'
import { AiApiError, getAiModels, getAiStatus, updateAiProviderSettings } from '@/lib/ai-client'
import { BUNDLED_DRAWIO_VERSION } from '@/lib/drawio-runtime'
import {
  canFetchProviderModels,
  modelSupportsVision,
  maskProviderDrafts,
  providerDraftIsDirty,
  type ProviderConnectionDraft,
} from '@/lib/provider-settings'
import {
  checkForUpdates,
  getAppInfo,
  getUpdateState,
  installUpdate,
  onUpdateState,
  type AppInfo,
  type UpdateState,
} from '@/lib/desktop-runtime'
import { useWorkspaceStore } from '@/store/workspace-store'
import { usePromptTemplateStore } from '@/store/prompt-template-store'
import type { AiPromptTemplateCategory } from '@/lib/ai-prompt-templates'
import type { WorkspaceView } from '@/types'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  onImport: () => void
  onBackup: () => void
}

type SettingsTab = 'workspace' | 'canvas' | 'ai' | 'prompts' | 'data' | 'app'

const emptyDrafts: Record<AiProviderId, ProviderConnectionDraft> = {
  cpa: { label: 'CPA AI', baseUrl: 'https://cpa.fengsha.online/v1', apiKey: '', showKey: false },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKey: '', showKey: false },
  custom: { label: '自定义 API', baseUrl: '', apiKey: '', showKey: false },
}

const providerDescriptions: Record<AiProviderId, string> = {
  cpa: '与 SAP 桌面任务工具保持一致的 CPA 服务。',
  deepseek: 'DeepSeek 官方 OpenAI 兼容接口。',
  custom: '接入其他兼容 /models 与 /chat/completions 的服务。',
}

const providerMarks: Record<AiProviderId, string> = {
  cpa: 'C',
  deepseek: 'D',
  custom: 'API',
}

const viewOptions: Array<{ id: WorkspaceView; label: string; description: string; effect: string }> = [
  { id: 'canvas', label: '仅画布', description: '隐藏源码，专注查看和拖动画布', effect: '源码区隐藏' },
  { id: 'split', label: '画布 + 源码', description: '左侧写源码，右侧同步查看结果', effect: '双区同时显示' },
  { id: 'source', label: '仅源码', description: '隐藏画布，获得更宽的编辑空间', effect: '画布区隐藏' },
]

function readableError(error: unknown): string {
  if (error instanceof AiApiError) return error.message
  if (error instanceof Error) return error.message
  return '操作失败，请稍后重试。'
}

export function SettingsDialog({ open, onClose, onImport, onBackup }: SettingsDialogProps) {
  const preferences = useWorkspaceStore((state) => state.preferences)
  const updatePreferences = useWorkspaceStore((state) => state.updatePreferences)
  const promptTemplates = usePromptTemplateStore((state) => state.templates)
  const addPromptTemplate = usePromptTemplateStore((state) => state.addTemplate)
  const updatePromptTemplate = usePromptTemplateStore((state) => state.updateTemplate)
  const removePromptTemplate = usePromptTemplateStore((state) => state.removeTemplate)
  const restorePromptTemplates = usePromptTemplateStore((state) => state.restoreDefaults)
  const [tab, setTab] = useState<SettingsTab>('workspace')
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<AiProviderId, ProviderConnectionDraft>>(emptyDrafts)
  const [models, setModels] = useState<Partial<Record<AiProviderId, string[]>>>({})
  const [modelSelection, setModelSelection] = useState<Partial<Record<AiProviderId, string>>>({})
  const [savingProvider, setSavingProvider] = useState<AiProviderId | null>(null)
  const [loadingProvider, setLoadingProvider] = useState<AiProviderId | null>(null)
  const [providerMessages, setProviderMessages] = useState<Partial<Record<AiProviderId, { type: 'success' | 'error'; text: string }>>>({})
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [appUpdate, setAppUpdate] = useState<UpdateState | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(promptTemplates[0]?.id ?? null)
  const [promptDraft, setPromptDraft] = useState({ label: '', hint: '', prompt: '', category: '整理' as AiPromptTemplateCategory })

  useEffect(() => {
    const selected = promptTemplates.find((template) => template.id === selectedPromptId)
    if (selected) setPromptDraft({ label: selected.label, hint: selected.hint, prompt: selected.prompt, category: selected.category })
  }, [promptTemplates, selectedPromptId])

  const refreshStatus = async () => {
    setStatusError(null)
    setDrafts((current) => maskProviderDrafts(current))
    try {
      const next = await getAiStatus()
      setStatus(next)
      window.dispatchEvent(new Event('ai-settings-updated'))
      setDrafts((current) => maskProviderDrafts(current, next.providers))
    } catch (error) {
      setStatus(null)
      setStatusError(readableError(error))
    }
  }

  useEffect(() => {
    if (!open) return
    // Never carry a revealed or typed secret across closing/reopening or a refresh.
    setDrafts((current) => maskProviderDrafts(current))
    void refreshStatus()
  }, [open])

  useEffect(() => {
    if (!open) return
    let active = true
    void Promise.all([getAppInfo(), getUpdateState()]).then(([info, update]) => {
      if (!active) return
      setAppInfo(info)
      setAppUpdate(update)
    })
    const unsubscribe = onUpdateState((update) => {
      if (active) setAppUpdate(update)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [open])

  const providerLabels = useMemo(() => Object.fromEntries(
    AI_PROVIDERS.map((providerId) => [
      providerId,
      status?.providers.find((provider) => provider.id === providerId)?.label || emptyDrafts[providerId].label,
    ]),
  ) as Record<AiProviderId, string>, [status])

  const toggleModel = (selection: AiModelSelection) => {
    const key = aiModelKey(selection)
    const exists = preferences.aiEnabledModels.some((item) => aiModelKey(item) === key)
    const aiEnabledModels = exists
      ? preferences.aiEnabledModels.filter((item) => aiModelKey(item) !== key)
      : [...preferences.aiEnabledModels, { ...selection, visionMode: 'auto' as const }]
    const aiSelectedModel = exists && preferences.aiSelectedModel === key
      ? (aiEnabledModels[0] ? aiModelKey(aiEnabledModels[0]) : '')
      : (!preferences.aiSelectedModel ? key : preferences.aiSelectedModel)
    updatePreferences({ aiEnabledModels, aiSelectedModel })
  }

  const toggleModelVision = (selection: AiModelSelection) => {
    if (selection.provider === 'deepseek') return
    const key = aiModelKey(selection)
    updatePreferences({
      aiEnabledModels: preferences.aiEnabledModels.map((item) => aiModelKey(item) === key
        ? { ...item, visionMode: modelSupportsVision(item, item) ? 'disabled' : 'enabled', vision: undefined }
        : item),
    })
  }

  const availableModels = (provider: AiProviderId) => {
    const enabled = preferences.aiEnabledModels.filter((item) => item.provider === provider).map((item) => item.model)
    return [...new Set([...(models[provider] ?? []), ...enabled])]
  }

  const saveProvider = async (provider: AiProviderId, clearApiKey = false) => {
    const draft = drafts[provider]
    setSavingProvider(provider)
    setDrafts((current) => ({ ...current, [provider]: { ...current[provider], showKey: false } }))
    setProviderMessages((current) => ({ ...current, [provider]: undefined }))
    try {
      const next = await updateAiProviderSettings({
        provider,
        baseUrl: draft.baseUrl,
        label: provider === 'custom' ? draft.label : undefined,
        apiKey: draft.apiKey || undefined,
        clearApiKey,
      })
      setStatus(next)
      window.dispatchEvent(new Event('ai-settings-updated'))
      const savedProvider = next.providers.find((item) => item.id === provider)
      setDrafts((current) => maskProviderDrafts(current, savedProvider ? [savedProvider] : []))
      setModels((current) => ({ ...current, [provider]: undefined }))
      setProviderMessages((current) => ({
        ...current,
        [provider]: { type: 'success', text: clearApiKey ? 'API Key 已移除。' : '连接设置已保存。' },
      }))
    } catch (error) {
      setDrafts((current) => ({ ...current, [provider]: { ...current[provider], showKey: false } }))
      setProviderMessages((current) => ({ ...current, [provider]: { type: 'error', text: readableError(error) } }))
    } finally {
      setSavingProvider(null)
    }
  }

  const fetchModels = async (provider: AiProviderId) => {
    const savedProvider = status?.providers.find((item) => item.id === provider)
    if (!canFetchProviderModels(provider, drafts[provider], savedProvider)) {
      setProviderMessages((current) => ({
        ...current,
        [provider]: { type: 'error', text: '请先保存当前连接，保存成功后才能获取模型。' },
      }))
      return
    }
    setLoadingProvider(provider)
    setProviderMessages((current) => ({ ...current, [provider]: undefined }))
    try {
      const next = await getAiModels(provider)
      setModels((current) => ({ ...current, [provider]: next }))
      setModelSelection((current) => ({ ...current, [provider]: next.includes(current[provider] || '') ? current[provider] : next[0] || '' }))
      setProviderMessages((current) => ({
        ...current,
        [provider]: next.length
          ? { type: 'success', text: `已获取 ${next.length} 个模型。` }
          : { type: 'error', text: '接口没有返回可用模型。' },
      }))
    } catch (error) {
      setProviderMessages((current) => ({ ...current, [provider]: { type: 'error', text: readableError(error) } }))
    } finally {
      setLoadingProvider(null)
    }
  }

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    try {
      setAppUpdate(await checkForUpdates())
    } finally {
      setCheckingUpdate(false)
    }
  }

  const updateBusy = checkingUpdate || ['checking', 'available', 'downloading'].includes(appUpdate?.status || '')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="设置中心"
      description="工作区、AI 服务、本地数据和软件更新统一在这里管理。"
      size="wide"
    >
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分类">
          <button className={tab === 'workspace' ? 'active' : ''} onClick={() => setTab('workspace')}>
            <Settings2 size={16} /><span><strong>工作区</strong><small>布局与预览体验</small></span><ChevronRight size={14} />
          </button>
          <button className={tab === 'canvas' ? 'active' : ''} onClick={() => setTab('canvas')}>
            <Workflow size={16} /><span><strong>画布引擎</strong><small>本地与在线备用</small></span><ChevronRight size={14} />
          </button>
          <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>
            <Sparkles size={16} /><span><strong>AI 模型</strong><small>接口、密钥与模型</small></span><ChevronRight size={14} />
          </button>
          <button className={tab === 'prompts' ? 'active' : ''} onClick={() => setTab('prompts')}>
            <Pencil size={16} /><span><strong>AI 指令模板</strong><small>常用任务与系统提示词</small></span><ChevronRight size={14} />
          </button>
          <button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}>
            <Database size={16} /><span><strong>数据与安全</strong><small>备份和隐私说明</small></span><ChevronRight size={14} />
          </button>
          <button className={tab === 'app' ? 'active' : ''} onClick={() => setTab('app')}>
            <AppWindow size={16} /><span><strong>版本与更新</strong><small>版本号和软件升级</small></span><ChevronRight size={14} />
          </button>
        </nav>

        <div className="settings-content">
          {tab === 'workspace' && (
            <section className="settings-page" aria-labelledby="workspace-settings-title">
              <header className="settings-page-header">
                <span><Gauge size={18} /></span>
                <div><p>WORKSPACE</p><h3 id="workspace-settings-title">工作区体验</h3><small>调整当前工作区的布局与预览节奏，设置会自动保存在本机。</small></div>
              </header>

              <div className="settings-group">
                <div className="settings-group-title"><strong>工作视图</strong><small>也可以随时从顶部快速切换</small></div>
                <div className="settings-view-grid">
                  {viewOptions.map((option) => (
                    <button key={option.id} className={preferences.workspaceView === option.id ? 'active' : ''} onClick={() => updatePreferences({ workspaceView: option.id })}>
                      <span className={`settings-view-preview ${option.id}`} aria-hidden="true"><i /><i /></span>
                      <strong>{option.label}</strong><small>{option.description}</small>
                      <em>{preferences.workspaceView === option.id ? '正在使用' : option.effect}</em>
                      {preferences.workspaceView === option.id && <Check size={15} />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-group compact">
                <div className="setting-row">
                  <span className="setting-row-icon"><Grid3X3 size={16} /></span>
                  <span><strong>显示画布网格</strong><small>开启后显示对齐点阵；关闭后使用纯色背景</small></span>
                  <button className={`settings-switch ${preferences.canvasGrid ? 'on' : ''}`} role="switch" aria-label="显示画布网格" aria-checked={preferences.canvasGrid} onClick={() => updatePreferences({ canvasGrid: !preferences.canvasGrid })}><span>{preferences.canvasGrid ? '已开启' : '已关闭'}</span><i /></button>
                </div>
                <div className="setting-row">
                  <span className="setting-row-icon"><PanelLeft size={16} /></span>
                  <span><strong>显示左侧项目栏</strong><small>开启后显示项目名称和列表；关闭后收成窄图标栏</small></span>
                  <button className={`settings-switch ${!preferences.sidebarCollapsed ? 'on' : ''}`} role="switch" aria-label="显示左侧项目栏" aria-checked={!preferences.sidebarCollapsed} onClick={() => updatePreferences({ sidebarCollapsed: !preferences.sidebarCollapsed })}><span>{!preferences.sidebarCollapsed ? '已开启' : '已关闭'}</span><i /></button>
                </div>
                <label className="setting-row select-row">
                  <span className="setting-row-icon"><RefreshCw size={16} /></span>
                  <span><strong>实时预览节奏</strong><small>输入源码后等待多久再重新渲染</small></span>
                  <select value={preferences.renderDelay} onChange={(event) => updatePreferences({ renderDelay: Number(event.target.value) })}>
                    <option value={160}>快速 · 160ms</option>
                    <option value={280}>平衡 · 280ms</option>
                    <option value={600}>节能 · 600ms</option>
                  </select>
                </label>
              </div>

              <div className="settings-group">
                <div className="settings-group-title"><strong>分栏比例</strong><small>当前源码区域 {Math.round(preferences.editorRatio)}%</small></div>
                <div className="settings-range-row">
                  <span>窄</span>
                  <input type="range" min="28" max="68" value={preferences.editorRatio} onChange={(event) => updatePreferences({ editorRatio: Number(event.target.value) })} aria-label="源码区域宽度" />
                  <span>宽</span>
                  <button onClick={() => updatePreferences({ editorRatio: 38 })}>恢复默认</button>
                </div>
              </div>
            </section>
          )}

          {tab === 'ai' && (
            <section className="settings-page" aria-labelledby="ai-settings-title">
              <header className="settings-page-header ai">
                <span><Sparkles size={18} /></span>
                <div><p>AI CONNECTIONS</p><h3 id="ai-settings-title">AI 服务与模型</h3><small>先保存连接，再获取模型并启用。API Key 只保存在本机服务端。</small></div>
                <button className="settings-refresh" onClick={() => void refreshStatus()}><RefreshCw size={14} />刷新状态</button>
              </header>

              {statusError && (
                <div className="settings-alert error ai-connection-error" role="alert">
                  <span>{statusError}</span>
                  <button type="button" onClick={() => void refreshStatus()}><RefreshCw size={13} />重试连接</button>
                </div>
              )}
              <div className="ai-settings-guide"><span>1</span>填写连接 <i /> <span>2</span>获取模型 <i /> <span>3</span>启用后去 AI 助手使用</div>

              <div className="settings-provider-stack">
                {AI_PROVIDERS.map((providerId) => {
                  const provider = status?.providers.find((item) => item.id === providerId)
                  const draft = drafts[providerId]
                  const options = availableModels(providerId)
                  const currentModel = modelSelection[providerId] || options[0] || ''
                  const currentKey = currentModel ? aiModelKey({ provider: providerId, model: currentModel }) : ''
                  const enabled = preferences.aiEnabledModels.some((item) => aiModelKey(item) === currentKey)
                  const enabledModel = preferences.aiEnabledModels.find((item) => aiModelKey(item) === currentKey)
                  const enabledModelSupportsVision = modelSupportsVision(enabledModel, enabledModel)
                  const message = providerMessages[providerId]
                  const providerDirty = providerDraftIsDirty(providerId, draft, provider)
                  const modelFetchReady = canFetchProviderModels(providerId, draft, provider)
                  return (
                    <article className={`settings-provider-card ${provider?.configured ? 'configured' : ''}`} key={providerId}>
                      <header>
                        <span className="settings-provider-mark">{providerMarks[providerId]}</span>
                        <div>
                          {providerId === 'custom' ? (
                            <input
                              className="provider-name-input"
                              value={draft.label}
                              maxLength={40}
                              onChange={(event) => setDrafts((current) => ({ ...current, custom: { ...current.custom, label: event.target.value } }))}
                              aria-label="自定义 API 名称"
                            />
                          ) : <strong>{providerLabels[providerId]}</strong>}
                          <small>{providerDescriptions[providerId]}</small>
                        </div>
                        <span className={`provider-status ${provider?.configured && !providerDirty ? 'ready' : ''}`}><i />{providerDirty && provider?.configured ? '待保存' : provider?.configured ? '已配置' : '未配置'}</span>
                      </header>

                      <div className="provider-fields">
                        <label>
                          <span><Server size={13} />接口地址</span>
                          <input
                            type="url"
                            value={draft.baseUrl}
                            placeholder="例如 https://api.example.com/v1"
                            onChange={(event) => setDrafts((current) => ({ ...current, [providerId]: { ...current[providerId], baseUrl: event.target.value } }))}
                            aria-label={`${providerLabels[providerId]} 接口地址`}
                          />
                          <small>填写服务根地址，不要追加 /models 或 /chat/completions</small>
                        </label>
                        <label>
                          <span><KeyRound size={13} />API Key</span>
                          <div className="secret-input">
                            <input
                              type={draft.showKey ? 'text' : 'password'}
                              value={draft.apiKey}
                              placeholder={provider?.configured ? '已安全保存；留空保持不变' : '请输入 API Key'}
                              autoComplete="new-password"
                              onChange={(event) => setDrafts((current) => ({ ...current, [providerId]: { ...current[providerId], apiKey: event.target.value } }))}
                              aria-label={`${providerLabels[providerId]} API Key`}
                            />
                            <button type="button" onClick={() => setDrafts((current) => ({ ...current, [providerId]: { ...current[providerId], showKey: !current[providerId].showKey } }))} aria-label={draft.showKey ? '隐藏 API Key' : '显示 API Key'}>
                              {draft.showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                          <small>保存后不会再次显示完整密钥</small>
                        </label>
                      </div>

                      <div className="provider-actions">
                        <button className="save" disabled={savingProvider !== null || !draft.baseUrl.trim()} onClick={() => void saveProvider(providerId)}>
                          {savingProvider === providerId ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />}保存连接
                        </button>
                        <button
                          disabled={!modelFetchReady || loadingProvider !== null || savingProvider !== null}
                          onClick={() => void fetchModels(providerId)}
                          title={!modelFetchReady ? '先保存连接；保存成功后才能获取模型' : '读取该连接的可用模型'}
                        >
                          {loadingProvider === providerId ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}获取模型
                        </button>
                        {provider?.configured && <button className="danger-link" onClick={() => window.confirm(`移除 ${providerLabels[providerId]} 的 API Key？`) && void saveProvider(providerId, true)}>移除 Key</button>}
                      </div>

                      {!modelFetchReady && <p className="provider-step-hint">保存连接成功后，“获取模型”按钮会自动解锁。</p>}

                      {(options.length > 0 || models[providerId]) && (
                        <div className="provider-model-row">
                          <label htmlFor={`${providerId}-settings-model`}>可用模型</label>
                          <select id={`${providerId}-settings-model`} value={currentModel} onChange={(event) => setModelSelection((current) => ({ ...current, [providerId]: event.target.value }))}>
                            {!options.length && <option value="">没有可用模型</option>}
                            {options.map((model) => <option key={model} value={model}>{model}</option>)}
                          </select>
                          <button className={enabled ? 'enabled' : ''} disabled={!currentModel} onClick={() => currentModel && toggleModel({ provider: providerId, model: currentModel })}>
                            {enabled ? '停用' : '启用模型'}
                          </button>
                          {enabled && providerId !== 'deepseek' && (
                            <button
                              className={enabledModelSupportsVision ? 'enabled vision-toggle' : 'vision-toggle'}
                              onClick={() => toggleModelVision({ provider: providerId, model: currentModel })}
                              title={enabledModel?.visionMode === 'auto' || enabledModel?.visionMode === undefined
                                ? '当前根据模型名称自动判断；点击可手动覆盖'
                                : '手动设置；点击可切换'}
                            >图片识别：{enabledModelSupportsVision ? '开' : '关'}</button>
                          )}
                          {enabled && providerId === 'deepseek' && <small className="model-capability-note">仅文字</small>}
                        </div>
                      )}
                      {message && <p className={`provider-message ${message.type}`}>
                        {message.type === 'success' ? <CheckCircle2 size={13} /> : <X size={13} />}{message.text}
                      </p>}
                    </article>
                  )
                })}
              </div>

              <div className="enabled-model-summary">
                <div><strong>对话可选模型</strong><small>AI 助手中只显示这里启用的模型</small></div>
                {preferences.aiEnabledModels.length ? (
                  <div className="enabled-model-list">{preferences.aiEnabledModels.map((item) => (
                    <button key={aiModelKey(item)} onClick={() => toggleModel(item)} title="停用此模型">
                      <i>{providerMarks[item.provider]}</i><span>{providerLabels[item.provider]} · {item.model}</span><X size={12} />
                    </button>
                  ))}</div>
                ) : <p>还没有启用模型。完成上面的三个步骤后即可使用 AI 助手。</p>}
                {preferences.aiEnabledModels.length > 0 && (
                  <label className="default-model-row"><span>默认使用</span><select value={preferences.aiSelectedModel} onChange={(event) => updatePreferences({ aiSelectedModel: event.target.value })}>
                    {preferences.aiEnabledModels.map((item) => <option key={aiModelKey(item)} value={aiModelKey(item)}>{providerLabels[item.provider]} · {item.model}</option>)}
                  </select></label>
                )}
              </div>
            </section>
          )}

          {tab === 'prompts' && (
            <section className="settings-page" aria-labelledby="prompt-settings-title">
              <header className="settings-page-header compact-header">
                <span><Pencil size={18} /></span>
                <div><h3 id="prompt-settings-title">AI 指令模板</h3><small>管理右侧 AI 助手中的快捷任务。点击模板只会加入输入框，仍可继续补充要求。</small></div>
                <button className="settings-refresh" onClick={() => {
                  setSelectedPromptId(null)
                  setPromptDraft({ label: '', hint: '', prompt: '', category: '整理' })
                }}><Plus size={14} />新建</button>
              </header>
              <div className="prompt-settings-layout">
                <div className="prompt-template-list" aria-label="AI 指令模板列表">
                  {promptTemplates.map((template) => (
                    <button key={template.id} className={selectedPromptId === template.id ? 'active' : ''} onClick={() => setSelectedPromptId(template.id)}>
                      <span><strong>{template.label}</strong><small>{template.hint}</small></span><em>{template.category}</em>
                    </button>
                  ))}
                  {!promptTemplates.length && <p>暂无模板，请新建一个常用任务。</p>}
                </div>
                <div className="prompt-template-editor">
                  <div className="prompt-editor-grid">
                    <label><span>模板名称</span><input value={promptDraft.label} maxLength={18} onChange={(event) => setPromptDraft((current) => ({ ...current, label: event.target.value }))} placeholder="例如：会议纪要转流程" /></label>
                    <label><span>分类</span><select value={promptDraft.category} onChange={(event) => setPromptDraft((current) => ({ ...current, category: event.target.value as AiPromptTemplateCategory }))}><option>整理</option><option>流程</option><option>分析</option><option>创作</option></select></label>
                  </div>
                  <label><span>一句话说明</span><input value={promptDraft.hint} maxLength={36} onChange={(event) => setPromptDraft((current) => ({ ...current, hint: event.target.value }))} placeholder="让用户一眼看懂用途" /></label>
                  <label className="prompt-body-field"><span>专业指令内容</span><textarea value={promptDraft.prompt} maxLength={4000} onChange={(event) => setPromptDraft((current) => ({ ...current, prompt: event.target.value }))} placeholder="描述 AI 应如何分析当前图、如何处理不确定信息，以及期望的输出标准。" /><small>{promptDraft.prompt.length}/4000</small></label>
                  <div className="prompt-editor-actions">
                    <button onClick={() => {
                      if (!window.confirm('恢复内置办公模板？当前自定义修改会被替换。')) return
                      restorePromptTemplates()
                      setSelectedPromptId(null)
                    }}><RotateCcw size={14} />恢复内置模板</button>
                    {selectedPromptId && <button className="danger-link" onClick={() => {
                      if (!window.confirm('删除这个指令模板？')) return
                      removePromptTemplate(selectedPromptId)
                      setSelectedPromptId(null)
                    }}><Trash2 size={14} />删除</button>}
                    <button className="primary" disabled={!promptDraft.label.trim() || !promptDraft.prompt.trim()} onClick={() => {
                      if (selectedPromptId) updatePromptTemplate(selectedPromptId, promptDraft)
                      else setSelectedPromptId(addPromptTemplate(promptDraft))
                    }}><Save size={14} />{selectedPromptId ? '保存修改' : '添加模板'}</button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {tab === 'canvas' && (
            <section className="settings-page" aria-labelledby="canvas-settings-title">
              <header className="settings-page-header canvas-engine">
                <span><Workflow size={18} /></span>
                <div><p>VISUAL ENGINE</p><h3 id="canvas-settings-title">可视化画布引擎</h3><small>桌面版默认使用内置引擎，断网也能绘制；在线服务只作为可选备用。</small></div>
              </header>

              <div className="canvas-engine-status">
                <span><HardDrive size={19} /></span>
                <div><strong>draw.io v{BUNDLED_DRAWIO_VERSION} 已内置</strong><p>固定版本随风沙图表工作台一起测试和更新，不会因为官方网站不可用而失去画布。</p></div>
                <b>离线可用</b>
              </div>

              <div className="settings-group">
                <div className="settings-group-title"><strong>优先使用方式</strong><small>切换后会重新载入当前可视化画布</small></div>
                <div className="canvas-engine-options" role="radiogroup" aria-label="可视化画布引擎">
                  <button role="radio" aria-checked={preferences.visualEditorMode === 'local'} className={preferences.visualEditorMode === 'local' ? 'active' : ''} onClick={() => updatePreferences({ visualEditorMode: 'local' })}>
                    <span><HardDrive size={18} /></span>
                    <div><strong>本地内置</strong><small>推荐 · 无需连接官方网站</small><p>从安装包直接启动，版本固定、可离线、稳定性最高。</p></div>
                    {preferences.visualEditorMode === 'local' && <Check size={16} />}
                  </button>
                  <button role="radio" aria-checked={preferences.visualEditorMode === 'online'} className={preferences.visualEditorMode === 'online' ? 'active' : ''} onClick={() => updatePreferences({ visualEditorMode: 'online' })}>
                    <span><Cloud size={18} /></span>
                    <div><strong>官方在线</strong><small>需要访问 embed.diagrams.net</small><p>用于临时排查本地引擎问题，不建议作为桌面版默认方式。</p></div>
                    {preferences.visualEditorMode === 'online' && <Check size={16} />}
                  </button>
                </div>
              </div>

              <div className="settings-group compact">
                <div className="setting-row">
                  <span className="setting-row-icon"><Cloud size={16} /></span>
                  <span><strong>本地异常时自动使用在线备用</strong><small>仅在本地引擎启动失败时连接官方网站，图表仍保存在本机</small></span>
                  <button className={`settings-switch ${preferences.visualEditorOnlineFallback ? 'on' : ''}`} role="switch" aria-label="允许官方在线备用" aria-checked={preferences.visualEditorOnlineFallback} onClick={() => updatePreferences({ visualEditorOnlineFallback: !preferences.visualEditorOnlineFallback })}><span>{preferences.visualEditorOnlineFallback ? '已允许' : '已关闭'}</span><i /></button>
                </div>
              </div>

              <div className="settings-alert"><ShieldCheck size={15} />引擎不会跟随上游自动更新。新版本会先经过画布加载、保存、AI 修改、导出和离线测试，再随正式安装包发布。</div>
            </section>
          )}

          {tab === 'data' && (
            <section className="settings-page" aria-labelledby="data-settings-title">
              <header className="settings-page-header">
                <span><ShieldCheck size={18} /></span>
                <div><p>LOCAL FIRST</p><h3 id="data-settings-title">数据与安全</h3><small>{appInfo?.desktop ? '图表、偏好、版本和 API Key 均保存在这台电脑。' : '图表、偏好和版本保存在当前浏览器；API Key 保存在本机服务端。'}</small></div>
              </header>
              <div className="data-settings-grid">
                <article><span><Database size={18} /></span><div><strong>本地图表</strong><p>{appInfo?.desktop ? '项目、源码、主题和版本快照存放在桌面应用数据目录，不会自动上传。' : '项目、源码、主题和版本快照存放在浏览器本地存储中，不会自动上传。'}</p></div><b>自动保存</b></article>
                <article><span><KeyRound size={18} /></span><div><strong>AI 密钥</strong><p>{appInfo?.desktop ? '密钥写入桌面应用的私有设置文件，界面只显示是否已经配置。' : '密钥写入服务端私有设置文件，前端只读取是否已经配置，不回显密钥。'}</p></div><b>本机保存</b></article>
              </div>
              <div className="settings-group data-actions">
                <div className="settings-group-title"><strong>工作区迁移</strong><small>定期备份可以避免浏览器数据被清理后丢失</small></div>
                <div>
                  <button onClick={onBackup}><Download size={15} /><span><strong>下载完整备份</strong><small>包含全部本地图表和版本</small></span></button>
                  <button onClick={onImport}><Upload size={15} /><span><strong>导入工作区</strong><small>从已有备份恢复项目</small></span></button>
                </div>
              </div>
              <div className="settings-alert"><ShieldCheck size={15} />{appInfo?.desktop ? '软件升级和默认卸载不会主动删除本地图表与配置；仍建议定期下载完整备份。' : '如果以后部署到公网或提供多人使用，应先增加账号登录和管理权限；当前设置方式面向本地单用户环境。'}</div>
            </section>
          )}

          {tab === 'app' && (
            <section className="settings-page" aria-labelledby="app-settings-title">
              <header className="settings-page-header app-update-header">
                <span><AppWindow size={18} /></span>
                <div><p>SOFTWARE UPDATE</p><h3 id="app-settings-title">版本与更新</h3><small>查看当前版本，并在桌面应用内完成检查、下载和安装。</small></div>
              </header>

              <div className="app-version-card">
                <img src="/fengsha-icon.png" alt="风沙图表工作台图标" />
                <div>
                  <span className="app-edition">{appInfo?.desktop ? 'DESKTOP APP' : 'WEB APP'}</span>
                  <strong>{appInfo?.name || '风沙图表工作台'}</strong>
                  <p>{appInfo?.desktop ? '无需手动启动服务，双击即可使用。' : '网页版保留，可继续部署到本地或云服务器。'}</p>
                </div>
                <span className="app-version-number">v{appInfo?.version || appUpdate?.currentVersion || '1.1.0'}</span>
              </div>

              <div className={`app-update-card status-${appUpdate?.status || 'idle'}`}>
                <div className="app-update-status">
                  <span>{appUpdate?.status === 'up-to-date' || appUpdate?.status === 'downloaded' ? <CheckCircle2 size={20} /> : <RefreshCw size={20} className={updateBusy ? 'spin' : ''} />}</span>
                  <div>
                    <strong>{appUpdate?.status === 'downloaded' ? '新版本已经准备好' : appUpdate?.status === 'web' ? '网页版自动更新' : '桌面应用更新'}</strong>
                    <p>{appUpdate?.message || '正在读取版本信息…'}</p>
                  </div>
                </div>
                {typeof appUpdate?.progress === 'number' && (
                  <div className="app-update-progress" aria-label={`下载进度 ${appUpdate.progress}%`}><span style={{ width: `${appUpdate.progress}%` }} /></div>
                )}
                <div className="app-update-actions">
                  {appInfo?.desktop ? (
                    appUpdate?.status === 'downloaded' ? (
                      <button className="primary" onClick={() => void installUpdate()}><Download size={15} />立即重启并安装</button>
                    ) : (
                      <button className="primary" disabled={!appInfo.packaged || updateBusy} onClick={() => void handleCheckUpdate()}>
                        <RefreshCw size={15} className={updateBusy ? 'spin' : ''} />
                        {updateBusy ? '正在检查与下载' : appInfo.packaged ? '检查更新' : '开发预览版'}
                      </button>
                    )
                  ) : (
                    <a className="primary" href={appInfo?.releasesUrl} target="_blank" rel="noreferrer"><Download size={15} />获取桌面安装包</a>
                  )}
                  <a href={appInfo?.releasesUrl} target="_blank" rel="noreferrer">查看版本记录 <ExternalLink size={13} /></a>
                </div>
              </div>

              <div className="app-update-note">
                <ShieldCheck size={17} />
                <div><strong>更新来源清晰可追溯</strong><p>桌面版从本项目的 GitHub Releases 获取正式安装包；图表、版本快照和 AI 密钥不会因为软件更新而被删除。</p></div>
              </div>
            </section>
          )}
        </div>
      </div>
    </Modal>
  )
}

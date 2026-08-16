import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  FileCode2,
  LoaderCircle,
  MessageSquareText,
  PencilLine,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  Wrench,
  X,
} from 'lucide-react'
import { getDiagramTheme } from '@/data/themes'
import {
  aiModelKey,
  getAiLineStats,
  parseAiModelKey,
  type AiAction,
  type AiProviderId,
  type AiResponse,
  type AiStatus,
} from '@/lib/ai-contract'
import { AiApiError, getAiStatus, requestAiChangeStream } from '@/lib/ai-client'
import { renderDiagram } from '@/lib/diagram-engine'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { RenderError } from '@/types'

interface AiAssistantProps {
  renderError: RenderError | null
  onOpenSettings: () => void
}

interface AiCandidate {
  response: AiResponse
  sourceCode: string
  added: number
  removed: number
  validationError: string | null
  documentId: string
}

const providerLabels: Record<AiProviderId, string> = {
  cpa: 'CPA AI',
  deepseek: 'DeepSeek',
  custom: '自定义 API',
}

const actions: Array<{
  id: AiAction
  label: string
  hint: string
  icon: typeof Sparkles
}> = [
  { id: 'generate', label: '生成新图', hint: '把一段描述变成完整流程图', icon: WandSparkles },
  { id: 'edit', label: '按要求修改', hint: '保留原图，只调整指定内容', icon: PencilLine },
  { id: 'fix', label: '修复问题', hint: '检查并修复 Mermaid 语法', icon: Wrench },
  { id: 'explain', label: '解释当前图', hint: '梳理主路径、分支与风险', icon: MessageSquareText },
]

const placeholders: Record<AiAction, string> = {
  generate: '例如：生成一个采购审批泳道图，包含申请人、部门经理、采购和财务……',
  edit: '例如：在付款前增加财务复核；驳回后返回申请人修改……',
  fix: '可选：补充希望保留的内容，留空则自动检查并修复。',
  explain: '可选：重点解释哪些环节？留空则分析完整流程。',
}

function readableError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return '已停止本次 AI 请求。'
  if (error instanceof AiApiError) return error.message
  if (error instanceof Error) return error.message
  return 'AI 请求失败，请稍后重试。'
}

function readStreamingJsonField(source: string, field: string): string {
  const marker = source.indexOf(`"${field}"`)
  if (marker < 0) return ''
  const colon = source.indexOf(':', marker + field.length + 2)
  const quote = colon >= 0 ? source.indexOf('"', colon + 1) : -1
  if (quote < 0) return ''
  let value = ''
  let escaped = false
  for (let index = quote + 1; index < source.length; index += 1) {
    const character = source[index]
    if (escaped) {
      value += character === 'n' ? '\n' : character === 't' ? '\t' : character
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === '"') {
      break
    } else {
      value += character
    }
  }
  return value
}

function streamingPreview(source: string): string {
  const summary = readStreamingJsonField(source, 'summary')
  const code = readStreamingJsonField(source, 'code')
  if (code) return `${summary || '正在生成图表'}\n\n正在生成 Mermaid 源码…\n${code.slice(-2600)}`
  return summary || '已连接模型，正在接收内容…'
}

export function AiAssistant({ renderError, onOpenSettings }: AiAssistantProps) {
  const documents = useWorkspaceStore((state) => state.documents)
  const activeId = useWorkspaceStore((state) => state.activeDocumentId)
  const preferences = useWorkspaceStore((state) => state.preferences)
  const updatePreferences = useWorkspaceStore((state) => state.updatePreferences)
  const updateCode = useWorkspaceStore((state) => state.updateCode)
  const createVersion = useWorkspaceStore((state) => state.createVersion)
  const active = documents.find((document) => document.id === activeId)
  const controllerRef = useRef<AbortController | null>(null)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [action, setAction] = useState<AiAction>('generate')
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [candidate, setCandidate] = useState<AiCandidate | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [appliedBefore, setAppliedBefore] = useState<string | null>(null)
  const [streamText, setStreamText] = useState('')
  const streamBufferRef = useRef('')
  const streamFrameRef = useRef(0)

  const refreshStatus = async () => {
    setStatusError(null)
    try {
      setStatus(await getAiStatus())
    } catch (error) {
      setStatus(null)
      setStatusError(readableError(error))
    }
  }

  useEffect(() => {
    void refreshStatus()
    const onSettingsUpdated = () => void refreshStatus()
    window.addEventListener('ai-settings-updated', onSettingsUpdated)
    return () => {
      window.removeEventListener('ai-settings-updated', onSettingsUpdated)
      controllerRef.current?.abort()
      window.cancelAnimationFrame(streamFrameRef.current)
    }
  }, [])

  useEffect(() => {
    controllerRef.current?.abort()
    setCandidate(null)
    setRequestError(null)
    setAppliedBefore(null)
    setStreamText('')
    streamBufferRef.current = ''
  }, [activeId])

  const selectedAction = useMemo(() => actions.find((item) => item.id === action) ?? actions[0], [action])
  const SelectedActionIcon = selectedAction.icon
  const selectedModel = parseAiModelKey(preferences.aiSelectedModel)
  const selectedProviderStatus = selectedModel
    ? status?.providers.find((provider) => provider.id === selectedModel.provider)
    : null
  const selectedProviderLabel = selectedModel
    ? status?.providers.find((provider) => provider.id === selectedModel.provider)?.label || providerLabels[selectedModel.provider]
    : ''
  const canSubmit = Boolean(
    active
    && selectedModel
    && selectedProviderStatus?.configured
    && !running
    && ((action !== 'generate' && action !== 'edit') || prompt.trim()),
  )

  const run = async () => {
    if (!active || !canSubmit || !selectedModel) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const sourceCode = active.code
    const documentId = active.id
    setRunning(true)
    setCandidate(null)
    setRequestError(null)
    setAppliedBefore(null)
    setStreamText('')
    streamBufferRef.current = ''
    try {
      const response = await requestAiChangeStream({
        action,
        prompt: prompt.trim(),
        code: sourceCode,
        diagramKind: active.kind,
        provider: selectedModel.provider,
        model: selectedModel.model,
        renderError: renderError?.raw || renderError?.message,
      }, (delta) => {
        streamBufferRef.current += delta
        if (streamFrameRef.current) return
        streamFrameRef.current = window.requestAnimationFrame(() => {
          streamFrameRef.current = 0
          setStreamText(streamBufferRef.current)
        })
      }, controller.signal)
      if (controller.signal.aborted) return

      let validationError: string | null = null
      if (action !== 'explain') {
        try {
          await renderDiagram(response.code, getDiagramTheme(active.themeId))
        } catch (error) {
          validationError = error instanceof Error ? error.message : '生成的 Mermaid 暂时无法渲染。'
        }
      }
      const stats = getAiLineStats(sourceCode, response.code)
      setCandidate({
        response,
        sourceCode,
        documentId,
        added: stats.added,
        removed: stats.removed,
        validationError,
      })
    } catch (error) {
      if (controller.signal.aborted) {
        if (controller.signal.reason === 'user') setRequestError('已停止本次 AI 请求。')
      } else {
        setRequestError(readableError(error))
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setRunning(false)
      }
    }
  }

  if (!active) return null
  const isExplanation = candidate?.response.action === 'explain'
  const canApply = candidate
    && !isExplanation
    && !candidate.validationError
    && candidate.documentId === active.id
    && candidate.response.code !== active.code

  return (
    <div className="ai-assistant">
      <section className="ai-intro-card">
        <span className="ai-mark"><Sparkles size={18} /></span>
        <div>
          <span className="ai-eyebrow">CPA · DEEPSEEK · CUSTOM</span>
          <strong>先预览，再决定是否应用</strong>
          <p>AI 只处理当前图表，不会读取其他项目和本地版本。</p>
        </div>
      </section>

      {(statusError || !preferences.aiEnabledModels.length || (selectedModel && status && !selectedProviderStatus?.configured)) && (
        <section className={`ai-config-card ${statusError ? 'error' : ''}`}>
          <div>
            {statusError ? <AlertCircle size={17} /> : <ShieldCheck size={17} />}
            <span>
              <strong>{statusError ? '无法连接 AI 服务' : !preferences.aiEnabledModels.length ? '还没有启用模型' : '当前模型连接未配置'}</strong>
              <small>{statusError || '请到设置中心完成接口、API Key 与模型启用。'}</small>
            </span>
          </div>
          <button onClick={() => void refreshStatus()} aria-label="重新检查 AI 服务"><RefreshCw size={14} /></button>
          <button className="ai-open-settings" onClick={onOpenSettings}><Settings2 size={13} />打开设置中心</button>
        </section>
      )}

      <div className="ai-action-grid" role="radiogroup" aria-label="AI 操作">
        {actions.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              className={action === item.id ? 'active' : ''}
              onClick={() => {
                setAction(item.id)
                setCandidate(null)
                setRequestError(null)
                setAppliedBefore(null)
                setStreamText('')
                streamBufferRef.current = ''
              }}
              role="radio"
              aria-checked={action === item.id}
            >
              <Icon size={16} />
              <span><strong>{item.label}</strong><small>{item.hint}</small></span>
            </button>
          )
        })}
      </div>

      <section className="ai-prompt-card">
        <div className="ai-chat-model">
          <span>本次使用</span>
          <select
            value={preferences.aiSelectedModel}
            onChange={(event) => updatePreferences({ aiSelectedModel: event.target.value })}
            disabled={!preferences.aiEnabledModels.length || running}
            aria-label="本次使用的 AI 模型"
          >
            {!preferences.aiEnabledModels.length && <option value="">请先启用模型</option>}
            {preferences.aiEnabledModels.map((item) => (
              <option value={aiModelKey(item)} key={aiModelKey(item)}>{status?.providers.find((provider) => provider.id === item.provider)?.label || providerLabels[item.provider]} · {item.model}</option>
            ))}
          </select>
        </div>
        <label htmlFor="ai-diagram-prompt">
          <span><SelectedActionIcon size={15} />{selectedAction.label}</span>
          <small>{prompt.length}/4000</small>
        </label>
        <textarea
          id="ai-diagram-prompt"
          rows={5}
          maxLength={4000}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={placeholders[action]}
          disabled={running || !selectedModel}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault()
              void run()
            }
          }}
        />
        <footer>
          <span><ShieldCheck size={12} />仅发送当前源码与指令</span>
          {running ? (
            <button className="ai-stop-button" onClick={() => controllerRef.current?.abort('user')}><X size={14} />停止</button>
          ) : (
            <button className="ai-run-button" onClick={() => void run()} disabled={!canSubmit}>
              <Send size={14} />{action === 'explain' ? '开始分析' : '生成预览'}
            </button>
          )}
        </footer>
      </section>

      {running && (
        <div className={`ai-running-card ${streamText ? 'streaming' : ''}`} aria-live="polite">
          <header><LoaderCircle size={18} className="spin" /><span><strong>{streamText ? '正在流式生成' : '正在理解图表结构'}</strong><small>{streamText ? '内容会边生成边显示，完成后自动检查图表。' : '已发送请求，正在等待模型返回首段内容。'}</small></span></header>
          {streamText && <pre>{streamingPreview(streamText)}<i aria-hidden="true" /></pre>}
        </div>
      )}

      {requestError && (
        <div className="ai-error-card"><AlertCircle size={16} /><span><strong>本次请求没有完成</strong><small>{requestError}</small></span></div>
      )}

      {candidate && (
        <section className={`ai-result-card ${candidate.validationError ? 'invalid' : ''}`}>
          <header>
            <span className="ai-result-status">
              {candidate.validationError ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
              <strong>{isExplanation ? '分析完成' : candidate.validationError ? '需要人工检查' : '已通过渲染检查'}</strong>
            </span>
            <small>{candidate.response.provider === selectedModel?.provider ? selectedProviderLabel : providerLabels[candidate.response.provider]} · {candidate.response.model}</small>
          </header>
          <p className="ai-result-summary">{candidate.response.summary}</p>

          {!isExplanation && (
            <>
              <div className="ai-diff-stats">
                <span className="added">+{candidate.added} 行</span>
                <span className="removed">−{candidate.removed} 行</span>
                <span>尚未写入源码</span>
              </div>
              {candidate.response.changes.length > 0 && (
                <ul className="ai-change-list">
                  {candidate.response.changes.map((change, index) => <li key={`${change}-${index}`}><Check size={12} />{change}</li>)}
                </ul>
              )}
              {candidate.validationError && <p className="ai-validation-error">{candidate.validationError}</p>}
              <details className="ai-code-preview">
                <summary><FileCode2 size={14} />查看生成的 Mermaid 源码</summary>
                <pre>{candidate.response.code}</pre>
              </details>
            </>
          )}

          <footer className="ai-result-actions">
            {appliedBefore !== null ? (
              <>
                <span><CheckCircle2 size={13} />已同步到源码与画布</span>
                <button onClick={() => { updateCode(appliedBefore); setAppliedBefore(null) }}><RotateCcw size={13} />撤销本次</button>
              </>
            ) : (
              <>
                <button onClick={() => setCandidate(null)}>忽略</button>
                {!isExplanation && (
                  <button
                    className="apply"
                    disabled={!canApply}
                    onClick={() => {
                      createVersion('AI 修改前')
                      setAppliedBefore(active.code)
                      updateCode(candidate.response.code)
                    }}
                  ><Check size={14} />确认应用</button>
                )}
              </>
            )}
          </footer>
        </section>
      )}
    </div>
  )
}

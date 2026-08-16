import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  GitBranch,
  LoaderCircle,
  MessageSquareText,
  PencilLine,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react'
import { getDiagramTheme } from '@/data/themes'
import {
  aiModelKey,
  parseAiModelKey,
  type AiAction,
  type AiProviderId,
  type AiResponse,
  type AiStatus,
} from '@/lib/ai-contract'
import { AiApiError, getAiStatus, requestAiChangeStream } from '@/lib/ai-client'
import { visualAiStreamPreview } from '@/lib/ai-stream-preview'
import { renderDiagram } from '@/lib/diagram-engine'
import { validateDrawioXml } from '@/lib/drawio-xml'
import { EMPTY_DRAWIO_XML } from '@/lib/workspace-data'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { DiagramDocument } from '@/types'

type VisualAiAction = 'generate' | 'edit' | 'explain'

interface VisualAiAssistantProps {
  document: DiagramDocument
  onApplyXml: (xml: string) => void
  onApplyMermaid: (mermaid: string) => void
  onOpenSettings: () => void
}

interface VisualCandidate {
  response: AiResponse
  mode: 'xml' | 'mermaid'
  validationError: string | null
}

const providerLabels: Record<AiProviderId, string> = {
  cpa: 'CPA AI',
  deepseek: 'DeepSeek',
  custom: '自定义 API',
}

const actions: Array<{ id: VisualAiAction; label: string; hint: string; icon: typeof Sparkles }> = [
  { id: 'generate', label: 'AI 重绘', hint: '用描述生成新画布', icon: WandSparkles },
  { id: 'edit', label: '按要求修改', hint: '保留布局和无关样式', icon: PencilLine },
  { id: 'explain', label: '解释画布', hint: '梳理路径、分支与风险', icon: MessageSquareText },
]

const placeholders: Record<VisualAiAction, string> = {
  generate: '例如：重新生成一张采购审批泳道图，包含申请人、部门经理、采购和财务……',
  edit: '例如：在付款前增加财务复核，其他节点的位置和样式保持不变……',
  explain: '可选：希望重点分析哪些环节？留空则解释完整画布。',
}

function readableError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return '已停止本次 AI 请求。'
  if (error instanceof AiApiError || error instanceof Error) return error.message
  return 'AI 请求失败，请稍后重试。'
}

export function VisualAiAssistant({ document, onApplyXml, onApplyMermaid, onOpenSettings }: VisualAiAssistantProps) {
  const preferences = useWorkspaceStore((state) => state.preferences)
  const updatePreferences = useWorkspaceStore((state) => state.updatePreferences)
  const createVersion = useWorkspaceStore((state) => state.createVersion)
  const controllerRef = useRef<AbortController | null>(null)
  const streamBufferRef = useRef('')
  const streamFrameRef = useRef(0)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [action, setAction] = useState<VisualAiAction>('edit')
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [candidate, setCandidate] = useState<VisualCandidate | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)

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
    setApplied(false)
  }, [document.id])

  const selectedAction = useMemo(() => actions.find((item) => item.id === action) ?? actions[0], [action])
  const SelectedActionIcon = selectedAction.icon
  const selectedModel = parseAiModelKey(preferences.aiSelectedModel)
  const selectedProvider = selectedModel
    ? status?.providers.find((provider) => provider.id === selectedModel.provider)
    : undefined
  const canSubmit = Boolean(
    selectedModel
    && selectedProvider?.configured
    && !running
    && (action === 'explain' || prompt.trim()),
  )

  const run = async () => {
    if (!selectedModel || !canSubmit) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setRunning(true)
    setCandidate(null)
    setRequestError(null)
    setApplied(false)
    setStreamText('')
    streamBufferRef.current = ''

    const generate = action === 'generate'
    try {
      const response = await requestAiChangeStream({
        action: action as AiAction,
        prompt: prompt.trim(),
        code: generate ? '' : document.drawioXml || EMPTY_DRAWIO_XML,
        diagramKind: generate ? 'flowchart' : document.kind,
        diagramEngine: generate ? 'mermaid' : 'drawio',
        provider: selectedModel.provider,
        model: selectedModel.model,
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
      if (generate) {
        try {
          await renderDiagram(response.code, getDiagramTheme(document.themeId))
        } catch (error) {
          validationError = error instanceof Error ? error.message : '生成的 Mermaid 无法转换为画布。'
        }
      } else if (action !== 'explain') {
        validationError = validateDrawioXml(response.code)
      }
      setCandidate({ response, mode: generate ? 'mermaid' : 'xml', validationError })
    } catch (error) {
      if (!controller.signal.aborted) setRequestError(readableError(error))
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setRunning(false)
      }
    }
  }

  const canApply = candidate && candidate.response.action !== 'explain' && !candidate.validationError && !applied

  return (
    <div className="ai-assistant visual-ai-assistant">
      <section className="ai-intro-card visual-ai-intro">
        <span className="ai-mark"><GitBranch size={18} /></span>
        <div>
          <span className="ai-eyebrow">VISUAL CANVAS AI</span>
          <strong>先预览，再写入可视化画布</strong>
          <p>AI 只读取当前画布；应用前自动保存版本快照。</p>
        </div>
      </section>

      {(statusError || !preferences.aiEnabledModels.length || (selectedModel && status && !selectedProvider?.configured)) && (
        <section className={`ai-config-card ${statusError ? 'error' : ''}`}>
          <div><AlertCircle size={17} /><span><strong>{statusError ? '无法连接 AI 服务' : '画布 AI 尚未就绪'}</strong><small>{statusError || '请先在设置中启用 CPA 或 DeepSeek 模型。'}</small></span></div>
          <button onClick={() => void refreshStatus()} aria-label="重新检查 AI 服务"><RefreshCw size={14} /></button>
          <button className="ai-open-settings" onClick={onOpenSettings}><Settings2 size={13} />打开设置</button>
        </section>
      )}

      <div className="ai-action-grid visual-ai-actions" role="radiogroup" aria-label="画布 AI 操作">
        {actions.map((item) => {
          const Icon = item.icon
          return <button key={item.id} className={action === item.id ? 'active' : ''} onClick={() => { setAction(item.id); setCandidate(null); setRequestError(null); setApplied(false) }} role="radio" aria-checked={action === item.id}><Icon size={16} /><span><strong>{item.label}</strong><small>{item.hint}</small></span></button>
        })}
      </div>

      <section className="ai-prompt-card">
        <div className="ai-chat-model"><span>本次使用</span><select value={preferences.aiSelectedModel} onChange={(event) => updatePreferences({ aiSelectedModel: event.target.value })} disabled={!preferences.aiEnabledModels.length || running} aria-label="画布 AI 模型"><option value="" disabled>请选择模型</option>{preferences.aiEnabledModels.map((item) => <option value={aiModelKey(item)} key={aiModelKey(item)}>{status?.providers.find((provider) => provider.id === item.provider)?.label || providerLabels[item.provider]} · {item.model}</option>)}</select></div>
        <label htmlFor="visual-ai-prompt"><span><SelectedActionIcon size={15} />{selectedAction.label}</span><small>{prompt.length}/4000</small></label>
        <textarea id="visual-ai-prompt" rows={5} maxLength={4000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={placeholders[action]} disabled={running || !selectedModel} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void run() } }} />
        <footer><span><ShieldCheck size={12} />{action === 'generate' ? '生成结构后转为画布' : '仅发送当前画布与指令'}</span>{running ? <button className="ai-stop-button" onClick={() => controllerRef.current?.abort('user')}><X size={14} />停止</button> : <button className="ai-run-button" onClick={() => void run()} disabled={!canSubmit}><Send size={14} />{action === 'explain' ? '开始分析' : '生成预览'}</button>}</footer>
      </section>

      {running && <div className={`ai-running-card ${streamText ? 'streaming' : ''}`} aria-live="polite"><header><LoaderCircle size={18} className="spin" /><span><strong>{streamText ? '正在流式生成' : '正在读取画布结构'}</strong><small>{streamText ? '完成后会先校验，不会立即覆盖。' : '正在等待模型返回首段内容。'}</small></span></header>{streamText && <pre>{visualAiStreamPreview(streamText)}<i aria-hidden="true" /></pre>}</div>}
      {requestError && <div className="ai-error-card"><AlertCircle size={16} /><span><strong>本次请求没有完成</strong><small>{requestError}</small></span></div>}

      {candidate && <section className={`ai-result-card ${candidate.validationError ? 'invalid' : ''}`}><header><span className="ai-result-status">{candidate.validationError ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}<strong>{candidate.response.action === 'explain' ? '分析完成' : candidate.validationError ? '需要人工检查' : '已通过结构检查'}</strong></span><small>{selectedProvider?.label || providerLabels[candidate.response.provider]} · {candidate.response.model}</small></header><p className="ai-result-summary">{candidate.response.summary}</p>{candidate.response.changes.length > 0 && <ul className="ai-change-list">{candidate.response.changes.map((change, index) => <li key={`${change}-${index}`}><Check size={12} />{change}</li>)}</ul>}{candidate.validationError && <p className="ai-validation-error">{candidate.validationError}</p>}<footer className="ai-result-actions">{applied ? <span><CheckCircle2 size={13} />已应用到画布，可在版本中回退</span> : <><button onClick={() => setCandidate(null)}>忽略</button>{candidate.response.action !== 'explain' && <button className="apply" disabled={!canApply} onClick={() => { createVersion('AI 修改前'); if (candidate.mode === 'mermaid') onApplyMermaid(candidate.response.code); else onApplyXml(candidate.response.code); setApplied(true) }}><Check size={14} />确认应用</button>}</>}</footer></section>}
    </div>
  )
}

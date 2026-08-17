import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  GitMerge,
  ListPlus,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react'
import {
  aiModelKey,
  parseAiModelKey,
  type AiProviderId,
  type AiResponse,
  type AiStatus,
} from '@/lib/ai-contract'
import { AiApiError, getAiStatus, requestAiChangeStream } from '@/lib/ai-client'
import { runAiDiagramWorkflow, type AiWorkflowStage } from '@/lib/ai-diagram-workflow'
import { AI_PROMPT_TEMPLATES, appendAiPrompt, type AiPromptTemplateId } from '@/lib/ai-prompt-templates'
import { visualAiStreamPreview } from '@/lib/ai-stream-preview'
import { validateDrawioXml } from '@/lib/drawio-xml'
import { EMPTY_DRAWIO_XML } from '@/lib/workspace-data'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { DiagramDocument } from '@/types'

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
  repairAttempts: number
}

const providerLabels: Record<AiProviderId, string> = {
  cpa: 'CPA AI',
  deepseek: 'DeepSeek',
  custom: '自定义 API',
}

const templateIcons: Record<AiPromptTemplateId, typeof Sparkles> = {
  optimize: GitMerge,
  complete: ListPlus,
  diagnose: RefreshCw,
  transform: WandSparkles,
  review: MessageSquareText,
  create: Sparkles,
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
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const streamBufferRef = useRef('')
  const streamFrameRef = useRef(0)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [workflowStage, setWorkflowStage] = useState<AiWorkflowStage | null>(null)
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
    setPrompt('')
    setCandidate(null)
    setRequestError(null)
    setApplied(false)
    setWorkflowStage(null)
  }, [document.id])

  const selectedModel = parseAiModelKey(preferences.aiSelectedModel)
  const selectedProvider = selectedModel
    ? status?.providers.find((provider) => provider.id === selectedModel.provider)
    : undefined
  const canSubmit = Boolean(
    selectedModel
    && selectedProvider?.configured
    && !running
    && Boolean(prompt.trim()),
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
    setWorkflowStage(null)
    streamBufferRef.current = ''

    const currentXml = document.drawioXml && document.drawioXml !== EMPTY_DRAWIO_XML ? document.drawioXml : ''
    try {
      const payload = {
        action: 'auto',
        prompt: prompt.trim(),
        code: currentXml,
        diagramKind: document.kind,
        diagramEngine: 'drawio',
        provider: selectedModel.provider,
        model: selectedModel.model,
      } as const
      const result = await runAiDiagramWorkflow({
        payload,
        request: (requestPayload, onDelta, signal) => requestAiChangeStream(requestPayload, onDelta ?? (() => undefined), signal),
        validate: async (code) => {
          const error = validateDrawioXml(code)
          if (error) throw new Error(error)
        },
        onDelta: (delta) => {
          streamBufferRef.current += delta
          if (streamFrameRef.current) return
          streamFrameRef.current = window.requestAnimationFrame(() => {
            streamFrameRef.current = 0
            setStreamText(streamBufferRef.current)
          })
        },
        onStage: (stage) => {
          setWorkflowStage(stage)
          if (stage === 'repairing') {
            window.cancelAnimationFrame(streamFrameRef.current)
            streamFrameRef.current = 0
            streamBufferRef.current = ''
            setStreamText('')
          }
        },
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      setCandidate({
        response: result.response,
        mode: 'xml',
        validationError: result.validationError,
        repairAttempts: result.repairAttempts,
      })
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
  const hasCurrentDiagram = Boolean(document.drawioXml && document.drawioXml !== EMPTY_DRAWIO_XML)
  const contextDescription = hasCurrentDiagram
    ? `已识别当前可视化画布（${document.drawioXml?.length ?? 0} 字符），会与需求一起交给 AI 判断和处理。`
    : '当前画布还没有有效内容，AI 会根据你的描述创建新图。'
  const runningTitle = workflowStage === 'repairing'
    ? '初次结果未通过，正在自动修复'
    : workflowStage === 'validating'
      ? '正在检查画布结构'
      : streamText
        ? '正在流式生成'
        : '正在读取画布结构'

  return (
    <div className="ai-assistant visual-ai-assistant">
      {(statusError || !preferences.aiEnabledModels.length || (selectedModel && status && !selectedProvider?.configured)) && (
        <section className={`ai-config-card ${statusError ? 'error' : ''}`}>
          <div><AlertCircle size={17} /><span><strong>{statusError ? '无法连接 AI 服务' : '画布 AI 尚未就绪'}</strong><small>{statusError || '请先在设置中启用 CPA 或 DeepSeek 模型。'}</small></span></div>
          <button onClick={() => void refreshStatus()} aria-label="重新检查 AI 服务"><RefreshCw size={14} /></button>
          <button className="ai-open-settings" onClick={onOpenSettings}><Settings2 size={13} />打开设置</button>
        </section>
      )}

      <section className="ai-template-section" aria-labelledby="visual-ai-template-heading">
        <header><span><Sparkles size={15} /><strong id="visual-ai-template-heading">专业任务模板</strong></span><small>点击加入输入框，可继续补充细节</small></header>
        <div className="ai-template-grid">
          {AI_PROMPT_TEMPLATES.map((item) => {
            const Icon = templateIcons[item.id]
            return <button key={item.id} type="button" disabled={running} onClick={() => { setPrompt((current) => appendAiPrompt(current, item.prompt)); setCandidate(null); setRequestError(null); setApplied(false); window.requestAnimationFrame(() => promptRef.current?.focus()) }}><Icon size={16} /><span><strong>{item.label}</strong><small>{item.hint}</small></span></button>
          })}
        </div>
      </section>

      <section className="ai-prompt-card">
        <div className="ai-chat-model"><span>本次使用</span><select value={preferences.aiSelectedModel} onChange={(event) => updatePreferences({ aiSelectedModel: event.target.value })} disabled={!preferences.aiEnabledModels.length || running} aria-label="画布 AI 模型"><option value="" disabled>请选择模型</option>{preferences.aiEnabledModels.map((item) => <option value={aiModelKey(item)} key={aiModelKey(item)}>{status?.providers.find((provider) => provider.id === item.provider)?.label || providerLabels[item.provider]} · {item.model}</option>)}</select></div>
        <div className={`ai-context-strip ${hasCurrentDiagram ? 'ready' : 'empty'}`}><ShieldCheck size={13} /><span>{contextDescription}</span></div>
        <label htmlFor="visual-ai-prompt"><span><Sparkles size={15} />描述要完成的工作</span><small>{prompt.length}/4000</small></label>
        <textarea ref={promptRef} id="visual-ai-prompt" rows={5} maxLength={4000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：保留现有布局，在付款前增加财务复核；其他节点的位置和样式保持不变。也可以先点击上方模板。" disabled={running || !selectedModel} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void run() } }} />
        <footer><span><ShieldCheck size={12} />AI 会先理解当前画布，再决定新建、修改、修复或解释</span>{running ? <button className="ai-stop-button" onClick={() => controllerRef.current?.abort('user')}><X size={14} />停止</button> : <button className="ai-run-button" onClick={() => void run()} disabled={!canSubmit}><Send size={14} />分析并生成预览</button>}</footer>
      </section>

      {running && <div className={`ai-running-card ${streamText ? 'streaming' : ''}`} aria-live="polite"><header><LoaderCircle size={18} className="spin" /><span><strong>{runningTitle}</strong><small>{workflowStage === 'repairing' ? '系统已把候选内容和具体错误交给 AI，无需手工检查。' : streamText ? '完成后会先校验，不会立即覆盖。' : '正在等待模型返回首段内容。'}</small></span></header>{streamText && <pre>{visualAiStreamPreview(streamText)}<i aria-hidden="true" /></pre>}</div>}
      {requestError && <div className="ai-error-card"><AlertCircle size={16} /><span><strong>本次请求没有完成</strong><small>{requestError}</small></span></div>}

      {candidate && <section className={`ai-result-card ${candidate.validationError ? 'invalid' : ''}`}><header><span className="ai-result-status">{candidate.validationError ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}<strong>{candidate.response.action === 'explain' ? '分析完成' : candidate.validationError ? '自动修复仍未通过' : candidate.repairAttempts ? '已自动修复并通过检查' : '已通过结构检查'}</strong></span><small>{selectedProvider?.label || providerLabels[candidate.response.provider]} · {candidate.response.model}</small></header><p className="ai-result-summary">{candidate.response.summary}</p>{candidate.response.changes.length > 0 && <ul className="ai-change-list">{candidate.response.changes.map((change, index) => <li key={`${change}-${index}`}><Check size={12} />{change}</li>)}</ul>}{candidate.validationError && <p className="ai-validation-error">{candidate.validationError}</p>}<footer className="ai-result-actions">{applied ? <span><CheckCircle2 size={13} />已应用到画布，可在版本中回退</span> : <><button onClick={() => setCandidate(null)}>忽略</button>{candidate.validationError ? <button className="apply" onClick={() => void run()}><RefreshCw size={14} />重新生成并修复</button> : candidate.response.action !== 'explain' && <button className="apply" disabled={!canApply} onClick={() => { createVersion('AI 修改前'); if (candidate.mode === 'mermaid') onApplyMermaid(candidate.response.code); else onApplyXml(candidate.response.code); setApplied(true) }}><Check size={14} />确认应用</button>}</>}</footer></section>}
    </div>
  )
}

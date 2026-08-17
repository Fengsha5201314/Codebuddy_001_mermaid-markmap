import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  FileCode2,
  LoaderCircle,
  GitMerge,
  ListPlus,
  MessageSquareText,
  MessageSquarePlus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
  Wrench,
  X,
} from 'lucide-react'
import { getDiagramTheme } from '@/data/themes'
import {
  aiModelKey,
  getAiLineStats,
  parseAiModelKey,
  type AiProviderId,
  type AiResponse,
  type AiStatus,
} from '@/lib/ai-contract'
import { AiApiError, getAiStatus, requestAiChangeStream } from '@/lib/ai-client'
import type { AiAttachment } from '@/lib/ai-contract'
import { DEFAULT_AI_DIAGRAM_ACTION, runAiDiagramWorkflow, type AiWorkflowStage } from '@/lib/ai-diagram-workflow'
import { appendAiPrompt, type AiPromptTemplate } from '@/lib/ai-prompt-templates'
import { renderDiagram } from '@/lib/diagram-engine'
import { usePromptTemplateStore } from '@/store/prompt-template-store'
import { useAiConversationStore } from '@/store/ai-conversation-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { RenderError } from '@/types'
import { AiAttachmentPicker } from '@/components/AiAttachmentPicker'

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
  repairAttempts: number
}

const providerLabels: Record<AiProviderId, string> = {
  cpa: 'CPA AI',
  deepseek: 'DeepSeek',
  custom: '自定义 API',
}

function templateIcon(template: AiPromptTemplate): typeof Sparkles {
  if (template.id === 'optimize') return GitMerge
  if (template.id === 'complete' || template.id === 'approval' || template.id === 'sop') return ListPlus
  if (template.id === 'diagnose') return Wrench
  if (template.id === 'review') return MessageSquareText
  if (template.id === 'create' || template.id === 'transform') return WandSparkles
  return Sparkles
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
  const promptTemplates = usePromptTemplateStore((state) => state.templates)
  const documents = useWorkspaceStore((state) => state.documents)
  const activeId = useWorkspaceStore((state) => state.activeDocumentId)
  const preferences = useWorkspaceStore((state) => state.preferences)
  const updatePreferences = useWorkspaceStore((state) => state.updatePreferences)
  const updateCode = useWorkspaceStore((state) => state.updateCode)
  const createVersion = useWorkspaceStore((state) => state.createVersion)
  const active = documents.find((document) => document.id === activeId)
  const threads = useAiConversationStore((state) => state.threads)
  const activeThreadByProject = useAiConversationStore((state) => state.activeThreadByProject)
  const ensureThread = useAiConversationStore((state) => state.ensureThread)
  const createThread = useAiConversationStore((state) => state.createThread)
  const setActiveThread = useAiConversationStore((state) => state.setActiveThread)
  const appendMessage = useAiConversationStore((state) => state.appendMessage)
  const deleteThread = useAiConversationStore((state) => state.deleteThread)
  const controllerRef = useRef<AbortController | null>(null)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [candidate, setCandidate] = useState<AiCandidate | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [appliedBefore, setAppliedBefore] = useState<string | null>(null)
  const [streamText, setStreamText] = useState('')
  const [workflowStage, setWorkflowStage] = useState<AiWorkflowStage | null>(null)
  const [attachments, setAttachments] = useState<AiAttachment[]>([])
  const streamBufferRef = useRef('')
  const streamFrameRef = useRef(0)
  const projectId = active?.projectId ?? ''
  const projectThreads = threads.filter((thread) => thread.projectId === projectId)
  const activeThreadId = activeThreadByProject[projectId]
  const activeThread = projectThreads.find((thread) => thread.id === activeThreadId)

  useEffect(() => {
    if (projectId) ensureThread(projectId)
  }, [ensureThread, projectId])

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
    setAppliedBefore(null)
    setStreamText('')
    setWorkflowStage(null)
    setAttachments([])
    streamBufferRef.current = ''
  }, [activeId])

  const selectedModel = parseAiModelKey(preferences.aiSelectedModel)
  const selectedModelPreference = selectedModel
    ? preferences.aiEnabledModels.find((item) => aiModelKey(item) === preferences.aiSelectedModel)
    : undefined
  const supportsVision = Boolean(selectedModel && selectedModel.provider !== 'deepseek' && selectedModelPreference?.vision)
  const hasUnsupportedImage = attachments.some((item) => item.kind === 'image') && !supportsVision
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
    && Boolean(prompt.trim())
    && !hasUnsupportedImage
  )

  const executeWorkflow = async (
    payload: Parameters<typeof runAiDiagramWorkflow>[0]['payload'],
    sourceCode: string,
    documentId: string,
    threadId?: string,
  ) => {
    if (!active || !selectedModel) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setRunning(true)
    setCandidate(null)
    setRequestError(null)
    setAppliedBefore(null)
    setStreamText('')
    setWorkflowStage(null)
    streamBufferRef.current = ''
    try {
      const result = await runAiDiagramWorkflow({
        payload,
        request: (requestPayload, onDelta, signal) => requestAiChangeStream(requestPayload, onDelta ?? (() => undefined), signal),
        validate: (code) => renderDiagram(code, getDiagramTheme(active.themeId)),
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
      const response = result.response
      if (threadId) appendMessage(threadId, 'assistant', response.summary)
      setPrompt('')
      setAttachments([])
      if (response.action === 'explain') {
        setCandidate(null)
        return
      }
      const stats = getAiLineStats(sourceCode, response.code)
      setCandidate({
        response,
        sourceCode,
        documentId,
        added: stats.added,
        removed: stats.removed,
        validationError: result.validationError,
        repairAttempts: result.repairAttempts,
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

  const run = async (phase: 'discuss' | 'generate') => {
    if (!active || !canSubmit || !selectedModel) return
    const threadId = activeThread?.id ?? createThread(active.projectId)
    const userPrompt = prompt.trim()
    const conversation = (activeThread?.messages ?? []).map(({ role, content }) => ({ role, content }))
    appendMessage(threadId, 'user', userPrompt)
    const sourceCode = phase === 'generate' && candidate && !candidate.validationError
      ? candidate.response.code
      : active.code
    await executeWorkflow({
      action: DEFAULT_AI_DIAGRAM_ACTION,
      prompt: userPrompt,
      code: sourceCode,
      diagramKind: active.kind,
      provider: selectedModel.provider,
      model: selectedModel.model,
      renderError: renderError?.raw || renderError?.message,
      phase,
      conversation,
      attachments,
    }, sourceCode, active.id, threadId)
  }

  const retryCandidateRepair = async () => {
    if (!active || !candidate || !candidate.validationError || !selectedModel) return
    await executeWorkflow({
      action: 'fix',
      prompt: '继续修复这个候选图，使其通过 Mermaid 渲染检查；保持原始业务需求和已经完成的修改。',
      code: candidate.response.code,
      diagramKind: active.kind,
      provider: selectedModel.provider,
      model: selectedModel.model,
      renderError: candidate.validationError,
    }, candidate.sourceCode, candidate.documentId)
  }

  if (!active) return null
  const isExplanation = candidate?.response.action === 'explain'
  const canApply = candidate
    && !isExplanation
    && !candidate.validationError
    && candidate.documentId === active.id
    && candidate.response.code !== active.code
  const hasCurrentDiagram = Boolean(active.code.trim())
  const contextDescription = hasCurrentDiagram
    ? `已识别当前 Mermaid 源码（${active.code.length} 字符）${renderError ? '及渲染错误' : ''}，会与需求一起交给 AI 判断和处理。`
    : '当前页面没有可用源码，AI 会根据你的描述创建新图。'
  const runningTitle = workflowStage === 'repairing'
    ? '初次结果未通过，正在自动修复'
    : workflowStage === 'validating'
      ? '正在检查 Mermaid 是否可渲染'
      : streamText
        ? '正在流式生成'
        : '正在理解图表结构'

  return (
    <div className="ai-assistant">
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

      <section className="ai-conversation-card" aria-label="项目 AI 对话">
        <header>
          <span><MessageSquareText size={15} /><strong>项目对话</strong><small>Mermaid 与可视化画布共享</small></span>
          <div>
            <select value={activeThread?.id ?? ''} onChange={(event) => setActiveThread(projectId, event.target.value)} aria-label="选择历史对话">
              {projectThreads.map((thread) => <option key={thread.id} value={thread.id}>{thread.title}</option>)}
            </select>
            <button onClick={() => createThread(projectId)} title="开始新对话"><MessageSquarePlus size={14} />新对话</button>
            {activeThread && <button className="ai-delete-chat" onClick={() => { if (window.confirm('删除当前对话记录？')) deleteThread(projectId, activeThread.id) }} title="删除当前对话" aria-label="删除当前对话"><Trash2 size={14} /></button>}
          </div>
        </header>
        <div className="ai-message-list">
          {activeThread?.messages.slice(-10).map((message) => (
            <article key={message.id} className={message.role}>
              <strong>{message.role === 'user' ? '你' : 'AI'}</strong><p>{message.content}</p>
            </article>
          ))}
          {!activeThread?.messages.length && <p className="ai-conversation-empty">先说明目标，AI 会结合当前图追问和归纳；确认后再生成预览。</p>}
        </div>
      </section>

      <section className="ai-template-section" aria-labelledby="ai-template-heading">
        <header>
          <span><Sparkles size={15} /><strong id="ai-template-heading">专业任务模板</strong></span>
          <small>点击加入输入框，可继续补充细节</small>
        </header>
        <div className="ai-template-grid">
        {promptTemplates.map((item) => {
          const Icon = templateIcon(item)
          return (
            <button
              key={item.id}
              type="button"
              disabled={running}
              onClick={() => {
                setPrompt((current) => appendAiPrompt(current, item.prompt))
                setCandidate(null)
                setRequestError(null)
                setAppliedBefore(null)
                window.requestAnimationFrame(() => promptRef.current?.focus())
              }}
            >
              <Icon size={16} />
              <span><strong>{item.label}</strong><small>{item.hint}</small></span>
            </button>
          )
        })}
        </div>
      </section>

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
        <div className={`ai-context-strip ${hasCurrentDiagram ? 'ready' : 'empty'}`}>
          <ShieldCheck size={13} />
          <span>{contextDescription}</span>
        </div>
        <label htmlFor="ai-diagram-prompt">
          <span><Sparkles size={15} />描述要完成的工作</span>
          <small>{prompt.length}/4000</small>
        </label>
        <textarea
          ref={promptRef}
          id="ai-diagram-prompt"
          rows={5}
          maxLength={4000}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="例如：保留现有泳道，在付款前增加财务复核；驳回后返回申请人修改。也可以先点击上方模板，再补充具体要求。"
          disabled={running || !selectedModel}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault()
              void run('discuss')
            }
          }}
        />
        <AiAttachmentPicker
          attachments={attachments}
          supportsVision={supportsVision}
          disabled={running || !selectedModel}
          onChange={setAttachments}
          onError={setRequestError}
        />
        <footer>
          <span><ShieldCheck size={12} />AI 会先理解当前图，再决定新建、修改、修复或解释</span>
          {running ? (
            <button className="ai-stop-button" onClick={() => controllerRef.current?.abort('user')}><X size={14} />停止</button>
          ) : (
            <span className="ai-submit-actions">
              <button onClick={() => void run('discuss')} disabled={!canSubmit}><MessageSquareText size={14} />继续沟通</button>
              <button className="ai-run-button" onClick={() => void run('generate')} disabled={!canSubmit}><Send size={14} />生成预览</button>
            </span>
          )}
        </footer>
      </section>

      {running && (
        <div className={`ai-running-card ${streamText ? 'streaming' : ''}`} aria-live="polite">
          <header><LoaderCircle size={18} className="spin" /><span><strong>{runningTitle}</strong><small>{workflowStage === 'repairing' ? '系统已把候选源码和具体错误交给 AI，无需手工检查。' : streamText ? '内容会边生成边显示，完成后自动检查图表。' : '已发送请求，正在等待模型返回首段内容。'}</small></span></header>
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
              <strong>{isExplanation ? '分析完成' : candidate.validationError ? '自动修复仍未通过' : candidate.repairAttempts ? '已自动修复并通过检查' : '已通过渲染检查'}</strong>
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
              <details className="ai-code-preview" open={Boolean(candidate.validationError)}>
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
                {!isExplanation && candidate.validationError && (
                  <button className="apply" onClick={() => void retryCandidateRepair()}><RefreshCw size={14} />再次自动修复</button>
                )}
                {!isExplanation && !candidate.validationError && (
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

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
import { runAiDiagramWorkflow } from '@/lib/ai-diagram-workflow'
import { appendAiPrompt, type AiPromptTemplate } from '@/lib/ai-prompt-templates'
import { visualAiStreamPreview } from '@/lib/ai-stream-preview'
import { compileAiDrawioCode } from '@/lib/ai-drawio-plan'
import { appendAiAttachmentFiles, buildConversationAttachments, imageFilesFromClipboard } from '@/lib/ai-attachments'
import { validateDrawioXml } from '@/lib/drawio-xml'
import { EMPTY_DRAWIO_XML } from '@/lib/workspace-data'
import { useWorkspaceStore } from '@/store/workspace-store'
import { usePromptTemplateStore } from '@/store/prompt-template-store'
import { buildAiConversationContext, useAiConversationStore } from '@/store/ai-conversation-store'
import {
  aiTaskKey,
  appendAiTaskDelta,
  beginAiTask,
  finishAiTask,
  patchAiTask,
  setAiTaskStage,
  stopAiTask,
  useAiTaskStore,
} from '@/store/ai-task-store'
import type { AiAttachment } from '@/lib/ai-contract'
import type { DiagramDocument } from '@/types'
import { AiAttachmentPicker } from '@/components/AiAttachmentPicker'
import { AiConversationPanel, AiTemplateMenu } from '@/components/AiConversationPanel'
import { QualityReceiptSummary } from '@/components/QualityReceiptSummary'
import { modelSupportsVision } from '@/lib/provider-settings'
import {
  assessDrawioDiagram,
  qualityFailureMessage,
  type DiagramQualityReceipt,
} from '@/lib/reliable-diagram-delivery'

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
  documentId: string
  baseXml: string
  qualityReceipt: DiagramQualityReceipt | null
}

const providerLabels: Record<AiProviderId, string> = {
  cpa: 'CPA AI',
  deepseek: 'DeepSeek',
  custom: '自定义 API',
}

function templateIcon(template: AiPromptTemplate): typeof Sparkles {
  if (template.id === 'optimize') return GitMerge
  if (template.id === 'complete' || template.id === 'approval' || template.id === 'sop') return ListPlus
  if (template.id === 'review') return MessageSquareText
  if (template.id === 'diagnose' || template.id === 'transform') return RefreshCw
  return WandSparkles
}

function readableError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return '已停止本次 AI 请求。'
  if (error instanceof AiApiError || error instanceof Error) return error.message
  return 'AI 请求失败，请稍后重试。'
}

export function VisualAiAssistant({ document, onApplyXml, onApplyMermaid, onOpenSettings }: VisualAiAssistantProps) {
  const promptTemplates = usePromptTemplateStore((state) => state.templates)
  const preferences = useWorkspaceStore((state) => state.preferences)
  const updatePreferences = useWorkspaceStore((state) => state.updatePreferences)
  const threads = useAiConversationStore((state) => state.threads)
  const activeThreadByProject = useAiConversationStore((state) => state.activeThreadByProject)
  const ensureThread = useAiConversationStore((state) => state.ensureThread)
  const createThread = useAiConversationStore((state) => state.createThread)
  const setActiveThread = useAiConversationStore((state) => state.setActiveThread)
  const appendMessage = useAiConversationStore((state) => state.appendMessage)
  const deleteThread = useAiConversationStore((state) => state.deleteThread)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState<AiAttachment[]>([])
  const activeThreadId = activeThreadByProject[document.projectId]
  const taskKey = aiTaskKey('drawio', document.id, activeThreadId ?? 'default')
  const task = useAiTaskStore((state) => state.tasks[taskKey])
  const running = task?.running ?? false
  const streamText = task?.streamText ?? ''
  const workflowStage = task?.workflowStage ?? null
  const candidate = (task?.candidate as VisualCandidate | null | undefined) ?? null
  const candidateStale = task?.candidateStale ?? false
  const requestError = task?.requestError ?? null
  const applied = task?.applied ?? false
  const projectThreads = threads.filter((thread) => thread.projectId === document.projectId)
  const activeThread = projectThreads.find((thread) => thread.id === activeThreadId)

  useEffect(() => {
    ensureThread(document.projectId)
  }, [document.projectId, ensureThread])

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
    }
  }, [])

  useEffect(() => {
    setPrompt('')
    setAttachments([])
  }, [document.id])

  useEffect(() => {
    const textarea = promptRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(180, Math.max(76, textarea.scrollHeight))}px`
  }, [prompt])

  const selectedModel = parseAiModelKey(preferences.aiSelectedModel)
  const selectedModelPreference = selectedModel
    ? preferences.aiEnabledModels.find((item) => aiModelKey(item) === preferences.aiSelectedModel)
    : undefined
  const supportsVision = modelSupportsVision(selectedModel, selectedModelPreference)
  const hasUnsupportedImage = attachments.some((item) => item.kind === 'image') && !supportsVision
  const selectedProvider = selectedModel
    ? status?.providers.find((provider) => provider.id === selectedModel.provider)
    : undefined
  const canSubmit = Boolean(
    selectedModel
    && selectedProvider?.configured
    && !running
    && Boolean(prompt.trim())
    && !hasUnsupportedImage,
  )

  const run = async (
    phase: 'discuss' | 'generate' = 'generate',
    options?: {
      prompt?: string
      appendUser?: boolean
      action?: 'auto' | 'fix'
      requestCode?: string
      compileBaseXml?: string
    },
  ) => {
    const requestedPrompt = options?.prompt ?? prompt.trim()
    const requestReady = Boolean(selectedModel && selectedProvider?.configured && !running && requestedPrompt.trim() && !hasUnsupportedImage)
    if (!selectedModel || !requestReady) return
    const threadId = activeThread?.id ?? createThread(document.projectId)
    const userPrompt = requestedPrompt.trim()
    const conversation = buildAiConversationContext(activeThread?.messages ?? [])
    const submittedAttachments = attachments
    if (options?.appendUser !== false) {
      appendMessage(threadId, 'user', userPrompt, await buildConversationAttachments(submittedAttachments))
      setPrompt('')
      setAttachments([])
    }
    const preserveCandidate = phase === 'discuss' && Boolean(candidate)
    const controller = beginAiTask(taskKey, 'drawio', document.id, preserveCandidate)

    const documentXml = document.drawioXml && document.drawioXml !== EMPTY_DRAWIO_XML ? document.drawioXml : ''
    const canBuildOnCandidate = phase === 'generate'
      && candidate
      && !candidate.validationError
      && candidate.baseXml === documentXml
    const currentXml = canBuildOnCandidate
      ? candidate.response.code
      : documentXml
    const requestCode = options?.requestCode ?? currentXml
    const compileBaseXml = options?.compileBaseXml ?? currentXml
    try {
      let qualityReceipt: DiagramQualityReceipt | null = null
      const payload = {
        action: options?.action ?? 'auto',
        prompt: userPrompt,
        code: requestCode,
        diagramKind: document.kind,
        diagramEngine: 'drawio',
        provider: selectedModel.provider,
        model: selectedModel.model,
        phase,
        conversation,
        attachments: submittedAttachments,
      } as const
      const result = await runAiDiagramWorkflow({
        payload,
        request: (requestPayload, onDelta, signal) => requestAiChangeStream(requestPayload, onDelta ?? (() => undefined), signal),
        prepare: (code) => compileAiDrawioCode(code, compileBaseXml),
        validate: async (code) => {
          const error = validateDrawioXml(code)
          if (error) throw new Error(error)
          qualityReceipt = await assessDrawioDiagram(code, 'professional')
          if (!qualityReceipt.ok) throw new Error(qualityFailureMessage(qualityReceipt))
        },
        onDelta: (delta) => {
          appendAiTaskDelta(taskKey, delta)
        },
        onStage: (stage) => {
          setAiTaskStage(taskKey, stage)
        },
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      appendMessage(threadId, 'assistant', result.response.summary)
      if (result.response.action === 'explain') {
        if (!preserveCandidate) patchAiTask(taskKey, { candidate: null, candidateStale: false })
        return
      }
      patchAiTask(taskKey, {
        candidate: {
          response: result.response,
          mode: 'xml',
          validationError: result.validationError,
          repairAttempts: result.repairAttempts,
          documentId: document.id,
           baseXml: documentXml,
           qualityReceipt,
         } satisfies VisualCandidate,
        candidateStale: false,
      })
    } catch (error) {
      if (controller.signal.aborted) {
        if (controller.signal.reason === 'user') patchAiTask(taskKey, { requestError: '已停止本次 AI 请求。' })
      } else {
        patchAiTask(taskKey, { requestError: readableError(error) })
      }
    } finally {
      finishAiTask(taskKey, controller)
    }
  }

  const currentDocumentXml = document.drawioXml && document.drawioXml !== EMPTY_DRAWIO_XML ? document.drawioXml : ''
  const candidateConflict = Boolean(candidate && candidate.baseXml !== currentDocumentXml && !applied)
  const canApply = candidate
    && candidate.response.action !== 'explain'
    && !candidate.validationError
    && candidate.qualityReceipt?.ok === true
    && !candidateStale
    && !candidateConflict
    && candidate.documentId === document.id
    && !applied
  const hasAssistantReply = Boolean(activeThread?.messages.some((message) => message.role === 'assistant'))
  const canGenerateFromConversation = Boolean(
    selectedModel
    && selectedProvider?.configured
    && !running
    && hasAssistantReply
    && !prompt.trim()
    && !attachments.length,
  )
  const hasCurrentDiagram = Boolean(currentDocumentXml)
  const contextDescription = hasCurrentDiagram
    ? `已识别当前可视化画布 · ${currentDocumentXml.length} 字`
    : '当前画布还没有有效内容，AI 会根据你的描述创建新图。'
  const runningTitle = workflowStage === 'repairing'
    ? '初次结果未通过，正在自动修复'
    : workflowStage === 'validating'
      ? '正在本地编译并检查画布'
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

      <AiConversationPanel
        projectThreads={projectThreads}
        activeThread={activeThread}
        subtitle="与 Mermaid 原图共享"
        emptyMessage="说明目标，AI 会先讨论画布结构和修改边界；确认方向后再生成候选。"
        templates={promptTemplates}
        running={running}
        activityKey={`${activeThread?.messages.length ?? 0}:${running}:${streamText.length}:${candidate?.response.code.length ?? 0}:${requestError ?? ''}`}
        iconForTemplate={templateIcon}
        onSelectThread={(threadId) => setActiveThread(document.projectId, threadId)}
        onCreateThread={() => createThread(document.projectId)}
        onDeleteThread={() => { if (activeThread && window.confirm('删除当前对话记录？')) deleteThread(document.projectId, activeThread.id) }}
        onSelectTemplate={(item) => { setPrompt((current) => appendAiPrompt(current, item.prompt)); patchAiTask(taskKey, { requestError: null }); window.requestAnimationFrame(() => promptRef.current?.focus()) }}
      >
        {running && <div className={`ai-running-card ${streamText ? 'streaming' : ''}`} aria-live="polite"><header><LoaderCircle size={18} className="spin" /><span><strong>{runningTitle}</strong><small>{workflowStage === 'repairing' ? '系统已把候选内容和具体错误交给 AI，无需手工检查。' : streamText ? '完成后会先校验，不会立即覆盖。' : '正在等待模型返回首段内容。'}</small></span></header>{streamText && <pre>{visualAiStreamPreview(streamText)}<i aria-hidden="true" /></pre>}</div>}
        {!running && requestError && streamText && <div className="ai-running-card interrupted"><header><AlertCircle size={18} /><span><strong>已保留中断前的输出</strong><small>你仍可查看模型已经返回的文字，重新发送后会从新请求继续。</small></span></header><pre>{visualAiStreamPreview(streamText)}</pre></div>}
        {requestError && <div className="ai-error-card"><AlertCircle size={16} /><span><strong>本次请求没有完成</strong><small>{requestError}</small></span></div>}
        {candidate && <section className={`ai-result-card ${candidate.validationError ? 'invalid' : ''} ${candidateStale || candidateConflict ? 'stale' : ''}`}><header><span className="ai-result-status">{candidate.validationError || candidateStale || candidateConflict ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}<strong>{candidateStale ? '已有新意见，候选需要更新' : candidateConflict ? '当前画布已变化，需要重新生成' : candidate.response.action === 'explain' ? '分析完成' : candidate.validationError ? '自动修复仍未通过' : candidate.repairAttempts ? '已自动修复并通过检查' : '候选已通过专业检查'}</strong></span><small>{selectedProvider?.label || providerLabels[candidate.response.provider]} · {candidate.response.model}</small></header><p className="ai-result-summary">{candidate.response.summary}</p><QualityReceiptSummary receipt={candidate.qualityReceipt} />{candidate.response.changes.length > 0 && <ul className="ai-change-list">{candidate.response.changes.map((change, index) => <li key={`${change}-${index}`}><Check size={12} />{change}</li>)}</ul>}{candidate.validationError && <p className="ai-validation-error">{candidate.validationError}</p>}</section>}
      </AiConversationPanel>

      {!running && (candidate || hasAssistantReply) && (
        <section className={`ai-action-dock ${candidate && !candidate.validationError && !candidateStale && !candidateConflict ? 'ready' : ''}`} aria-label="AI 下一步操作">
          <div>{applied ? <CheckCircle2 size={17} /> : candidateStale || candidateConflict || candidate?.validationError ? <AlertCircle size={17} /> : <ShieldCheck size={17} />}<span><strong>{applied ? '候选已应用到可视化画布' : candidateStale ? '先按新意见更新候选' : candidateConflict ? '画布已在候选生成后发生变化' : candidate?.validationError ? '候选仍需修复' : candidate ? '候选已校验，可以安全应用' : '已有对话共识，可以生成候选'}</strong><small>{applied ? '应用前版本已自动保存，可从版本页回退。' : candidate ? '当前画布不会被直接覆盖。' : prompt.trim() ? '先发送输入框里的补充内容。' : '也可以继续输入，进一步补充细节。'}</small></span></div>
          <span className="ai-action-buttons">
            {!applied && candidate ? <><button type="button" onClick={() => patchAiTask(taskKey, { candidate: null, candidateStale: false })}>放弃候选</button>{candidate.validationError ? <button type="button" className="primary" disabled={!canGenerateFromConversation} onClick={() => void run('generate', { prompt: '修复当前候选中的结构错误，保持已经确认的业务流程不变。', appendUser: false, action: 'fix', requestCode: candidate.response.code, compileBaseXml: candidate.baseXml })}><RefreshCw size={14} />修复候选</button> : candidateStale || candidateConflict ? <button type="button" className="primary" disabled={!canGenerateFromConversation} onClick={() => void run('generate', { prompt: '请根据以上已确认的对话和最新要求更新可视化画布候选。', appendUser: false })}><RefreshCw size={14} />更新候选</button> : candidate.response.action !== 'explain' && <button type="button" className="primary" disabled={!canApply} onClick={() => { if (candidate.mode === 'mermaid') onApplyMermaid(candidate.response.code); else onApplyXml(candidate.response.code); patchAiTask(taskKey, { applied: true }) }}><Check size={14} />应用到画布</button>}</> : !candidate && <button type="button" className="primary" disabled={!canGenerateFromConversation} onClick={() => void run('generate', { prompt: '请根据以上已经确认的项目对话生成可视化画布候选。', appendUser: false })}><Send size={14} />生成候选</button>}
          </span>
        </section>
      )}

      <section className="ai-prompt-card">
        <div className={`ai-context-strip ${hasCurrentDiagram ? 'ready' : 'empty'}`} title={hasCurrentDiagram ? 'AI 会携带当前可视化画布和本项目对话上下文' : undefined}><ShieldCheck size={13} /><span>{contextDescription}</span></div>
        <label className="sr-only" htmlFor="visual-ai-prompt">描述要完成的工作</label>
        <textarea ref={promptRef} id="visual-ai-prompt" rows={3} maxLength={4000} value={prompt} onChange={(event) => setPrompt(event.target.value)} onPaste={(event) => { const files = imageFilesFromClipboard(event.clipboardData); if (!files.length) return; event.preventDefault(); void appendAiAttachmentFiles(attachments, files).then((merged) => { setAttachments(merged); patchAiTask(taskKey, { requestError: null }) }).catch((error) => patchAiTask(taskKey, { requestError: readableError(error) })) }} placeholder="继续描述需求、回答 AI 问题，或直接粘贴截图…" disabled={running || !selectedModel} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void run('discuss') } }} />
        <AiAttachmentPicker attachments={attachments} supportsVision={supportsVision} disabled={running || !selectedModel} onChange={setAttachments} onError={(error) => patchAiTask(taskKey, { requestError: error })} />
        <footer className="ai-composer-footer">
          <span className="ai-composer-tools"><AiTemplateMenu templates={promptTemplates} disabled={running} iconForTemplate={templateIcon} onSelectTemplate={(item) => { setPrompt((current) => appendAiPrompt(current, item.prompt)); patchAiTask(taskKey, { requestError: null }); window.requestAnimationFrame(() => promptRef.current?.focus()) }} /><span className="ai-model-select"><select value={preferences.aiSelectedModel} onChange={(event) => updatePreferences({ aiSelectedModel: event.target.value })} disabled={!preferences.aiEnabledModels.length || running} aria-label="画布 AI 模型"><option value="" disabled>请选择模型</option>{preferences.aiEnabledModels.map((item) => <option value={aiModelKey(item)} key={aiModelKey(item)}>{status?.providers.find((provider) => provider.id === item.provider)?.label || providerLabels[item.provider]} · {item.model}</option>)}</select></span></span>
          <span className="ai-composer-submit"><small>{prompt.length}/4000 · Ctrl+Enter</small>{running ? <button type="button" className="ai-stop-button" onClick={() => stopAiTask(taskKey)}><X size={14} />停止</button> : <button type="button" className="ai-send-button" onClick={() => void run('discuss')} disabled={!canSubmit}><Send size={15} /><span>发送</span></button>}</span>
        </footer>
      </section>
    </div>
  )
}

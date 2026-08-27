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
  type AiProviderId,
  type AiResponse,
  type AiStatus,
} from '@/lib/ai-contract'
import { AiApiError, getAiStatus, requestAiChangeStream } from '@/lib/ai-client'
import type { AiAttachment } from '@/lib/ai-contract'
import { DEFAULT_AI_DIAGRAM_ACTION, runAiDiagramWorkflow } from '@/lib/ai-diagram-workflow'
import { appendAiPrompt, type AiPromptTemplate } from '@/lib/ai-prompt-templates'
import { renderDiagram } from '@/lib/diagram-engine'
import { usePromptTemplateStore } from '@/store/prompt-template-store'
import { buildAiConversationContext, useAiConversationStore } from '@/store/ai-conversation-store'
import { useWorkspaceStore } from '@/store/workspace-store'
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
import type { RenderError } from '@/types'
import { AiAttachmentPicker } from '@/components/AiAttachmentPicker'
import { appendAiAttachmentFiles, buildConversationAttachments, imageFilesFromClipboard } from '@/lib/ai-attachments'
import { modelSupportsVision } from '@/lib/provider-settings'
import { AiConversationPanel, AiTemplateMenu } from '@/components/AiConversationPanel'

interface AiAssistantProps {
  renderError: RenderError | null
  onOpenSettings: () => void
  onPreviewCandidate?: (code: string | null) => void
}

interface AiCandidate {
  response: AiResponse
  sourceCode: string
  added: number
  removed: number
  validationError: string | null
  documentId: string
  baseCode: string
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

export function AiAssistant({ renderError, onOpenSettings, onPreviewCandidate }: AiAssistantProps) {
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
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState<AiAttachment[]>([])
  const projectId = active?.projectId ?? ''
  const taskKey = aiTaskKey('mermaid', activeId ?? 'none')
  const task = useAiTaskStore((state) => state.tasks[taskKey])
  const running = task?.running ?? false
  const candidate = (task?.candidate as AiCandidate | null | undefined) ?? null
  const candidateStale = task?.candidateStale ?? false
  const requestError = task?.requestError ?? null
  const appliedBefore = task?.appliedBefore ?? null
  const streamText = task?.streamText ?? ''
  const workflowStage = task?.workflowStage ?? null
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
    }
  }, [])

  useEffect(() => {
    setPrompt('')
    onPreviewCandidate?.(null)
    setAttachments([])
  }, [activeId, onPreviewCandidate])

  useEffect(() => () => onPreviewCandidate?.(null), [onPreviewCandidate])

  useEffect(() => {
    if (running || !candidate || candidate.documentId !== activeId || candidate.validationError || candidateStale) {
      onPreviewCandidate?.(null)
      return
    }
    onPreviewCandidate?.(candidate.response.code)
  }, [activeId, candidate, candidateStale, onPreviewCandidate, running])

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
    baseCode: string,
    documentId: string,
    threadId?: string,
    preserveCandidate = false,
  ) => {
    if (!active || !selectedModel) return
    const controller = beginAiTask(taskKey, 'mermaid', documentId, preserveCandidate)
    onPreviewCandidate?.(null)
    try {
      const result = await runAiDiagramWorkflow({
        payload,
        request: (requestPayload, onDelta, signal) => requestAiChangeStream(requestPayload, onDelta ?? (() => undefined), signal),
        validate: (code) => renderDiagram(code, getDiagramTheme(active.themeId)),
        onDelta: (delta) => {
          appendAiTaskDelta(taskKey, delta)
        },
        onStage: (stage) => {
          setAiTaskStage(taskKey, stage)
        },
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      const response = result.response
      if (threadId) appendMessage(threadId, 'assistant', response.summary)
      if (response.action === 'explain') {
        if (!preserveCandidate) patchAiTask(taskKey, { candidate: null, candidateStale: false })
        return
      }
      const stats = getAiLineStats(baseCode, response.code)
      patchAiTask(taskKey, {
        candidate: {
          response,
          sourceCode,
          baseCode,
          documentId,
          added: stats.added,
          removed: stats.removed,
          validationError: result.validationError,
          repairAttempts: result.repairAttempts,
        } satisfies AiCandidate,
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

  const run = async (
    phase: 'discuss' | 'generate',
    options?: { prompt?: string; appendUser?: boolean },
  ) => {
    const requestedPrompt = options?.prompt ?? prompt.trim()
    const requestReady = Boolean(
      active
      && selectedModel
      && selectedProviderStatus?.configured
      && !running
      && requestedPrompt.trim()
      && !hasUnsupportedImage,
    )
    if (!active || !requestReady || !selectedModel) return
    const threadId = activeThread?.id ?? createThread(active.projectId)
    const userPrompt = requestedPrompt.trim()
    const conversation = buildAiConversationContext(activeThread?.messages ?? [])
    const submittedAttachments = attachments
    if (options?.appendUser !== false) {
      appendMessage(threadId, 'user', userPrompt, await buildConversationAttachments(submittedAttachments))
      setPrompt('')
      setAttachments([])
    }
    const canBuildOnCandidate = phase === 'generate'
      && candidate
      && !candidate.validationError
      && candidate.baseCode === active.code
    const sourceCode = canBuildOnCandidate
      ? candidate.response.code
      : active.code
    if (phase === 'discuss' && candidate) {
      patchAiTask(taskKey, { candidateStale: true })
      onPreviewCandidate?.(null)
    }
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
      attachments: submittedAttachments,
    }, sourceCode, active.code, active.id, threadId, phase === 'discuss' && Boolean(candidate))
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
    }, candidate.sourceCode, candidate.baseCode, candidate.documentId)
  }

  if (!active) return null
  const isExplanation = candidate?.response.action === 'explain'
  const candidateConflict = Boolean(candidate && candidate.baseCode !== active.code && appliedBefore === null)
  const canApply = candidate
    && !isExplanation
    && !candidate.validationError
    && !candidateStale
    && !candidateConflict
    && candidate.documentId === active.id
    && candidate.response.code !== active.code
  const hasAssistantReply = Boolean(activeThread?.messages.some((message) => message.role === 'assistant'))
  const canGenerateFromConversation = Boolean(
    selectedModel
    && selectedProviderStatus?.configured
    && !running
    && hasAssistantReply
    && !prompt.trim()
    && !attachments.length,
  )
  const hasCurrentDiagram = Boolean(active.code.trim())
  const contextDescription = hasCurrentDiagram
    ? `已识别当前 Mermaid 源码 · ${active.code.length} 字${renderError ? ' · 含待修复错误' : ''}`
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

      <AiConversationPanel
        projectThreads={projectThreads}
        activeThread={activeThread}
        subtitle="Mermaid 与可视化画布共享"
        emptyMessage="说明目标，AI 会先结合当前图讨论和归纳；确认方向后再生成候选。"
        templates={promptTemplates}
        running={running}
        activityKey={`${activeThread?.messages.length ?? 0}:${running}:${streamText.length}:${candidate?.response.code.length ?? 0}:${requestError ?? ''}`}
        iconForTemplate={templateIcon}
        onSelectThread={(threadId) => setActiveThread(projectId, threadId)}
        onCreateThread={() => createThread(projectId)}
        onDeleteThread={() => { if (activeThread && window.confirm('删除当前对话记录？')) deleteThread(projectId, activeThread.id) }}
        onSelectTemplate={(item) => {
          setPrompt((current) => appendAiPrompt(current, item.prompt))
          patchAiTask(taskKey, { requestError: null })
          window.requestAnimationFrame(() => promptRef.current?.focus())
        }}
      >
        {running && (
          <div className={`ai-running-card ${streamText ? 'streaming' : ''}`} aria-live="polite">
            <header><LoaderCircle size={18} className="spin" /><span><strong>{runningTitle}</strong><small>{workflowStage === 'repairing' ? '系统已把候选源码和具体错误交给 AI，无需手工检查。' : streamText ? '内容会边生成边显示，完成后自动检查图表。' : '已发送请求，正在等待模型返回首段内容。'}</small></span></header>
            {streamText && <pre>{streamingPreview(streamText)}<i aria-hidden="true" /></pre>}
          </div>
        )}

        {!running && requestError && streamText && (
          <div className="ai-running-card interrupted">
            <header><AlertCircle size={18} /><span><strong>已保留中断前的输出</strong><small>你仍可查看模型已经返回的文字，重新发送后会从新请求继续。</small></span></header>
            <pre>{streamingPreview(streamText)}</pre>
          </div>
        )}

        {requestError && <div className="ai-error-card"><AlertCircle size={16} /><span><strong>本次请求没有完成</strong><small>{requestError}</small></span></div>}

        {candidate && (
          <section className={`ai-result-card ${candidate.validationError ? 'invalid' : ''} ${candidateStale || candidateConflict ? 'stale' : ''}`}>
            <header>
              <span className="ai-result-status">
                {candidate.validationError || candidateStale || candidateConflict ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                <strong>{candidateStale ? '已有新意见，候选需要更新' : candidateConflict ? '当前图已变化，需要重新生成' : isExplanation ? '分析完成' : candidate.validationError ? '自动修复仍未通过' : candidate.repairAttempts ? '已自动修复并通过检查' : '候选已通过渲染检查'}</strong>
              </span>
              <small>{candidate.response.provider === selectedModel?.provider ? selectedProviderLabel : providerLabels[candidate.response.provider]} · {candidate.response.model}</small>
            </header>
            <p className="ai-result-summary">{candidate.response.summary}</p>
            {!isExplanation && (
              <>
                <div className="ai-diff-stats"><span className="added">+{candidate.added} 行</span><span className="removed">−{candidate.removed} 行</span><span>尚未写入源码</span></div>
                {candidate.response.changes.length > 0 && <ul className="ai-change-list">{candidate.response.changes.map((change, index) => <li key={`${change}-${index}`}><Check size={12} />{change}</li>)}</ul>}
                {candidate.validationError && <p className="ai-validation-error">{candidate.validationError}</p>}
                <details className="ai-code-preview" open={Boolean(candidate.validationError)}><summary><FileCode2 size={14} />查看生成的 Mermaid 源码</summary><pre>{candidate.response.code}</pre></details>
              </>
            )}
          </section>
        )}
      </AiConversationPanel>

      {!running && (candidate || hasAssistantReply) && (
        <section className={`ai-action-dock ${candidate && !candidate.validationError && !candidateStale && !candidateConflict ? 'ready' : ''}`} aria-label="AI 下一步操作">
          <div>
            {appliedBefore !== null ? <CheckCircle2 size={17} /> : candidateStale || candidateConflict || candidate?.validationError ? <AlertCircle size={17} /> : <ShieldCheck size={17} />}
            <span>
              <strong>{appliedBefore !== null ? '候选已应用到当前图' : candidateStale ? '先按新意见更新候选' : candidateConflict ? '画布已在候选生成后发生变化' : candidate?.validationError ? '候选仍需修复' : candidate ? '候选已校验，可以安全应用' : '已有对话共识，可以生成候选'}</strong>
              <small>{appliedBefore !== null ? '应用前版本已自动保存，可立即撤销。' : candidate ? '当前图不会被直接覆盖。' : prompt.trim() ? '先发送输入框里的补充内容。' : '也可以继续输入，进一步补充细节。'}</small>
            </span>
          </div>
          <span className="ai-action-buttons">
            {appliedBefore !== null ? (
              <button type="button" onClick={() => { updateCode(appliedBefore); patchAiTask(taskKey, { appliedBefore: null }) }}><RotateCcw size={14} />撤销本次</button>
            ) : candidate ? (
              <>
                <button type="button" onClick={() => { patchAiTask(taskKey, { candidate: null, candidateStale: false }); onPreviewCandidate?.(null) }}>放弃候选</button>
                {candidate.validationError ? (
                  <button type="button" className="primary" onClick={() => void retryCandidateRepair()}><RefreshCw size={14} />再次修复</button>
                ) : candidateStale || candidateConflict ? (
                  <button type="button" className="primary" disabled={!canGenerateFromConversation} onClick={() => void run('generate', { prompt: '请根据以上已确认的对话和最新要求重新生成候选图表。', appendUser: false })}><RefreshCw size={14} />重新生成</button>
                ) : (
                  <>
                    {onPreviewCandidate && <button type="button" onClick={() => onPreviewCandidate(candidate.response.code)}>查看候选</button>}
                    <button type="button" className="primary" disabled={!canApply} onClick={() => { createVersion('AI 修改前'); patchAiTask(taskKey, { appliedBefore: active.code }); updateCode(candidate.response.code); onPreviewCandidate?.(null) }}><Check size={14} />应用到画布</button>
                  </>
                )}
              </>
            ) : (
              <button type="button" className="primary" disabled={!canGenerateFromConversation} onClick={() => void run('generate', { prompt: '请根据以上已经确认的项目对话生成候选图表。', appendUser: false })}><Send size={14} />生成候选</button>
            )}
          </span>
        </section>
      )}

      <section className="ai-prompt-card">
        <div className={`ai-context-strip ${hasCurrentDiagram ? 'ready' : 'empty'}`} title={hasCurrentDiagram ? 'AI 会携带当前 Mermaid 源码和本项目对话上下文' : undefined}><ShieldCheck size={13} /><span>{contextDescription}</span></div>
        <label className="sr-only" htmlFor="ai-diagram-prompt">描述要完成的工作</label>
        <textarea
          ref={promptRef}
          id="ai-diagram-prompt"
          rows={3}
          maxLength={4000}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onPaste={(event) => { const files = imageFilesFromClipboard(event.clipboardData); if (!files.length) return; event.preventDefault(); void appendAiAttachmentFiles(attachments, files).then((merged) => { setAttachments(merged); patchAiTask(taskKey, { requestError: null }) }).catch((error) => patchAiTask(taskKey, { requestError: readableError(error) })) }}
          placeholder="继续描述需求、回答 AI 问题，或直接粘贴截图…"
          disabled={running || !selectedModel}
          onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void run('discuss') } }}
        />
        <AiAttachmentPicker attachments={attachments} supportsVision={supportsVision} disabled={running || !selectedModel} onChange={setAttachments} onError={(error) => patchAiTask(taskKey, { requestError: error })} />
        <footer className="ai-composer-footer">
          <span className="ai-composer-tools">
            <AiTemplateMenu templates={promptTemplates} disabled={running} iconForTemplate={templateIcon} onSelectTemplate={(item) => { setPrompt((current) => appendAiPrompt(current, item.prompt)); patchAiTask(taskKey, { requestError: null }); window.requestAnimationFrame(() => promptRef.current?.focus()) }} />
            <span className="ai-model-select">
              <select value={preferences.aiSelectedModel} onChange={(event) => updatePreferences({ aiSelectedModel: event.target.value })} disabled={!preferences.aiEnabledModels.length || running} aria-label="本次使用的 AI 模型">
                {!preferences.aiEnabledModels.length && <option value="">请先启用模型</option>}
                {preferences.aiEnabledModels.map((item) => <option value={aiModelKey(item)} key={aiModelKey(item)}>{status?.providers.find((provider) => provider.id === item.provider)?.label || providerLabels[item.provider]} · {item.model}</option>)}
              </select>
            </span>
          </span>
          <span className="ai-composer-submit">
            <small>{prompt.length}/4000 · Ctrl+Enter</small>
            {running ? <button type="button" className="ai-stop-button" onClick={() => stopAiTask(taskKey)}><X size={14} />停止</button> : <button type="button" className="ai-send-button" onClick={() => void run('discuss')} disabled={!canSubmit}><Send size={15} /><span>发送</span></button>}
          </span>
        </footer>
      </section>
    </div>
  )
}

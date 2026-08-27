import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, MessageSquarePlus, MessageSquareText, Sparkles, Trash2, WandSparkles } from 'lucide-react'
import type { AiPromptTemplate } from '@/lib/ai-prompt-templates'
import type { AiConversationThread } from '@/store/ai-conversation-store'

interface AiConversationPanelProps {
  projectThreads: AiConversationThread[]
  activeThread?: AiConversationThread
  subtitle: string
  emptyMessage: string
  templates: AiPromptTemplate[]
  running: boolean
  activityKey: string
  iconForTemplate: (template: AiPromptTemplate) => typeof Sparkles
  onSelectThread: (threadId: string) => void
  onCreateThread: () => void
  onDeleteThread: () => void
  onSelectTemplate: (template: AiPromptTemplate) => void
  children?: ReactNode
}

export function AiConversationPanel({
  projectThreads,
  activeThread,
  subtitle,
  emptyMessage,
  templates,
  running,
  activityKey,
  iconForTemplate,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
  onSelectTemplate,
  children,
}: AiConversationPanelProps) {
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const pinnedToLatestRef = useRef(true)
  const previousThreadIdRef = useRef<string | undefined>(undefined)
  const previousMessageCountRef = useRef(0)
  const [showLatest, setShowLatest] = useState(false)
  const messages = activeThread?.messages ?? []

  useEffect(() => {
    const switchedThread = previousThreadIdRef.current !== activeThread?.id
    const restoredHistory = messages.length - previousMessageCountRef.current > 1
    if (switchedThread) pinnedToLatestRef.current = true
    previousThreadIdRef.current = activeThread?.id
    previousMessageCountRef.current = messages.length
    const frame = window.requestAnimationFrame(() => {
      if (pinnedToLatestRef.current) {
        endRef.current?.scrollIntoView({ block: 'end', behavior: switchedThread || restoredHistory ? 'auto' : 'smooth' })
        setShowLatest(false)
      } else {
        setShowLatest(true)
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeThread?.id, activityKey, messages.length])

  const jumpToLatest = () => {
    pinnedToLatestRef.current = true
    setShowLatest(false)
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }

  return (
    <section className="ai-conversation-card" aria-label="项目 AI 对话">
      <header>
        <span className="ai-conversation-title">
          <MessageSquareText size={16} />
          <span><strong>{activeThread?.title || '项目对话'}</strong><small>{subtitle}</small></span>
        </span>
        <div className="ai-conversation-controls">
          <select value={activeThread?.id ?? ''} onChange={(event) => onSelectThread(event.target.value)} aria-label="选择历史对话">
            {projectThreads.map((thread) => <option key={thread.id} value={thread.id}>{thread.title}</option>)}
          </select>
          <button type="button" onClick={onCreateThread} title="开始新对话"><MessageSquarePlus size={15} /><span>新对话</span></button>
          {activeThread && <button type="button" className="ai-delete-chat" onClick={onDeleteThread} title="删除当前对话" aria-label="删除当前对话"><Trash2 size={15} /></button>}
        </div>
      </header>

      <div
        ref={timelineRef}
        className="ai-message-list"
        onScroll={() => {
          const timeline = timelineRef.current
          if (!timeline) return
          const nearLatest = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 72
          pinnedToLatestRef.current = nearLatest
          if (nearLatest) setShowLatest(false)
        }}
      >
        {!messages.length && (
          <div className="ai-conversation-empty">
            <span className="ai-empty-icon"><Sparkles size={18} /></span>
            <strong>从当前图开始讨论</strong>
            <p>{emptyMessage}</p>
            <div className="ai-empty-template-grid" aria-label="专业任务模板">
              {templates.map((template) => {
                const Icon = iconForTemplate(template)
                return (
                  <button key={template.id} type="button" disabled={running} onClick={() => onSelectTemplate(template)}>
                    <Icon size={15} /><span><strong>{template.label}</strong><small>{template.hint}</small></span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <article key={message.id} className={message.role}>
            <strong>{message.role === 'user' ? '你' : 'AI'}</strong>
            <div className="ai-message-content">
              <p>{message.content}</p>
              {message.attachments?.length ? (
                <div className="ai-message-attachments" aria-label="本条消息的附件">
                  {message.attachments.map((attachment, index) => (
                    <span key={`${attachment.name}-${index}`} title={attachment.name}>
                      {attachment.kind === 'image' && attachment.preview
                        ? <img src={attachment.preview} alt={attachment.name} />
                        : <i aria-hidden="true">{attachment.kind === 'image' ? '图' : '文'}</i>}
                      <b>{attachment.name}</b>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        ))}

        {children}
        <div ref={endRef} className="ai-timeline-end" aria-hidden="true" />
      </div>

      {showLatest && <button type="button" className="ai-jump-latest" onClick={jumpToLatest}><ArrowDown size={14} />回到最新</button>}
    </section>
  )
}

interface AiTemplateMenuProps {
  templates: AiPromptTemplate[]
  disabled: boolean
  iconForTemplate: (template: AiPromptTemplate) => typeof Sparkles
  onSelectTemplate: (template: AiPromptTemplate) => void
}

export function AiTemplateMenu({ templates, disabled, iconForTemplate, onSelectTemplate }: AiTemplateMenuProps) {
  return (
    <details className="ai-template-menu">
      <summary><WandSparkles size={14} />快捷任务</summary>
      <div>
        {templates.map((template) => {
          const Icon = iconForTemplate(template)
          return <button key={template.id} type="button" disabled={disabled} onClick={(event) => { onSelectTemplate(template); event.currentTarget.closest('details')?.removeAttribute('open') }}><Icon size={14} /><span><strong>{template.label}</strong><small>{template.hint}</small></span></button>
        })}
      </div>
    </details>
  )
}

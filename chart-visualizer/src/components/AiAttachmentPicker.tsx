import { FileText, Image, Paperclip, X } from 'lucide-react'
import { useRef } from 'react'
import { AI_ATTACHMENT_ACCEPT, readAiAttachments } from '@/lib/ai-attachments'
import type { AiAttachment } from '@/lib/ai-contract'

interface AiAttachmentPickerProps {
  attachments: AiAttachment[]
  disabled?: boolean
  supportsVision: boolean
  onChange: (attachments: AiAttachment[]) => void
  onError: (message: string) => void
}

export function AiAttachmentPicker({ attachments, disabled, supportsVision, onChange, onError }: AiAttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const hasUnsupportedImage = attachments.some((item) => item.kind === 'image') && !supportsVision

  return (
    <div className="ai-attachment-picker">
      <input
        ref={inputRef}
        hidden
        type="file"
        multiple
        accept={AI_ATTACHMENT_ACCEPT}
        onChange={(event) => {
          const files = event.target.files
          if (!files?.length) return
          void readAiAttachments(files)
            .then((next) => {
              const merged = [...attachments, ...next]
              if (merged.length > 6) throw new Error('每次最多添加 6 个附件。')
              onChange(merged)
              onError('')
            })
            .catch((error) => onError(error instanceof Error ? error.message : '附件读取失败。'))
            .finally(() => { event.target.value = '' })
        }}
      />
      <button type="button" className="ai-attach-button" disabled={disabled} onClick={() => inputRef.current?.click()}>
        <Paperclip size={14} />添加图片 / 文件
      </button>
      {attachments.length > 0 && (
        <div className="ai-attachment-list">
          {attachments.map((item, index) => (
            <span key={`${item.name}-${index}`} className={item.kind === 'image' && !supportsVision ? 'unsupported' : ''}>
              {item.kind === 'image' ? <Image size={13} /> : <FileText size={13} />}
              <b title={item.name}>{item.name}</b>
              <button type="button" onClick={() => onChange(attachments.filter((_, itemIndex) => itemIndex !== index))} aria-label={`移除 ${item.name}`}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      {hasUnsupportedImage && <small className="ai-attachment-warning">当前模型未启用图片识别。请移除图片或切换到支持图片的模型。</small>}
    </div>
  )
}

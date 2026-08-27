import { describe, expect, it } from 'vitest'
import { buildConversationAttachments, imageFilesFromClipboard, mergeAiAttachments, readAiAttachments } from '@/lib/ai-attachments'

describe('AI attachments', () => {
  it('reads common text and code files as context', async () => {
    const file = new File(['flowchart LR\nA --> B'], '流程.mmd', { type: 'text/plain' })
    await expect(readAiAttachments([file])).resolves.toEqual([{
      kind: 'text',
      name: '流程.mmd',
      mimeType: 'text/plain',
      content: 'flowchart LR\nA --> B',
    }])
  })

  it('accepts supported images and rejects audio or video', async () => {
    const image = new File(['image'], '流程.png', { type: 'image/png' })
    const [attachment] = await readAiAttachments([image])
    expect(attachment).toMatchObject({ kind: 'image', name: '流程.png', mimeType: 'image/png' })
    expect(attachment.content).toMatch(/^data:image\/png;base64,/)

    const audio = new File(['audio'], '会议.mp3', { type: 'audio/mpeg' })
    await expect(readAiAttachments([audio])).rejects.toThrow('不接收音频或视频')
  })

  it('rejects images whose combined size exceeds the server limit', async () => {
    const chunk = new Uint8Array(3 * 1024 * 1024)
    const first = new File([chunk], '一.png', { type: 'image/png' })
    const second = new File([chunk], '二.png', { type: 'image/png' })

    await expect(readAiAttachments([first, second])).rejects.toThrow('合计超过 5 MB')
  })

  it('extracts a pasted screenshot without treating clipboard text as a file', () => {
    const screenshot = new File(['image'], 'image.png', { type: 'image/png' })
    const clipboard = {
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
        { kind: 'file', type: 'image/png', getAsFile: () => screenshot },
      ],
      files: [] as unknown as FileList,
    } as unknown as DataTransfer

    const files = imageFilesFromClipboard(clipboard, new Date('2026-08-26T10:20:30+08:00'))
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('剪贴板截图-20260826-102030.png')
    expect(files[0].type).toBe('image/png')
  })

  it('enforces total limits when attachments are added in several batches', async () => {
    const content = `data:image/png;base64,${'A'.repeat(4 * 1024 * 1024)}`
    const existing = [{ kind: 'image' as const, name: '已有.png', mimeType: 'image/png', content }]
    const next = [{ kind: 'image' as const, name: '新截图.png', mimeType: 'image/png', content }]
    expect(() => mergeAiAttachments(existing, next)).toThrow('合计超过 5 MB')
  })

  it('keeps a small bounded image preview for the conversation timeline', async () => {
    const preview = 'data:image/png;base64,aGVsbG8='
    await expect(buildConversationAttachments([{
      kind: 'image',
      name: '流程截图.png',
      mimeType: 'image/png',
      content: preview,
    }])).resolves.toEqual([{ kind: 'image', name: '流程截图.png', mimeType: 'image/png', preview }])
  })
})

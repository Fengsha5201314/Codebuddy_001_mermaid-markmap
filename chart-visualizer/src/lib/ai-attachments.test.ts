import { describe, expect, it } from 'vitest'
import { readAiAttachments } from '@/lib/ai-attachments'

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
})

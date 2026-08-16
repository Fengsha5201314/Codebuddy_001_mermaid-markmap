import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0)
    return 1
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

describe('Modal keyboard and focus behaviour', () => {
  it('closes itself on Escape and exposes its description to assistive technology', async () => {
    const onClose = vi.fn()
    await act(async () => root.render(
      <Modal open title="导出" description="选择交付格式" onClose={onClose}>
        <button type="button">下载</button>
      </Modal>,
    ))

    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.body.style.overflow).toBe('hidden')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps Tab focus inside the dialog', async () => {
    await act(async () => root.render(
      <Modal open title="测试" onClose={() => undefined}>
        <button type="button">第一个操作</button>
        <button type="button">最后一个操作</button>
      </Modal>,
    ))
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')]
    const close = buttons[0]
    const last = buttons[buttons.length - 1]
    last.focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(close)

    close.focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    expect(document.activeElement).toBe(last)
  })
})

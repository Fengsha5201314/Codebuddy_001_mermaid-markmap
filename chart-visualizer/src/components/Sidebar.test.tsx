import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from '@/store/workspace-store'
import { Sidebar } from './Sidebar'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('Sidebar project grouping and menus', () => {
  it('把关联可视化画布归入同一项目，并允许点击空白处关闭菜单', async () => {
    useWorkspaceStore.getState().convertActiveToVisual()
    await act(async () => root.render(<Sidebar onNew={() => undefined} />))

    expect(host.querySelectorAll('.document-row')).toHaveLength(1)
    expect(host.textContent).toContain('双画布')
    expect(host.querySelector('.section-label em')?.textContent).toBe('1')

    const more = host.querySelector<HTMLButtonElement>('[aria-label="更多操作"]')!
    await act(async () => more.click())
    expect(host.querySelector('.document-menu')).not.toBeNull()

    await act(async () => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(host.querySelector('.document-menu')).toBeNull()
  })
})

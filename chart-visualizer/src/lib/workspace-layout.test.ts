import { describe, expect, it } from 'vitest'
import { getResponsiveWorkspaceLayout, getWorkspaceGridTemplate } from './workspace-layout'

describe('responsive workspace layout', () => {
  it('keeps the requested split view and docks tools on wide screens', () => {
    expect(getResponsiveWorkspaceLayout(1920, 'split')).toEqual({
      breakpoint: 'wide',
      view: 'split',
      inspectorMode: 'docked',
      sidebarMode: 'full',
    })
  })

  it('uses an overlay inspector on standard desktop screens', () => {
    expect(getResponsiveWorkspaceLayout(1440, 'split')).toMatchObject({
      breakpoint: 'desktop',
      view: 'split',
      inspectorMode: 'overlay',
    })
  })

  it('turns split into canvas view on tablets without losing explicit source view', () => {
    expect(getResponsiveWorkspaceLayout(1024, 'split').view).toBe('canvas')
    expect(getResponsiveWorkspaceLayout(1024, 'source').view).toBe('source')
  })

  it('uses a single-panel rail layout on mobile', () => {
    expect(getResponsiveWorkspaceLayout(390, 'split')).toEqual({
      breakpoint: 'mobile',
      view: 'canvas',
      inspectorMode: 'overlay',
      sidebarMode: 'rail',
    })
  })
})

describe('workspace grid template', () => {
  it('keeps split panes within practical minimum and maximum widths', () => {
    expect(getWorkspaceGridTemplate('split', 38)).toBe(
      'clamp(340px, 38%, 520px) 6px minmax(560px, 1fr)',
    )
    expect(getWorkspaceGridTemplate('split', 99)).toContain('68%')
  })

  it('uses one flexible panel in focused views', () => {
    expect(getWorkspaceGridTemplate('canvas', 38)).toBe('minmax(0, 1fr)')
    expect(getWorkspaceGridTemplate('source', 38)).toBe('minmax(0, 1fr)')
  })
})

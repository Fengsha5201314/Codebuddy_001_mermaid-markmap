import type { WorkspaceView } from '@/types'

export type WorkspaceBreakpoint = 'wide' | 'desktop' | 'tablet' | 'mobile'
export type InspectorMode = 'docked' | 'overlay'
export type SidebarMode = 'full' | 'rail'

export interface ResponsiveWorkspaceLayout {
  breakpoint: WorkspaceBreakpoint
  view: WorkspaceView
  inspectorMode: InspectorMode
  sidebarMode: SidebarMode
}

export const COMPACT_WORKSPACE_MAX = 1199
export const DOCKED_INSPECTOR_MIN = 1600

export function getResponsiveWorkspaceLayout(
  viewportWidth: number,
  requestedView: WorkspaceView,
): ResponsiveWorkspaceLayout {
  const width = Number.isFinite(viewportWidth) ? Math.max(320, viewportWidth) : DOCKED_INSPECTOR_MIN
  const compactView = requestedView === 'split' ? 'canvas' : requestedView

  if (width >= DOCKED_INSPECTOR_MIN) {
    return { breakpoint: 'wide', view: requestedView, inspectorMode: 'docked', sidebarMode: 'full' }
  }
  if (width >= 1200) {
    return { breakpoint: 'desktop', view: requestedView, inspectorMode: 'overlay', sidebarMode: 'full' }
  }
  if (width >= 768) {
    return { breakpoint: 'tablet', view: compactView, inspectorMode: 'overlay', sidebarMode: 'rail' }
  }
  return { breakpoint: 'mobile', view: compactView, inspectorMode: 'overlay', sidebarMode: 'rail' }
}

export function getWorkspaceGridTemplate(view: WorkspaceView, editorRatio: number): string {
  if (view === 'canvas') return 'minmax(0, 1fr)'
  if (view === 'source') return 'minmax(0, 1fr)'

  const ratio = Number.isFinite(editorRatio) ? Math.max(28, Math.min(68, editorRatio)) : 38
  return `clamp(340px, ${ratio}%, 520px) 6px minmax(560px, 1fr)`
}

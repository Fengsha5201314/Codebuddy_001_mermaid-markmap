import packageInfo from '../../package.json'

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error' | 'development' | 'web'

export interface AppInfo {
  desktop: boolean
  packaged: boolean
  name: string
  version: string
  platform: string
  releasesUrl: string
}

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion?: string
  progress?: number
  message: string
}

interface FengshaDesktopBridge {
  getAppInfo: () => Promise<AppInfo>
  getUpdateState: () => Promise<UpdateState>
  checkForUpdates: () => Promise<UpdateState>
  installUpdate: () => Promise<boolean>
  confirmClose: (hasUnsavedChanges: boolean) => Promise<'save' | 'discard' | 'cancel'>
  closeNow: () => void
  onCloseRequested: (callback: () => void) => () => void
  onUpdateState: (callback: (state: UpdateState) => void) => () => void
}

declare global {
  interface Window {
    fengshaDesktop?: FengshaDesktopBridge
  }
}

export const releasesUrl = 'https://github.com/Fengsha5201314/Codebuddy_001_mermaid-markmap/releases'

const webInfo: AppInfo = {
  desktop: false,
  packaged: false,
  name: '风沙图表工作台',
  version: packageInfo.version,
  platform: 'web',
  releasesUrl,
}

const webUpdateState: UpdateState = {
  status: 'web',
  currentVersion: packageInfo.version,
  message: '网页版会随服务器部署自动更新，无需下载安装。',
}

export async function getAppInfo(): Promise<AppInfo> {
  return window.fengshaDesktop?.getAppInfo() ?? webInfo
}

export async function getUpdateState(): Promise<UpdateState> {
  return window.fengshaDesktop?.getUpdateState() ?? webUpdateState
}

export async function checkForUpdates(): Promise<UpdateState> {
  return window.fengshaDesktop?.checkForUpdates() ?? webUpdateState
}

export async function installUpdate(): Promise<boolean> {
  return window.fengshaDesktop?.installUpdate() ?? false
}

export function onUpdateState(callback: (state: UpdateState) => void): () => void {
  return window.fengshaDesktop?.onUpdateState(callback) ?? (() => undefined)
}

export function onDesktopCloseRequested(callback: () => void): () => void {
  return window.fengshaDesktop?.onCloseRequested(callback) ?? (() => undefined)
}

export async function confirmDesktopClose(hasUnsavedChanges: boolean): Promise<'save' | 'discard' | 'cancel'> {
  return window.fengshaDesktop?.confirmClose(hasUnsavedChanges) ?? 'save'
}

export function closeDesktopWindow(): void {
  window.fengshaDesktop?.closeNow()
}

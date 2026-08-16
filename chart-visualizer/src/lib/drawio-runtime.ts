import { DEFAULT_DRAWIO_EMBED_URL } from '@/lib/drawio-bridge'
import type { VisualEditorMode } from '@/types'

export const BUNDLED_DRAWIO_VERSION = '31.1.8'
export const BUNDLED_DRAWIO_PATH = '/drawio/'

export interface DrawioRuntime {
  mode: VisualEditorMode
  editorUrl: string
  label: string
  loadingTitle: string
  loadingDescription: string
  requiresNetwork: boolean
}

/**
 * The single seam between the Fengsha workspace and the selected draw.io runtime.
 * Callers only need a stable editor URL and user-facing state; versioning and
 * deployment details stay inside this module.
 */
export function resolveDrawioRuntime(mode: VisualEditorMode, hostUrl: string): DrawioRuntime {
  if (mode === 'online') {
    return {
      mode,
      editorUrl: DEFAULT_DRAWIO_EMBED_URL,
      label: '官方在线备用',
      loadingTitle: '正在连接官方在线画布',
      loadingDescription: '需要访问 embed.diagrams.net，本地图形内容会在连接后载入',
      requiresNetwork: true,
    }
  }

  return {
    mode: 'local',
    editorUrl: new URL(BUNDLED_DRAWIO_PATH, hostUrl).toString(),
    label: `本地引擎 v${BUNDLED_DRAWIO_VERSION}`,
    loadingTitle: '正在启动本地可视化引擎',
    loadingDescription: `已内置 draw.io v${BUNDLED_DRAWIO_VERSION}，无需连接官方网站`,
    requiresNetwork: false,
  }
}

export function getOnlineFallback(
  current: DrawioRuntime,
  enabled: boolean,
  hostUrl: string,
): DrawioRuntime | undefined {
  if (!enabled || current.mode !== 'local') return undefined
  return resolveDrawioRuntime('online', hostUrl)
}

export const DEFAULT_DRAWIO_EMBED_URL = 'https://embed.diagrams.net/'

export type DrawioBridgeState = 'connecting' | 'loading' | 'ready' | 'destroyed'

export type DrawioSource =
  | { type: 'xml'; xml: string }
  | {
      type: 'mermaid'
      mermaid: string
      wrap?: boolean
      /** Stores the Mermaid source on the model root so it survives conversion. */
      sourceMetadataKey?: string
    }

export type DrawioAction = 'undo' | 'redo' | 'fit'

export interface DrawioFitOptions {
  border?: number
  maxScale?: number
}

export interface DrawioLayout {
  layout: string
  config?: Record<string, string | number | boolean>
}

export type DrawioInitialLayout =
  | 'verticalFlow'
  | 'horizontalFlow'
  | 'verticalTree'
  | 'horizontalTree'
  | 'radialTree'
  | 'organic'
  | DrawioLayout[]

export type DrawioExportFormat =
  | 'xml'
  | 'json'
  | 'svg'
  | 'xmlsvg'
  | 'png'
  | 'xmlpng'
  | 'jpg'
  | 'webp'
  | 'html'
  | 'html2'
  | 'pdf'

export interface DrawioExportOptions {
  scale?: number
  width?: number
  border?: number
  transparent?: boolean
  background?: string
  currentPage?: boolean
  allPages?: boolean
  includeData?: boolean
  compressed?: boolean
  selection?: boolean
  keepTheme?: boolean
  xml?: string
}

export interface DrawioExportResult {
  format: DrawioExportFormat
  data?: unknown
  xml?: string
  filename?: string
}

export interface DrawioChange {
  xml: string
  checksum?: string
  patch?: unknown
  exit: boolean
}

export interface DrawioLoadResult {
  checksum?: string
  scale?: number
  currentPage?: number
}

export interface DrawioExitResult {
  modified: boolean
}

export interface DrawioLoadOptions {
  autosave?: boolean
  title?: string
  libraries?: string
  dark?: boolean | 'auto'
  fit?: boolean
  exportProtocol?: boolean
  layout?: DrawioInitialLayout
}

export type DrawioBridgeErrorCode =
  | 'invalid-url'
  | 'not-ready'
  | 'destroyed'
  | 'timeout'
  | 'editor-error'
  | 'callback-error'

export class DrawioBridgeError extends Error {
  readonly code: DrawioBridgeErrorCode

  constructor(code: DrawioBridgeErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DrawioBridgeError'
    this.code = code
  }
}

export interface DrawioBridgeOptions {
  iframe: HTMLIFrameElement
  source: DrawioSource
  editorUrl?: string
  urlParams?: Record<string, string | number | boolean | null | undefined>
  load?: DrawioLoadOptions
  requestTimeoutMs?: number
  onReady?: () => void
  onLoad?: (result: DrawioLoadResult) => void
  onAutosave?: (change: DrawioChange) => void
  onSave?: (change: DrawioChange) => void
  onExit?: (result: DrawioExitResult) => void
  onExport?: (result: DrawioExportResult) => void
  onError?: (error: DrawioBridgeError) => void
}

export interface DrawioBridge {
  readonly url: string
  readonly origin: string
  readonly state: DrawioBridgeState
  load(source: DrawioSource): void
  invokeAction(action: DrawioAction, options?: DrawioFitOptions): void
  layout(layouts: DrawioLayout | DrawioLayout[]): void
  exportDiagram(format: DrawioExportFormat, options?: DrawioExportOptions): Promise<DrawioExportResult>
  destroy(): void
}

type JsonObject = Record<string, unknown>

interface ExportRequest {
  format: DrawioExportFormat
  options: DrawioExportOptions
  resolve: (result: DrawioExportResult) => void
  reject: (error: DrawioBridgeError) => void
  timer?: ReturnType<typeof setTimeout>
}

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseMessage(data: unknown): JsonObject | null {
  if (isObject(data)) return data
  if (typeof data !== 'string' || !data.trim()) return null

  try {
    const parsed: unknown = JSON.parse(data)
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function buildEditorUrl(
  editorUrl: string,
  params: DrawioBridgeOptions['urlParams'],
): { url: string; origin: string } {
  let url: URL
  try {
    url = new URL(editorUrl, window.location.href)
  } catch (cause) {
    throw new DrawioBridgeError('invalid-url', 'draw.io 编辑器地址无效。', { cause })
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new DrawioBridgeError('invalid-url', 'draw.io 编辑器地址必须使用 HTTP 或 HTTPS，且不能包含账号信息。')
  }

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null) {
      url.searchParams.delete(key)
    } else {
      url.searchParams.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value))
    }
  }

  // These two parameters are part of the bridge contract and cannot be disabled by callers.
  url.searchParams.set('embed', '1')
  url.searchParams.set('proto', 'json')
  if (!url.searchParams.has('spin')) url.searchParams.set('spin', '1')

  return { url: url.toString(), origin: url.origin }
}

function toLoadAction(source: DrawioSource, options: DrawioLoadOptions): JsonObject {
  const action: JsonObject = {
    action: 'load',
    autosave: options.autosave === false ? 0 : 1,
    exportProtocol: options.exportProtocol ?? true,
  }

  if (source.type === 'xml') {
    action.xml = source.xml
  } else {
    action.descriptor = {
      format: 'mermaid',
      data: source.mermaid,
      ...(source.wrap === undefined ? {} : { wrap: source.wrap }),
    }
    if (source.sourceMetadataKey) {
      action.sourceMetadata = { key: source.sourceMetadataKey, value: source.mermaid }
    }
  }

  if (options.title !== undefined) action.title = options.title
  if (options.libraries !== undefined) action.libs = options.libraries
  if (options.dark !== undefined) action.dark = options.dark
  if (options.fit !== undefined) action.fit = options.fit ? 1 : 0
  if (options.layout !== undefined) action.layout = options.layout

  return action
}

function toExportResult(message: JsonObject, fallbackFormat: DrawioExportFormat): DrawioExportResult {
  const messageFormat = optionalString(message.format)
  return {
    format: (messageFormat ?? fallbackFormat) as DrawioExportFormat,
    data: message.data,
    xml: optionalString(message.xml),
    filename: optionalString(message.filename),
  }
}

class DrawioBridgeImpl implements DrawioBridge {
  readonly url: string
  readonly origin: string

  private readonly iframe: HTMLIFrameElement
  private readonly options: DrawioBridgeOptions
  private readonly requestTimeoutMs: number
  private currentSource: DrawioSource
  private currentState: DrawioBridgeState = 'connecting'
  private initialized = false
  private activeExport?: ExportRequest
  private readonly exportQueue: ExportRequest[] = []

  constructor(options: DrawioBridgeOptions) {
    this.options = options
    this.iframe = options.iframe
    this.currentSource = options.source
    this.requestTimeoutMs =
      options.requestTimeoutMs !== undefined && options.requestTimeoutMs > 0
        ? options.requestTimeoutMs
        : DEFAULT_REQUEST_TIMEOUT_MS

    const editor = buildEditorUrl(options.editorUrl ?? DEFAULT_DRAWIO_EMBED_URL, options.urlParams)
    this.url = editor.url
    this.origin = editor.origin

    window.addEventListener('message', this.handleMessage)
    this.iframe.src = this.url
  }

  get state(): DrawioBridgeState {
    return this.currentState
  }

  load(source: DrawioSource): void {
    this.assertAlive()
    this.currentSource = source
    if (this.initialized) this.sendLoad()
  }

  invokeAction(action: DrawioAction, options: DrawioFitOptions = {}): void {
    this.assertReady()
    if (action === 'fit') {
      this.post({ action: 'fit', border: options.border ?? 16, maxScale: options.maxScale ?? 1 })
      return
    }
    this.post({ action: 'invokeAction', actionName: action })
  }

  layout(layouts: DrawioLayout | DrawioLayout[]): void {
    this.assertReady()
    this.post({ action: 'layout', layouts: Array.isArray(layouts) ? layouts : [layouts] })
  }

  exportDiagram(
    format: DrawioExportFormat,
    options: DrawioExportOptions = {},
  ): Promise<DrawioExportResult> {
    try {
      this.assertReady()
    } catch (error) {
      return Promise.reject(error)
    }

    return new Promise((resolve, reject) => {
      this.exportQueue.push({ format, options, resolve, reject })
      this.startNextExport()
    })
  }

  destroy(): void {
    if (this.currentState === 'destroyed') return

    window.removeEventListener('message', this.handleMessage)
    this.currentState = 'destroyed'
    this.initialized = false

    const error = new DrawioBridgeError('destroyed', 'draw.io 编辑器连接已关闭。')
    if (this.activeExport) {
      if (this.activeExport.timer) clearTimeout(this.activeExport.timer)
      this.activeExport.reject(error)
      this.activeExport = undefined
    }
    for (const request of this.exportQueue.splice(0)) request.reject(error)
  }

  private readonly handleMessage = (event: MessageEvent): void => {
    // Both checks are required: origin alone cannot distinguish another trusted iframe,
    // and source alone would accept a frame that navigated to an unexpected origin.
    if (this.currentState === 'destroyed' || event.origin !== this.origin || event.source !== this.iframe.contentWindow) {
      return
    }

    const message = parseMessage(event.data)
    if (!message) return

    if (typeof message.error === 'string' && message.event !== 'export') {
      this.reportError(new DrawioBridgeError('editor-error', `draw.io 返回错误：${message.error}`))
      return
    }

    switch (message.event) {
      case 'init':
        this.initialized = true
        this.sendLoad()
        this.callSafely(this.options.onReady)
        break
      case 'load':
        this.currentState = 'ready'
        this.callSafely(this.options.onLoad, {
          checksum: optionalString(message.checksum),
          scale: optionalNumber(message.scale),
          currentPage: optionalNumber(message.currentPage),
        })
        break
      case 'autosave':
        this.emitChange(message, this.options.onAutosave)
        break
      case 'save':
        this.emitChange(message, this.options.onSave)
        break
      case 'exit':
        this.callSafely(this.options.onExit, { modified: message.modified === true })
        break
      case 'export':
        this.receiveExport(message)
        break
      default:
        break
    }
  }

  private sendLoad(): void {
    this.currentState = 'loading'
    this.post(toLoadAction(this.currentSource, this.options.load ?? {}))
  }

  private emitChange(message: JsonObject, callback: DrawioBridgeOptions['onSave']): void {
    if (typeof message.xml !== 'string') return
    this.callSafely(callback, {
      xml: message.xml,
      checksum: optionalString(message.checksum),
      patch: message.patch,
      exit: message.exit === true,
    })
  }

  private receiveExport(message: JsonObject): void {
    const active = this.activeExport
    const responseFormat = optionalString(message.format)

    if (active && (!responseFormat || responseFormat === active.format)) {
      if (active.timer) clearTimeout(active.timer)
      this.activeExport = undefined

      if (typeof message.error === 'string') {
        active.reject(new DrawioBridgeError('editor-error', `draw.io 导出失败：${message.error}`))
      } else {
        active.resolve(toExportResult(message, active.format))
      }
      this.startNextExport()
      return
    }

    if (responseFormat) {
      this.callSafely(this.options.onExport, toExportResult(message, responseFormat as DrawioExportFormat))
    }
  }

  private startNextExport(): void {
    if (this.activeExport || this.currentState === 'destroyed') return
    const request = this.exportQueue.shift()
    if (!request) return

    this.activeExport = request
    request.timer = setTimeout(() => {
      if (this.activeExport !== request) return
      this.activeExport = undefined
      request.reject(new DrawioBridgeError('timeout', `draw.io 导出 ${request.format.toUpperCase()} 超时。`))
      this.startNextExport()
    }, this.requestTimeoutMs)

    try {
      this.post({ action: 'export', format: request.format, ...request.options })
    } catch (cause) {
      if (request.timer) clearTimeout(request.timer)
      this.activeExport = undefined
      request.reject(
        cause instanceof DrawioBridgeError
          ? cause
          : new DrawioBridgeError('editor-error', '无法向 draw.io 发起导出。', { cause }),
      )
      this.startNextExport()
    }
  }

  private post(message: JsonObject): void {
    this.assertAlive()
    const target = this.iframe.contentWindow
    if (!target) {
      throw new DrawioBridgeError('editor-error', 'draw.io iframe 尚未建立通讯窗口。')
    }
    target.postMessage(JSON.stringify(message), this.origin)
  }

  private assertAlive(): void {
    if (this.currentState === 'destroyed') {
      throw new DrawioBridgeError('destroyed', 'draw.io 编辑器连接已关闭。')
    }
  }

  private assertReady(): void {
    this.assertAlive()
    if (this.currentState !== 'ready') {
      throw new DrawioBridgeError('not-ready', 'draw.io 编辑器尚未加载完成。')
    }
  }

  private callSafely<T>(callback: ((value: T) => void) | undefined, value: T): void
  private callSafely(callback: (() => void) | undefined): void
  private callSafely<T>(callback: ((value?: T) => void) | undefined, value?: T): void {
    if (!callback) return
    try {
      callback(value)
    } catch (cause) {
      this.reportError(new DrawioBridgeError('callback-error', 'draw.io 事件回调执行失败。', { cause }))
    }
  }

  private reportError(error: DrawioBridgeError): void {
    try {
      this.options.onError?.(error)
    } catch {
      // Error reporting must never break the global message listener.
    }
  }
}

export function createDrawioBridge(options: DrawioBridgeOptions): DrawioBridge {
  return new DrawioBridgeImpl(options)
}

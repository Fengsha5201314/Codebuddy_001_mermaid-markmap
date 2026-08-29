import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { autoUpdater } from 'electron-updater'
import { createAiMiddleware } from '../server/ai-service.ts'
import packageInfo from '../package.json' with { type: 'json' }
import { resolveDesktopPort } from './origin.ts'
import { isSameOriginNavigation, isTrustedLocalRequest, resolveDevelopmentRendererUrl } from './security.ts'
import { migrateLegacyAiSettings, resolveDesktopUserDataDirectory } from './user-data.ts'
import {
  CLI_WORKER_FLAG,
  type CliRendererResponse,
  type CliWorkerEnvelope,
  type CliWorkerResult,
} from '../src/cli-contracts.ts'
import { commitCliDeliveryTransaction } from '../cli/file-integrity.ts'

const APP_NAME = '风沙图表工作台'
const APP_ID = 'online.fengsha.diagram'
const APP_HOST = '127.0.0.1'
const RELEASES_URL = 'https://github.com/Fengsha5201314/Codebuddy_001_mermaid-markmap/releases'
const SAFE_STORAGE_PREFIX = 'electron-safe-storage:v1:'

function resolveCliWorkerArguments(argv: string[]) {
  const flagIndex = argv.indexOf(CLI_WORKER_FLAG)
  if (flagIndex < 0) return null
  const requestPath = argv[flagIndex + 1]
  const resultPath = argv[flagIndex + 2]
  return requestPath && resultPath
    ? { requestPath: path.resolve(requestPath), resultPath: path.resolve(resultPath) }
    : null
}

const cliWorkerArguments = resolveCliWorkerArguments(process.argv)
if (cliWorkerArguments) app.disableHardwareAcceleration()

if (cliWorkerArguments) {
  app.setPath('userData', path.join(path.dirname(cliWorkerArguments.requestPath), 'browser-profile'))
} else {
  const persistentUserDataDirectory = resolveDesktopUserDataDirectory(
    app.getPath('appData'),
    process.argv,
    process.env.FENGSHA_DESKTOP_USER_DATA_DIR,
  )
  if (persistentUserDataDirectory) app.setPath('userData', persistentUserDataDirectory)
}

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error' | 'development'

interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion?: string
  progress?: number
  message: string
}

let mainWindow: BrowserWindow | null = null
let mainWindowCreation: Promise<BrowserWindow> | null = null
let allowWindowClose = false
let closeRequestPending = false
let appQuitting = false
let localServer: Server | null = null
let localOrigin = ''
const currentVersion = () => app.isPackaged ? app.getVersion() : packageInfo.version
let updateState: UpdateState = {
  status: 'idle',
  currentVersion: currentVersion(),
  message: '可以手动检查是否有新版本。',
}

const mimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
}

function broadcastUpdateState(next: Partial<UpdateState>) {
  updateState = { ...updateState, ...next, currentVersion: currentVersion() }
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('updates:state', updateState)
  })
}

function registerUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    broadcastUpdateState({ status: 'checking', progress: undefined, message: '正在连接更新服务…' })
  })
  autoUpdater.on('update-available', (info) => {
    broadcastUpdateState({ status: 'available', availableVersion: info.version, message: `发现新版本 v${info.version}，准备下载。` })
  })
  autoUpdater.on('download-progress', (progress) => {
    broadcastUpdateState({
      status: 'downloading',
      progress: Math.round(progress.percent),
      message: `正在下载新版本 ${Math.round(progress.percent)}%`,
    })
  })
  autoUpdater.on('update-not-available', (info) => {
    broadcastUpdateState({ status: 'up-to-date', availableVersion: info.version, progress: undefined, message: '当前已经是最新版本。' })
  })
  autoUpdater.on('update-downloaded', (info) => {
    broadcastUpdateState({
      status: 'downloaded',
      availableVersion: info.version,
      progress: 100,
      message: `v${info.version} 已下载完成，可以重启安装。`,
    })
  })
  autoUpdater.on('error', (error) => {
    void error
    broadcastUpdateState({
      status: 'error',
      progress: undefined,
      message: '检查更新失败，请确认网络连接后重试。',
    })
  })
}

function registerIpc() {
  const isTrustedSender = (event: IpcMainEvent | IpcMainInvokeEvent) => Boolean(
    mainWindow
    && !mainWindow.isDestroyed()
    && event.sender === mainWindow.webContents
    && event.senderFrame === event.sender.mainFrame,
  )
  const requireTrustedSender = (event: IpcMainEvent | IpcMainInvokeEvent) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.')
  }

  ipcMain.handle('app:get-info', (event) => {
    requireTrustedSender(event)
    return {
    desktop: true,
    packaged: app.isPackaged,
    name: APP_NAME,
    version: currentVersion(),
    platform: process.platform,
    releasesUrl: RELEASES_URL,
    }
  })

  ipcMain.handle('updates:get-state', (event) => {
    requireTrustedSender(event)
    return updateState
  })
  ipcMain.handle('updates:check', async (event) => {
    requireTrustedSender(event)
    if (!app.isPackaged) {
      broadcastUpdateState({ status: 'development', message: '当前是开发预览版，正式安装包才会连接更新服务。' })
      return updateState
    }
    if (['checking', 'available', 'downloading'].includes(updateState.status)) return updateState
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      broadcastUpdateState({ status: 'error', progress: undefined, message: '检查更新失败，请确认网络连接后重试。' })
    }
    return updateState
  })
  ipcMain.handle('updates:install', (event) => {
    requireTrustedSender(event)
    if (updateState.status !== 'downloaded') return false
    autoUpdater.quitAndInstall(false, true)
    return true
  })
  ipcMain.handle('app:confirm-close', async (event, hasUnsavedChanges: boolean) => {
    requireTrustedSender(event)
    if (!closeRequestPending || typeof hasUnsavedChanges !== 'boolean') return 'cancel'
    if (!hasUnsavedChanges || !mainWindow || mainWindow.isDestroyed()) return 'save'
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: '关闭风沙图表工作台',
      message: '检测到可视化画布还有尚未写入本机的变更。',
      detail: '请选择保存并关闭、不保存直接关闭，或取消后继续编辑。',
      buttons: ['保存并关闭', '不保存，直接关闭', '取消'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    })
    const decision = result.response === 0 ? 'save' : result.response === 1 ? 'discard' : 'cancel'
    if (decision === 'cancel') closeRequestPending = false
    return decision
  })
  ipcMain.on('app:close-now', (event) => {
    if (!isTrustedSender(event) || !closeRequestPending || !mainWindow || mainWindow.isDestroyed()) return
    allowWindowClose = true
    closeRequestPending = false
    // The embedded draw.io frame installs its own beforeunload handler. At this
    // point the host renderer has already captured the latest XML and completed
    // our save/discard confirmation, so bypass the child frame's second prompt.
    // Otherwise BrowserWindow.close() can be cancelled silently and leave the
    // desktop task running after the user explicitly confirmed shutdown.
    mainWindow.destroy()
  })
}

function sendServerError(response: ServerResponse, statusCode: number, message: string) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'text/plain; charset=utf-8')
  response.end(message)
}

async function serveStaticFile(request: IncomingMessage, response: ServerResponse, staticRoot: string, origin: string) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendServerError(response, 405, 'Method Not Allowed')
    return
  }

  const url = new URL(request.url || '/', origin)
  let relativePath = ''
  try {
    relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
  } catch {
    sendServerError(response, 400, 'Bad Request')
    return
  }
  if (relativePath.split(/[\\/]+/).some((segment) => segment.toLowerCase() === 'web-inf')) {
    sendServerError(response, 404, 'Not Found')
    return
  }
  const root = path.resolve(staticRoot)
  let requestedPath = path.resolve(root, relativePath)
  if (requestedPath !== root && !requestedPath.startsWith(`${root}${path.sep}`)) {
    sendServerError(response, 403, 'Forbidden')
    return
  }

  try {
    const file = await stat(requestedPath)
    if (file.isDirectory()) requestedPath = path.join(requestedPath, 'index.html')
  } catch {
    if (!request.headers.accept?.includes('text/html')) {
      sendServerError(response, 404, 'Not Found')
      return
    }
    relativePath = 'index.html'
    requestedPath = path.join(root, relativePath)
  }

  try {
    const file = await stat(requestedPath)
    if (!file.isFile()) throw new Error('Not a file')
    response.statusCode = 200
    response.setHeader('Content-Type', mimeTypes[path.extname(requestedPath).toLowerCase()] || 'application/octet-stream')
    response.setHeader('Cache-Control', relativePath === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable')
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' https://embed.diagrams.net; frame-ancestors 'self'; worker-src 'self' blob:;",
    )
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('X-Frame-Options', 'SAMEORIGIN')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(requestedPath).pipe(response)
  } catch {
    sendServerError(response, 404, 'Not Found')
  }
}

async function startLocalServer(portOverride?: number) {
  if (localServer && localOrigin) return localOrigin
  const appRoot = app.isPackaged ? app.getAppPath() : process.cwd()
  const staticRoot = path.join(appRoot, 'dist')
  const appPort = portOverride === 0
    ? 0
    : await resolveDesktopPort(app.getPath('userData'), process.env.FENGSHA_DESKTOP_PORT)
  const aiMiddleware = createAiMiddleware({
    settingsFile: path.join(app.getPath('userData'), 'ai-providers.json'),
    isApiKeyProtected: (storedValue) => storedValue.startsWith(SAFE_STORAGE_PREFIX),
    protectApiKey: (apiKey) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Electron safeStorage is unavailable.')
      return `${SAFE_STORAGE_PREFIX}${safeStorage.encryptString(apiKey).toString('base64')}`
    },
    unprotectApiKey: (storedValue) => {
      if (!storedValue.startsWith(SAFE_STORAGE_PREFIX)) return storedValue
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Electron safeStorage is unavailable.')
      return safeStorage.decryptString(Buffer.from(storedValue.slice(SAFE_STORAGE_PREFIX.length), 'base64'))
    },
    providers: {
      cpa: { baseUrl: process.env.CPA_BASE_URL || 'https://cpa.fengsha.online/v1', apiKey: process.env.CPA_API_KEY },
      deepseek: { baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY },
      custom: { baseUrl: process.env.CUSTOM_AI_BASE_URL, apiKey: process.env.CUSTOM_AI_API_KEY, label: process.env.CUSTOM_AI_LABEL },
    },
  })

  localServer = createServer((request, response) => {
    if (!localOrigin || !isTrustedLocalRequest(request.headers, localOrigin, request.method)) {
      sendServerError(response, 403, 'Forbidden')
      return
    }
    let pathname = ''
    try {
      pathname = new URL(request.url || '/', localOrigin).pathname
    } catch {
      sendServerError(response, 400, 'Bad Request')
      return
    }
    if (pathname.startsWith('/api/ai')) {
      void aiMiddleware(request, response)
      return
    }
    void serveStaticFile(request, response, staticRoot, localOrigin)
  })

  localServer.headersTimeout = 15_000
  localServer.requestTimeout = 30_000
  localServer.keepAliveTimeout = 5_000
  localServer.maxHeadersCount = 100

  await new Promise<void>((resolve, reject) => {
    localServer?.once('error', reject)
    localServer?.listen(appPort, APP_HOST, () => {
      const address = localServer?.address() as AddressInfo | null
      if (!address) {
        reject(new Error('Local server did not expose a listening address.'))
        return
      }
      localOrigin = `http://${APP_HOST}:${address.port}`
      resolve()
    })
  })
  return localOrigin
}

async function writeJsonAtomically(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, filePath)
}

async function commitCliResponse(envelope: CliWorkerEnvelope, response: Extract<CliRendererResponse, { ok: true }>) {
  if (response.artifact && !envelope.outputPath) throw new Error('CLI 结果包含文件内容，但没有指定输出路径。')
  if (envelope.receiptPath && !response.receipt) throw new Error('CLI 请求了质量回执，但渲染进程没有返回回执。')
  const outputPath = response.artifact && envelope.outputPath ? path.resolve(envelope.outputPath) : undefined
  const receiptPath = response.receipt && envelope.receiptPath ? path.resolve(envelope.receiptPath) : undefined
  await commitCliDeliveryTransaction({
    overwrite: Boolean(envelope.overwrite),
    output: response.artifact && outputPath
      ? {
          path: outputPath,
          label: '输出文件',
          payload: response.artifact.encoding === 'base64'
            ? Buffer.from(response.artifact.content, 'base64')
            : response.artifact.content,
          expected: envelope.outputSnapshot,
          expectedSha256: response.receipt?.outputSha256,
        }
      : undefined,
    receipt: response.receipt && receiptPath
      ? {
          path: receiptPath,
          label: '质量回执',
          payload: `${JSON.stringify(response.receipt)}\n`,
          expected: envelope.receiptSnapshot,
        }
      : undefined,
  })
  return outputPath
}

async function runCliWorker(requestPath: string, resultPath: string) {
  let workerWindow: BrowserWindow | null = null
  try {
    const envelope = JSON.parse(await readFile(requestPath, 'utf8')) as CliWorkerEnvelope
    if (!envelope?.request || (envelope.request.protocolVersion !== 1 && envelope.request.protocolVersion !== 2)) throw new Error('CLI 请求格式不正确。')
    const rendererOrigin = await startLocalServer(0)
    workerWindow = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, 'cli-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    const response = await new Promise<CliRendererResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('CLI 浏览器渲染超时。'))
      }, 280_000)
      const cleanup = () => {
        clearTimeout(timeout)
        ipcMain.removeListener('cli:ready', onReady)
        ipcMain.removeListener('cli:response', onResponse)
      }
      const trusted = (event: IpcMainEvent) => Boolean(workerWindow && !workerWindow.isDestroyed() && event.sender === workerWindow.webContents)
      const onReady = (event: IpcMainEvent) => {
        if (!trusted(event) || !workerWindow) return
        workerWindow.webContents.send('cli:request', envelope.request)
      }
      const onResponse = (event: IpcMainEvent, value: CliRendererResponse) => {
        if (!trusted(event)) return
        cleanup()
        resolve(value)
      }
      ipcMain.on('cli:ready', onReady)
      ipcMain.on('cli:response', onResponse)
      workerWindow?.webContents.once('render-process-gone', (_event, details) => {
        cleanup()
        reject(new Error(`CLI 浏览器渲染进程异常退出：${details.reason}`))
      })
      void workerWindow?.loadURL(`${rendererOrigin}/cli.html`).catch((error) => {
        cleanup()
        reject(error)
      })
    })
    let result: CliWorkerResult
    if (!response.ok) {
      result = {
        ok: false,
        category: response.category,
        message: response.line ? `${response.message}（第 ${response.line} 行）` : response.message,
        receipt: response.receipt,
      }
    } else {
      try {
        const outputPath = await commitCliResponse(envelope, response)
        result = { ok: true, outputPath, metadata: response.metadata, receipt: response.receipt }
      } catch (error) {
        result = {
          ok: false,
          category: 'io',
          message: error instanceof Error ? error.message : 'CLI 成品事务提交失败。',
          receipt: response.receipt,
        }
      }
    }
    await writeJsonAtomically(resultPath, result)
  } catch (error) {
    await writeJsonAtomically(resultPath, {
      ok: false,
      category: 'internal',
      message: error instanceof Error ? error.message : 'CLI 工作进程失败。',
    } satisfies CliWorkerResult)
  } finally {
    if (workerWindow && !workerWindow.isDestroyed()) workerWindow.destroy()
    localServer?.closeIdleConnections()
    localServer?.closeAllConnections()
    await new Promise<void>((resolve) => localServer?.close(() => resolve()) ?? resolve())
    localServer = null
    localOrigin = ''
  }
}

async function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  if (mainWindowCreation) return mainWindowCreation

  mainWindowCreation = (async () => {
  const developmentUrl = app.isPackaged ? null : resolveDevelopmentRendererUrl(process.env.ELECTRON_RENDERER_URL)
  const rendererUrl = developmentUrl || await startLocalServer()
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(process.cwd(), 'build', 'icon.png')

  const window = new BrowserWindow({
    title: APP_NAME,
    width: 1480,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: '#f3f6f9',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow = window
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!isSameOriginNavigation(url, rendererUrl)) event.preventDefault()
  })
  window.once('ready-to-show', () => window.show())
  window.on('close', (event) => {
    if (allowWindowClose || appQuitting || window.webContents.isDestroyed()) return
    event.preventDefault()
    if (closeRequestPending) return
    closeRequestPending = true
    window.webContents.send('app:close-requested')
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
    allowWindowClose = false
    closeRequestPending = false
  })
  await window.loadURL(rendererUrl)
  return window
  })()

  try {
    return await mainWindowCreation
  } finally {
    mainWindowCreation = null
  }
}

const ownsLock = cliWorkerArguments ? true : app.requestSingleInstanceLock()
if (!ownsLock) {
  app.quit()
} else if (cliWorkerArguments) {
  app.whenReady().then(async () => {
    await runCliWorker(cliWorkerArguments.requestPath, cliWorkerArguments.resultPath)
    app.exit(0)
  }).catch(async (error) => {
    try {
      await writeJsonAtomically(cliWorkerArguments.resultPath, {
        ok: false,
        category: 'internal',
        message: error instanceof Error ? error.message : 'CLI 启动失败。',
      } satisfies CliWorkerResult)
    } finally {
      app.exit(1)
    }
  })
} else {
  app.setAppUserModelId(APP_ID)
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      void createMainWindow()
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  app.whenReady().then(async () => {
    try {
      await migrateLegacyAiSettings(app.getPath('appData'), app.getPath('userData'))
    } catch (error) {
      console.warn('Unable to migrate legacy AI settings:', error)
    }
    registerUpdater()
    registerIpc()
    await createMainWindow()
  }).catch((error) => {
    console.error(error)
    app.quit()
  })
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createMainWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', () => {
  appQuitting = true
  localServer?.closeIdleConnections()
  localServer?.closeAllConnections()
  localServer?.close()
  localServer = null
  localOrigin = ''
})

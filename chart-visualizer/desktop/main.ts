import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import path from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { createAiMiddleware } from '../server/ai-service.ts'
import packageInfo from '../package.json' with { type: 'json' }

const APP_NAME = '风沙图表工作台'
const APP_ID = 'online.fengsha.diagram'
const APP_HOST = '127.0.0.1'
const requestedPort = Number(process.env.FENGSHA_DESKTOP_PORT)
const APP_PORT = Number.isInteger(requestedPort) && requestedPort >= 1024 && requestedPort <= 65_535
  ? requestedPort
  : 43817
const RELEASES_URL = 'https://github.com/Fengsha5201314/Codebuddy_001_mermaid-markmap/releases'

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error' | 'development'

interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion?: string
  progress?: number
  message: string
}

let mainWindow: BrowserWindow | null = null
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
    broadcastUpdateState({
      status: 'error',
      progress: undefined,
      message: `检查更新失败：${error.message || '无法连接更新服务。'}`,
    })
  })
}

function registerIpc() {
  ipcMain.handle('app:get-info', () => ({
    desktop: true,
    packaged: app.isPackaged,
    name: APP_NAME,
    version: currentVersion(),
    platform: process.platform,
    releasesUrl: RELEASES_URL,
  }))

  ipcMain.handle('updates:get-state', () => updateState)
  ipcMain.handle('updates:check', async () => {
    if (!app.isPackaged) {
      broadcastUpdateState({ status: 'development', message: '当前是开发预览版，正式安装包才会连接更新服务。' })
      return updateState
    }
    if (['checking', 'available', 'downloading'].includes(updateState.status)) return updateState
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法连接更新服务。'
      broadcastUpdateState({ status: 'error', progress: undefined, message: `检查更新失败：${message}` })
    }
    return updateState
  })
  ipcMain.handle('updates:install', () => {
    if (updateState.status !== 'downloaded') return false
    autoUpdater.quitAndInstall(false, true)
    return true
  })
}

function sendServerError(response: ServerResponse, statusCode: number, message: string) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'text/plain; charset=utf-8')
  response.end(message)
}

async function serveStaticFile(request: IncomingMessage, response: ServerResponse, staticRoot: string) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendServerError(response, 405, 'Method Not Allowed')
    return
  }

  const url = new URL(request.url || '/', `http://${APP_HOST}:${APP_PORT}`)
  let relativePath = ''
  try {
    relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
  } catch {
    sendServerError(response, 400, 'Bad Request')
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
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https:; frame-src 'self' https://embed.diagrams.net; worker-src 'self' blob:;",
    )
    response.setHeader('X-Content-Type-Options', 'nosniff')
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(requestedPath).pipe(response)
  } catch {
    sendServerError(response, 404, 'Not Found')
  }
}

async function startLocalServer() {
  if (localServer && localOrigin) return localOrigin
  const appRoot = app.isPackaged ? app.getAppPath() : process.cwd()
  const staticRoot = path.join(appRoot, 'dist')
  const aiMiddleware = createAiMiddleware({
    settingsFile: path.join(app.getPath('userData'), 'ai-providers.json'),
    providers: {
      cpa: { baseUrl: process.env.CPA_BASE_URL || 'https://cpa.fengsha.online/v1', apiKey: process.env.CPA_API_KEY },
      deepseek: { baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY },
      custom: { baseUrl: process.env.CUSTOM_AI_BASE_URL, apiKey: process.env.CUSTOM_AI_API_KEY, label: process.env.CUSTOM_AI_LABEL },
    },
  })

  localServer = createServer((request, response) => {
    let pathname = ''
    try {
      pathname = new URL(request.url || '/', `http://${APP_HOST}:${APP_PORT}`).pathname
    } catch {
      sendServerError(response, 400, 'Bad Request')
      return
    }
    if (pathname.startsWith('/api/ai')) {
      void aiMiddleware(request, response)
      return
    }
    void serveStaticFile(request, response, staticRoot)
  })

  await new Promise<void>((resolve, reject) => {
    localServer?.once('error', reject)
    localServer?.listen(APP_PORT, APP_HOST, () => resolve())
  })
  localOrigin = `http://${APP_HOST}:${APP_PORT}`
  return localOrigin
}

async function createMainWindow() {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL || await startLocalServer()
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(process.cwd(), 'build', 'icon.png')

  mainWindow = new BrowserWindow({
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(rendererUrl)) event.preventDefault()
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { mainWindow = null })
  await mainWindow.loadURL(rendererUrl)
}

const ownsLock = app.requestSingleInstanceLock()
if (!ownsLock) {
  app.quit()
} else {
  app.setAppUserModelId(APP_ID)
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.whenReady().then(async () => {
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
  localServer?.close()
  localServer = null
  localOrigin = ''
})

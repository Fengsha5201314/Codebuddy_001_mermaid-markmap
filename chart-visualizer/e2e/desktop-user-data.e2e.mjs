import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isolatedAppData = await mkdtemp(path.join(tmpdir(), 'fengsha-user-data-e2e-'))
const persistentUserData = path.join(isolatedAppData, 'fengsha-diagram-workbench')
const settingsFile = path.join(persistentUserData, 'ai-providers.json')
let application

async function launch() {
  application = await electron.launch({
    cwd: projectRoot,
    args: [path.join(projectRoot, 'dist-electron', 'main.cjs')],
    env: {
      ...process.env,
      FENGSHA_DESKTOP_PORT: '',
      FENGSHA_DESKTOP_USER_DATA_DIR: persistentUserData,
    },
    timeout: 30_000,
  })
  const page = await application.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return page
}

async function configuredProvider(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/ai')
    const status = await response.json()
    return status.providers.find((provider) => provider.id === 'cpa')?.configured === true
  })
}

async function closeApplication() {
  const closed = application.waitForEvent('close')
  await application.evaluate(({ app }) => app.quit())
  await closed
  application = undefined
}

try {
  await mkdir(persistentUserData, { recursive: true })
  await writeFile(settingsFile, JSON.stringify({
    providers: { cpa: { baseUrl: 'https://cpa.example/v1', apiKey: 'user-data-regression-key' } },
  }), 'utf8')

  const firstPage = await launch()
  const firstUserData = await application.evaluate(({ app }) => app.getPath('userData'))
  if (path.resolve(firstUserData) !== path.resolve(persistentUserData)) {
    throw new Error(`开发版使用了错误的数据目录：${firstUserData}`)
  }
  if (!(await configuredProvider(firstPage))) throw new Error('首次启动没有读取持久化的 AI 配置')
  await firstPage.evaluate(() => localStorage.setItem('fengsha-user-data-regression', 'preserved'))
  await firstPage.reload()
  if (await firstPage.evaluate(() => localStorage.getItem('fengsha-user-data-regression')) !== 'preserved') {
    throw new Error('首次启动期间浏览器本地工作区状态没有写入')
  }
  await closeApplication()

  const secondPage = await launch()
  if (!(await configuredProvider(secondPage))) throw new Error('重新编译或重启后 AI 配置丢失')
  const marker = await secondPage.evaluate(() => localStorage.getItem('fengsha-user-data-regression'))
  if (marker !== 'preserved') throw new Error('重新启动后浏览器本地工作区状态丢失')

  console.log(JSON.stringify({
    userData: persistentUserData,
    configuredAfterRestart: true,
    localStateAfterRestart: marker,
  }))
} finally {
  if (application) await application.close().catch(() => undefined)
  await rm(isolatedAppData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined)
}

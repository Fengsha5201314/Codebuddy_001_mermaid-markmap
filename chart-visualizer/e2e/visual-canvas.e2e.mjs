import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'fengsha-visual-e2e-'))
const failures = []
let application
let page

function check(condition, message) {
  if (!condition) failures.push(message)
}

try {
  application = await electron.launch({
    cwd: projectRoot,
    args: [
      path.join(projectRoot, 'dist-electron', 'main.cjs'),
      `--user-data-dir=${userDataDirectory}`,
    ],
    env: {
      ...process.env,
      FENGSHA_DESKTOP_PORT: '43829',
    },
    timeout: 30_000,
  })

  page = await application.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const dialogs = []
  page.on('dialog', (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message() })
    void dialog.dismiss().catch(() => undefined)
  })
  await page.route('https://**', (route) => route.abort('internetdisconnected'))
  let localEditorDocumentRequests = 0
  let onlineEditorDocumentRequests = 0
  page.on('request', (request) => {
    if (request.resourceType() !== 'document') return
    if (request.url().startsWith('http://127.0.0.1:43829/drawio/')) {
      localEditorDocumentRequests += 1
    }
    if (request.url().startsWith('https://embed.diagrams.net/')) {
      onlineEditorDocumentRequests += 1
    }
  })

  await page.getByRole('button', { name: '\u8bbe\u7f6e' }).click()
  await page.getByRole('button', { name: /\u753b\u5e03\u5f15\u64ce/ }).click()
  check(await page.getByText('draw.io v31.1.8 \u5df2\u5185\u7f6e').count() === 1, '\u8bbe\u7f6e\u9875\u5e94\u663e\u793a\u5f53\u524d\u5185\u7f6e\u5f15\u64ce\u7248\u672c')
  check(await page.getByRole('radio', { name: /\u672c\u5730\u5185\u7f6e/ }).getAttribute('aria-checked') === 'true', '\u65b0\u5b89\u88c5\u5e94\u9ed8\u8ba4\u4f7f\u7528\u672c\u5730\u5f15\u64ce')
  await page.getByRole('button', { name: '\u5173\u95ed' }).click()

  await page.getByRole('button', { name: /\u8f6c\u4e3a\u53ef\u89c6\u5316/ }).click()
  const connectingCopy = page.getByText(/\u672c\u5730\u53ef\u89c6\u5316\u5f15\u64ce|\u5df2\u5185\u7f6e draw\.io/)
  check(await connectingCopy.count() > 0, '\u8fde\u63a5\u72b6\u6001\u5e94\u660e\u786e\u8bf4\u660e\u6b63\u5728\u542f\u52a8\u672c\u5730\u5f15\u64ce')

  await page.locator('.visual-canvas-frame.is-visible').waitFor({ state: 'visible', timeout: 30_000 })
  await page.evaluate(() => {
    window.__fengshaCapturedDownloads = []
    window.__fengshaLastBlobContent = ''
    const originalCreateObjectURL = URL.createObjectURL.bind(URL)
    URL.createObjectURL = function captureBlob(blob) {
      void blob.text().then((content) => { window.__fengshaLastBlobContent = content })
      return originalCreateObjectURL(blob)
    }
    const originalClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function captureDownload() {
      const captured = { fileName: this.download, href: this.href, content: '' }
      window.__fengshaCapturedDownloads.push(captured)
      if (this.href.startsWith('blob:') || this.href.startsWith('data:image/svg+xml')) {
        void fetch(this.href)
          .then((response) => response.text())
          .then((content) => { captured.content = content })
      }
      return originalClick.call(this)
    }
  })
  await page.getByRole('button', { name: /\u5bfc\u51fa\u5f53\u524d\u56fe\u8868/ }).click()
  await page.getByRole('radio', { name: /SVG \u77e2\u91cf\u56fe/ }).click()
  const downloadPromise = page.waitForEvent('download', { timeout: 8_000 }).catch(() => null)
  await page.getByRole('button', { name: '\u4e0b\u8f7d\u6587\u4ef6' }).click()
  const download = await downloadPromise
  const exportError = await page.locator('.visual-export-error').textContent().catch(() => null)
  await page.waitForFunction(() => Boolean(window.__fengshaLastBlobContent), null, { timeout: 5_000 }).catch(() => undefined)
  const capturedDownloads = await page.evaluate(() => window.__fengshaCapturedDownloads ?? [])
  const capturedBlobContent = await page.evaluate(() => window.__fengshaLastBlobContent ?? '')
  const svgDownload = capturedDownloads.find((item) => item.fileName.endsWith('.svg'))
  check(Boolean(download?.suggestedFilename().endsWith('.svg') || (svgDownload && /^(blob:|data:image\/svg\+xml)/.test(svgDownload.href))), `\u672c\u5730\u753b\u5e03\u5e94\u80fd\u5bfc\u51fa SVG \u4ea4\u4ed8\u6587\u4ef6${exportError ? `\uff1a${exportError}` : ''}`)
  const downloadedPath = download ? path.join(userDataDirectory, 'exported.svg') : null
  if (download && downloadedPath) await download.saveAs(downloadedPath).catch(() => undefined)
  const savedSvg = downloadedPath ? await readFile(downloadedPath, 'utf8').catch(() => '') : ''
  const exportedSvg = savedSvg || capturedBlobContent || svgDownload?.content || ''
  check(exportedSvg.includes('<text'), `\u5bfc\u51fa SVG \u5e94\u5305\u542b\u53ef\u8de8\u67e5\u770b\u5668\u663e\u793a\u7684\u539f\u751f SVG \u6587\u5b57\uff08\u5b9e\u9645\u8bfb\u53d6 ${exportedSvg.length} \u5b57\u7b26\uff0c${exportedSvg.slice(0, 80)}\uff09`)
  check(!exportedSvg.includes('<foreignObject'), '\u5bfc\u51fa SVG \u4e0d\u5e94\u4f9d\u8d56 Windows \u67e5\u770b\u5668\u65e0\u6cd5\u7a33\u5b9a\u663e\u793a\u7684 HTML foreignObject')
  check(!exportedSvg.includes('light-dark('), '\u5bfc\u51fa SVG \u4e0d\u5e94\u4fdd\u7559\u67e5\u770b\u5668\u517c\u5bb9\u6027\u4e0d\u7a33\u5b9a\u7684 light-dark \u6837\u5f0f')
  if (await page.getByText('\u5bfc\u51fa\u53ef\u89c6\u5316\u753b\u5e03').count()) await page.getByRole('button', { name: '\u5173\u95ed' }).click()
  const aiButton = page.getByRole('button', { name: /AI \u52a9\u624b/ })
  check(await aiButton.isEnabled(), '\u53ef\u89c6\u5316\u753b\u5e03\u6a21\u5f0f\u5fc5\u987b\u80fd\u6253\u5f00 AI \u52a9\u624b')
  check(await page.getByRole('button', { name: /\u8fd4\u56de Mermaid \u539f\u56fe/ }).count() === 1, '\u753b\u5e03\u5fc5\u987b\u63d0\u4f9b\u660e\u786e\u7684\u201c\u8fd4\u56de Mermaid \u539f\u56fe\u201d\u5165\u53e3')
  await aiButton.click()
  await page.locator('.visual-ai-assistant').waitFor({ state: 'visible' })
  check(await page.getByRole('button', { name: /\u4f18\u5316\u7ed3\u6784/ }).count() === 1, '\u753b\u5e03 AI \u5e94\u63d0\u4f9b\u7ed3\u6784\u4f18\u5316\u63d0\u793a\u8bcd\u6a21\u677f')
  check(await page.getByRole('button', { name: /\u4ece\u63cf\u8ff0\u521b\u5efa/ }).count() === 1, '\u753b\u5e03 AI \u5e94\u63d0\u4f9b\u4ece\u63cf\u8ff0\u521b\u5efa\u7684\u63d0\u793a\u8bcd\u6a21\u677f')
  await page.getByRole('button', { name: /\u4f18\u5316\u7ed3\u6784/ }).click()
  check((await page.getByLabel(/\u63cf\u8ff0\u8981\u5b8c\u6210\u7684\u5de5\u4f5c/).inputValue()).includes('\u4e1a\u52a1\u76ee\u6807'), '\u70b9\u51fb\u4e13\u4e1a\u6a21\u677f\u5e94\u628a\u63d0\u793a\u8bcd\u52a0\u5165\u8f93\u5165\u6846')
  await page.getByRole('button', { name: '\u5173\u95ed\u753b\u5e03 AI' }).click()

  await page.getByRole('button', { name: /\u8fd4\u56de Mermaid \u539f\u56fe/ }).click()
  await page.locator('.editor-preview-workspace').waitFor({ state: 'visible' })

  const returnStarted = Date.now()
  await page.locator('.document-main').filter({ hasText: '\u8ba2\u5355\u5c65\u7ea6\u6cf3\u9053\u56fe - \u53ef\u89c6\u5316' }).click()
  await page.locator('.visual-canvas-frame.is-visible').waitFor({ state: 'visible', timeout: 30_000 })
  const returnDurationMs = Date.now() - returnStarted

  check(localEditorDocumentRequests === 1, `\u8fd4\u56de\u5df2\u6253\u5f00\u7684\u753b\u5e03\u4e0d\u5e94\u91cd\u65b0\u542f\u52a8\u672c\u5730\u5f15\u64ce\uff0c\u5b9e\u9645\u8bf7\u6c42 ${localEditorDocumentRequests} \u6b21`)
  check(onlineEditorDocumentRequests === 0, `\u65ad\u7f51\u672c\u5730\u6a21\u5f0f\u4e0d\u5e94\u8bf7\u6c42 embed.diagrams.net\uff0c\u5b9e\u9645\u8bf7\u6c42 ${onlineEditorDocumentRequests} \u6b21`)
  check(returnDurationMs < 1_500, `\u8fd4\u56de\u5df2\u6253\u5f00\u7684\u753b\u5e03\u5e94\u5728 1.5 \u79d2\u5185\u5b8c\u6210\uff0c\u5b9e\u9645 ${returnDurationMs}ms`)

  if (failures.length) {
    throw new Error(`\u53ef\u89c6\u5316\u753b\u5e03\u56de\u5f52\u6d4b\u8bd5\u5931\u8d25\uff1a\n- ${failures.join('\n- ')}`)
  }

  console.log(JSON.stringify({ localEditorDocumentRequests, onlineEditorDocumentRequests, returnDurationMs, dialogs }))
} finally {
  await page?.close({ runBeforeUnload: false }).catch(() => undefined)
  if (application) {
    const appProcess = application.process()
    let forceClose
    const forcedClose = new Promise((resolve) => {
      forceClose = setTimeout(() => {
        appProcess.kill()
        resolve(undefined)
      }, 5_000)
    })
    await Promise.race([
      application.close().catch(() => undefined),
      forcedClose,
    ])
    clearTimeout(forceClose)
  }
  await rm(userDataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined)
}

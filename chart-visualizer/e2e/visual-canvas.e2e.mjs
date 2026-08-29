import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageInfo = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'))
const expectedAppVersion = String(packageInfo.version)
const packagedExecutable = process.env.FENGSHA_E2E_EXECUTABLE?.trim()
const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'fengsha-visual-e2e-'))
const failures = []
const rendererErrors = []
let application
let applicationProcess
let page

function check(condition, message) {
  if (!condition) failures.push(message)
}

try {
  application = await electron.launch({
    cwd: projectRoot,
    ...(packagedExecutable ? { executablePath: packagedExecutable } : {}),
    args: packagedExecutable
      ? [`--user-data-dir=${userDataDirectory}`]
      : [
          path.join(projectRoot, 'dist-electron', 'main.cjs'),
          `--user-data-dir=${userDataDirectory}`,
        ],
    env: {
      ...process.env,
      FENGSHA_DESKTOP_PORT: '43829',
    },
    timeout: 30_000,
  })
  applicationProcess = application.process()

  page = await application.firstWindow()
  page.on('pageerror', (error) => rendererErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') rendererErrors.push(message.text())
  })
  await page.waitForLoadState('domcontentloaded')
  if (packagedExecutable) {
    const installedVersion = page.getByText(new RegExp(`\\u667a\\u80fd\\u5236\\u56fe\\u5de5\\u4f5c\\u53f0 \\u00b7 v${expectedAppVersion.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`))
    await installedVersion.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined)
    check(await installedVersion.count() === 1, `\u5df2\u5b89\u88c5\u7a0b\u5e8f\u754c\u9762\u5e94\u663e\u793a v${expectedAppVersion}`)
  }
  await page.waitForFunction(() => Boolean(localStorage.getItem('mermaid-workbench-v2')), null, { timeout: 10_000 })
  await page.evaluate(() => {
    const key = 'mermaid-workbench-v2'
    const saved = JSON.parse(localStorage.getItem(key) || '{}')
    saved.state ||= {}
    saved.state.preferences ||= {}
    saved.state.preferences.aiEnabledModels = [{ provider: 'cpa', model: 'gpt-5.6-terra', vision: false }]
    saved.state.preferences.aiSelectedModel = 'cpa:gpt-5.6-terra'
    localStorage.setItem(key, JSON.stringify(saved))
  })
  await page.route(/\/api\/ai$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        providers: [
          { id: 'cpa', label: 'CPA AI', configured: true, baseUrl: 'https://cpa.example/v1', builtIn: true },
          { id: 'deepseek', label: 'DeepSeek', configured: false, baseUrl: 'https://api.deepseek.com', builtIn: true },
          { id: 'custom', label: '自定义 API', configured: false, baseUrl: '', builtIn: false },
        ],
      }),
    })
  })
  await page.route(/\/api\/ai\/stream$/, async (route) => {
    const result = {
      requestId: 'installed-attachment-history',
      action: 'explain',
      summary: '\u5df2\u8bc6\u522b\u622a\u56fe\u5e76\u4fdd\u7559\u9644\u4ef6\u8bb0\u5f55\u3002',
      code: '',
      changes: [],
      provider: 'cpa',
      model: 'gpt-5.6-terra',
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson; charset=utf-8',
      body: `${JSON.stringify({ type: 'delta', text: '{"summary":"\\u5df2\\u8bc6\\u522b\\u622a\\u56fe"' })}\n${JSON.stringify({ type: 'result', result })}\n`,
    })
  })
  await page.reload()
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

  await page.evaluate(() => {
    window.__fengshaMermaidSvgContent = ''
    const originalCreateObjectURL = URL.createObjectURL.bind(URL)
    URL.createObjectURL = function captureMermaidSvg(blob) {
      if (blob.type.includes('image/svg+xml')) void blob.text().then((content) => { window.__fengshaMermaidSvgContent = content })
      return originalCreateObjectURL(blob)
    }
  })
  await page.getByRole('button', { name: '\u5bfc\u51fa\u5f53\u524d\u56fe\u8868' }).click()
  await page.getByRole('button', { name: /^SVG/ }).click()
  await page.getByRole('button', { name: '\u4e0b\u8f7d SVG' }).click()
  await page.waitForFunction(() => Boolean(window.__fengshaMermaidSvgContent), null, { timeout: 8_000 })
  const mermaidSvg = await page.evaluate(() => window.__fengshaMermaidSvgContent)
  check(!/<foreignObject\b/i.test(mermaidSvg), '\u4e3b\u754c\u9762 Mermaid SVG \u5bfc\u51fa\u4e0d\u5e94\u6b8b\u7559 foreignObject HTML \u6587\u5b57')
  check((mermaidSvg.match(/<text\b/gi) ?? []).length > 0, '\u4e3b\u754c\u9762 Mermaid SVG \u5bfc\u51fa\u5e94\u5305\u542b\u539f\u751f SVG text')
  for (const label of ['\u5ba2\u6237', '\u63d0\u4ea4\u8ba2\u5355', '\u9500\u552e', '\u4ed3\u5e93', '\u7269\u6d41']) {
    check(mermaidSvg.includes(label), `\u4e3b\u754c\u9762 Mermaid SVG \u5bfc\u51fa\u4e22\u5931\u6587\u5b57\uff1a${label}`)
  }

  await page.getByRole('button', { name: '\u8bbe\u7f6e' }).click()
  await page.getByRole('button', { name: /\u753b\u5e03\u5f15\u64ce/ }).click()
  check(await page.getByText('draw.io v31.1.8 \u5df2\u5185\u7f6e').count() === 1, '\u8bbe\u7f6e\u9875\u5e94\u663e\u793a\u5f53\u524d\u5185\u7f6e\u5f15\u64ce\u7248\u672c')
  check(await page.getByRole('radio', { name: /\u672c\u5730\u5185\u7f6e/ }).getAttribute('aria-checked') === 'true', '\u65b0\u5b89\u88c5\u5e94\u9ed8\u8ba4\u4f7f\u7528\u672c\u5730\u5f15\u64ce')
  await page.getByRole('button', { name: '\u5173\u95ed' }).click()

  await page.getByRole('button', { name: /\u8fdb\u5165\u53ef\u89c6\u5316\u753b\u5e03/ }).click()
  await page.locator('.visual-canvas-frame.is-visible').waitFor({ state: 'visible', timeout: 30_000 })
  check(await page.locator('.visual-canvas-state.is-ready').count() === 1, '\u672c\u5730\u5f15\u64ce\u5e94\u8fdb\u5165\u5df2\u5c31\u7eea\u72b6\u6001')
  await page.evaluate(() => {
    window.__fengshaCapturedDownloads = []
    window.__fengshaLastBlobContent = ''
    window.__fengshaVisualPngMeta = null
    const originalCreateObjectURL = URL.createObjectURL.bind(URL)
    URL.createObjectURL = function captureBlob(blob) {
      void blob.text().then((content) => { window.__fengshaLastBlobContent = content })
      if (blob.type.includes('image/png')) {
        void blob.slice(0, 24).arrayBuffer().then((buffer) => {
          const view = new DataView(buffer)
          window.__fengshaVisualPngMeta = { width: view.getUint32(16), height: view.getUint32(20), type: blob.type }
        })
      }
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
  await page.locator('.toast-notice').waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined)
  const exportNotice = await page.locator('.toast-notice').textContent({ timeout: 5_000 }).catch(() => '')
  check(exportNotice.includes('\u5df2\u751f\u6210\u5e76\u5f00\u59cb\u4e0b\u8f7d') && exportNotice.endsWith('.svg'), '\u5bfc\u51fa完成后应显示包含文件名的成功提示')
  const download = await downloadPromise
  const exportError = await page.locator('.visual-export-error').textContent().catch(() => null)
  check(!exportError, `可视化 SVG 专业质量检查或导出失败：${exportError}`)
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
  check(/<rect\b[^>]*data-fengsha-export-background="true"[^>]*fill="#ffffff"/.test(exportedSvg), '\u5bfc\u51fa SVG \u5e94\u5185\u7f6e\u5b9e\u4f53\u767d\u8272\u80cc\u666f\uff0c\u907f\u514d\u900f\u660e\u753b\u5e03\u5728\u6df1\u8272\u67e5\u770b\u5668\u4e2d\u4f7f\u6587\u5b57\u4e0d\u53ef\u89c1')
  const expectedPortableLabels = [
    '\u5ba2\u6237', '\u9500\u552e', '\u4ed3\u5e93', '\u7269\u6d41',
    '\u63d0\u4ea4\u8ba2\u5355', '\u5b8c\u6210\u4ed8\u6b3e', '\u786e\u8ba4\u6536\u8d27', '\u6838\u5bf9\u8ba2\u5355',
    '\u786e\u8ba4\u4ea4\u671f', '\u9501\u5b9a\u5e93\u5b58', '\u62e3\u8d27\u4e0e\u5305\u88c5', '\u63fd\u6536', '\u914d\u9001',
    '\u4fe1\u606f\u6709\u8bef', '\u901a\u8fc7', '\u51fa\u5e93\u4ea4\u63a5',
  ]
  for (const label of expectedPortableLabels) {
    check(exportedSvg.includes(label), `\u5bfc\u51fa SVG \u7684\u539f\u751f\u6587\u5b57\u4e22\u5931\uff1a${label}`)
  }
  const renderProbe = await page.evaluate(({ svgSource, labels }) => {
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:2000px;height:1200px;overflow:visible'
    host.innerHTML = svgSource
    document.body.appendChild(host)
    const svg = host.querySelector('svg')
    const textElements = Array.from(host.querySelectorAll('text'))
    const labelResults = labels.map((label) => {
      const element = textElements.find((candidate) => candidate.textContent?.includes(label))
      if (!element) return { label, found: false, width: 0, height: 0, fill: '', fontWeight: 0, stroke: '', strokeWidth: 0 }
      const bounds = element.getBBox()
      const computed = getComputedStyle(element)
      const rawWeight = computed.fontWeight
      const fontWeight = rawWeight === 'normal' ? 400 : rawWeight === 'bold' ? 700 : Number.parseInt(rawWeight, 10) || 400
      return { label, found: true, width: bounds.width, height: bounds.height, fill: computed.fill, fontWeight, stroke: computed.stroke, strokeWidth: Number.parseFloat(computed.strokeWidth) || 0 }
    })
    const background = host.querySelector('[data-fengsha-export-background="true"]')
    const backgroundBounds = background instanceof SVGGraphicsElement ? background.getBBox() : null
    const viewBox = svg?.viewBox.baseVal
    const result = {
      labels: labelResults,
      background: backgroundBounds && viewBox ? {
        coversViewBox: backgroundBounds.x <= viewBox.x
          && backgroundBounds.y <= viewBox.y
          && backgroundBounds.x + backgroundBounds.width >= viewBox.x + viewBox.width
          && backgroundBounds.y + backgroundBounds.height >= viewBox.y + viewBox.height,
        fill: background ? getComputedStyle(background).fill : '',
      } : null,
    }
    host.remove()
    return result
  }, { svgSource: exportedSvg, labels: expectedPortableLabels })
  for (const label of renderProbe.labels) {
    check(label.found && label.width > 0 && label.height > 0, `\u5bfc\u51fa SVG \u4e2d\u7684\u6587\u5b57\u6ca1\u6709\u5b9e\u9645\u6e32\u67d3\uff1a${label.label}`)
    check(!/^(?:none|transparent|rgba\(0, 0, 0, 0\))$/i.test(label.fill), `\u5bfc\u51fa SVG \u4e2d\u7684\u6587\u5b57\u989c\u8272\u4e0d\u53ef\u89c1\uff1a${label.label}`)
  }
  const normalActionLabels = new Set(['提交订单', '完成付款', '确认收货', '核对订单', '确认交期', '锁定库存', '拣货与包装', '揽收', '配送', '出库交接'])
  for (const label of renderProbe.labels.filter((item) => normalActionLabels.has(item.label))) {
    check(label.fontWeight <= 500, `可视化画布 SVG 的普通节点文字不应变粗：${label.label}，字重 ${label.fontWeight}`)
    check(label.stroke === 'none' || label.strokeWidth === 0, `可视化画布 SVG 的普通节点文字不应继承边框描边：${label.label}，${label.stroke} ${label.strokeWidth}`)
  }
  check(renderProbe.background?.coversViewBox === true, '\u5bfc\u51fa SVG \u7684\u767d\u8272\u80cc\u666f\u5fc5\u987b\u8986\u76d6\u5b8c\u6574\u753b\u5e03')
  check(renderProbe.background?.fill === 'rgb(255, 255, 255)', '\u5bfc\u51fa SVG \u7684\u80cc\u666f\u5fc5\u987b\u662f\u4e0d\u900f\u660e\u767d\u8272')
  check(!exportedSvg.includes('<foreignObject'), '\u5bfc\u51fa SVG \u4e0d\u5e94\u4f9d\u8d56 Windows \u67e5\u770b\u5668\u65e0\u6cd5\u7a33\u5b9a\u663e\u793a\u7684 HTML foreignObject')
  check(!exportedSvg.includes('light-dark('), '\u5bfc\u51fa SVG \u4e0d\u5e94\u4fdd\u7559\u67e5\u770b\u5668\u517c\u5bb9\u6027\u4e0d\u7a33\u5b9a\u7684 light-dark \u6837\u5f0f')
  if (await page.getByText('\u5bfc\u51fa\u53ef\u89c6\u5316\u753b\u5e03').count()) await page.getByRole('button', { name: '\u5173\u95ed' }).click()
  await page.getByRole('button', { name: /\u5bfc\u51fa\u5f53\u524d\u56fe\u8868/ }).click()
  await page.getByRole('radio', { name: /PNG \u56fe\u7247/ }).click()
  await page.getByRole('button', { name: '\u4e0b\u8f7d\u6587\u4ef6' }).click()
  await Promise.race([
    page.waitForFunction(() => Boolean(window.__fengshaVisualPngMeta), null, { timeout: 30_000 }),
    page.locator('.visual-export-error').waitFor({ state: 'visible', timeout: 30_000 }),
  ]).catch(() => undefined)
  const pngExportError = await page.locator('.visual-export-error').textContent().catch(() => null)
  check(!pngExportError, `可视化 PNG 专业质量检查或导出失败：${pngExportError}`)
  const visualPng = await page.evaluate(() => window.__fengshaVisualPngMeta)
  const viewBoxParts = exportedSvg.match(/\bviewBox=["']([^"']+)["']/i)?.[1].trim().split(/[ ,]+/).map(Number) ?? []
  const sourceWidth = viewBoxParts[2] || 0
  const sourceHeight = viewBoxParts[3] || 0
  const expectedScale = Math.min(16, Math.max(1, 4800 / Math.max(1, sourceWidth, sourceHeight)))
  check(visualPng?.type === 'image/png', `可视化画布应从统一 SVG 底稿生成真正的 PNG，实际 ${visualPng?.type}`)
  check(visualPng?.width === Math.ceil(sourceWidth * Math.floor(expectedScale * 100) / 100), `可视化画布 PNG 宽度异常，SVG ${sourceWidth}，PNG ${visualPng?.width}`)
  check(visualPng?.height === Math.ceil(sourceHeight * Math.floor(expectedScale * 100) / 100), `可视化画布 PNG 高度异常，SVG ${sourceHeight}，PNG ${visualPng?.height}`)
  if (process.env.FENGSHA_CAPTURE_QUALITY === '1') {
    await writeFile(path.join(projectRoot, 'test-results', 'visual-canvas-quality.svg'), exportedSvg, 'utf8')
  }
  if (await page.getByText('\u5bfc\u51fa\u53ef\u89c6\u5316\u753b\u5e03').count()) await page.getByRole('button', { name: '\u5173\u95ed' }).click()
  const aiButton = page.getByRole('button', { name: /AI \u52a9\u624b/ })
  check(await aiButton.isEnabled(), '\u53ef\u89c6\u5316\u753b\u5e03\u6a21\u5f0f\u5fc5\u987b\u80fd\u6253\u5f00 AI \u52a9\u624b')
  check(await page.getByRole('button', { name: /\u5207\u6362\u5230\u6e90\u7801\u753b\u5e03/ }).count() === 1, '\u753b\u5e03\u5fc5\u987b\u63d0\u4f9b\u660e\u786e\u7684\u201c\u6e90\u7801\u753b\u5e03\u201d\u5207\u6362\u5165\u53e3')
  await aiButton.click()
  await page.locator('.visual-ai-assistant').waitFor({ state: 'visible' })
  await page.getByText(/\u5df2\u8bc6\u522b\u5f53\u524d\u53ef\u89c6\u5316\u753b\u5e03/).waitFor({ state: 'visible', timeout: 8_000 }).catch(() => undefined)
  const visualContext = await page.locator('.ai-context-strip').textContent().catch(() => '')
  check(/\u5df2\u8bc6\u522b\u5f53\u524d\u53ef\u89c6\u5316\u753b\u5e03/.test(visualContext || ''), `AI 未取得当前可视化画布：${visualContext}`)
  const screenshotPastePrevented = await page.locator('#visual-ai-prompt').evaluate((textarea) => {
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (character) => character.charCodeAt(0))
    const clipboard = new DataTransfer()
    clipboard.items.add(new File([bytes], 'image.png', { type: 'image/png' }))
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard })
    textarea.dispatchEvent(event)
    return event.defaultPrevented
  })
  await page.locator('.ai-attachment-list img').waitFor({ state: 'visible', timeout: 5_000 })
  check(screenshotPastePrevented, '\u5728 AI \u8f93\u5165\u6846\u7c98\u8d34\u622a\u56fe\u5e94\u7531\u9644\u4ef6\u6d41\u7a0b\u63a5\u6536')
  check((await page.locator('.ai-attachment-list').textContent()).includes('\u526a\u8d34\u677f\u622a\u56fe-'), '\u7c98\u8d34\u7684\u622a\u56fe\u5e94\u663e\u793a\u660e\u786e\u6587\u4ef6\u540d\u548c\u7f29\u7565\u56fe')
  check(await page.getByText('\u5f53\u524d\u6a21\u578b\u672a\u542f\u7528\u56fe\u7247\u8bc6\u522b\u3002\u8bf7\u79fb\u9664\u56fe\u7247\u6216\u5207\u6362\u5230\u652f\u6301\u56fe\u7247\u7684\u6a21\u578b\u3002').count() === 0, 'CPA GPT 5.6 \u4e0d\u5e94\u88ab\u65e7\u7248 vision=false \u914d\u7f6e\u8bef\u5224\u4e3a\u4e0d\u652f\u6301\u56fe\u7247')
  await page.locator('#visual-ai-prompt').fill('\u6839\u636e\u8fd9\u5f20\u622a\u56fe\u4f18\u5316\u6d41\u7a0b')
  await page.locator('.ai-send-button').click()
  await page.locator('.ai-message-attachments img').waitFor({ state: 'visible', timeout: 8_000 })
  check((await page.locator('.ai-message-attachments').textContent()).includes('\u526a\u8d34\u677f\u622a\u56fe-'), '\u53d1\u9001\u540e\u7684\u5386\u53f2\u6d88\u606f\u5e94\u663e\u793a\u622a\u56fe\u7f29\u7565\u56fe\u548c\u6587\u4ef6\u540d')
  await page.getByText('\u5df2\u8bc6\u522b\u622a\u56fe\u5e76\u4fdd\u7559\u9644\u4ef6\u8bb0\u5f55\u3002').waitFor({ state: 'visible', timeout: 8_000 })
  await page.locator('.ai-running-card').waitFor({ state: 'hidden', timeout: 8_000 })
  await page.locator('details.ai-template-menu').evaluate((details) => { details.open = true })
  check(await page.getByRole('button', { name: /\u4f18\u5316\u7ed3\u6784/ }).count() === 1, '\u753b\u5e03 AI \u5e94\u63d0\u4f9b\u7ed3\u6784\u4f18\u5316\u63d0\u793a\u8bcd\u6a21\u677f')
  check(await page.getByRole('button', { name: /\u4ece\u63cf\u8ff0\u521b\u5efa/ }).count() === 1, '\u753b\u5e03 AI \u5e94\u63d0\u4f9b\u4ece\u63cf\u8ff0\u521b\u5efa\u7684\u63d0\u793a\u8bcd\u6a21\u677f')
  await page.getByRole('button', { name: /\u4f18\u5316\u7ed3\u6784/ }).click()
  check((await page.getByLabel(/\u63cf\u8ff0\u8981\u5b8c\u6210\u7684\u5de5\u4f5c/).inputValue()).includes('\u4e1a\u52a1\u76ee\u6807'), '\u70b9\u51fb\u4e13\u4e1a\u6a21\u677f\u5e94\u628a\u63d0\u793a\u8bcd\u52a0\u5165\u8f93\u5165\u6846')
  await page.getByRole('button', { name: '\u5173\u95ed\u753b\u5e03 AI' }).click()

  await page.getByRole('button', { name: /\u5207\u6362\u5230\u6e90\u7801\u753b\u5e03/ }).click()
  await page.locator('.editor-preview-workspace').waitFor({ state: 'visible' })

  const returnStarted = Date.now()
  check(await page.locator('.document-row').count() === 1, '\u540c\u4e00\u56fe\u8868\u7684 Mermaid \u4e0e\u53ef\u89c6\u5316\u6a21\u5f0f\u5e94\u53ea\u663e\u793a\u4e00\u4e2a\u9879\u76ee')
  check((await page.locator('.document-row').textContent()).includes('\u53cc\u753b\u5e03'), '\u5df2\u5efa\u7acb\u53ef\u89c6\u5316\u6a21\u5f0f\u7684\u9879\u76ee\u5e94\u663e\u793a\u53cc\u753b\u5e03\u6807\u8bc6')
  await page.getByRole('button', { name: /\u8fdb\u5165\u53ef\u89c6\u5316\u753b\u5e03/ }).click()
  await page.locator('.visual-canvas-frame.is-visible').waitFor({ state: 'visible', timeout: 30_000 })
  const returnDurationMs = Date.now() - returnStarted
  check(await page.locator('.document-row').count() === 1, '\u91cd\u590d\u8fdb\u5165\u53ef\u89c6\u5316\u753b\u5e03\u4e0d\u5f97\u521b\u5efa\u91cd\u590d\u9879\u76ee')

  check(localEditorDocumentRequests === 1, `\u8fd4\u56de\u5df2\u6253\u5f00\u7684\u753b\u5e03\u4e0d\u5e94\u91cd\u65b0\u542f\u52a8\u672c\u5730\u5f15\u64ce\uff0c\u5b9e\u9645\u8bf7\u6c42 ${localEditorDocumentRequests} \u6b21`)
  check(onlineEditorDocumentRequests === 0, `\u65ad\u7f51\u672c\u5730\u6a21\u5f0f\u4e0d\u5e94\u8bf7\u6c42 embed.diagrams.net\uff0c\u5b9e\u9645\u8bf7\u6c42 ${onlineEditorDocumentRequests} \u6b21`)
  check(returnDurationMs < 3_000, `\u8fd4\u56de\u5df2\u6253\u5f00\u7684\u753b\u5e03\u5e94\u5728 3 \u79d2\u5185\u5b8c\u6210\uff0c\u5b9e\u9645 ${returnDurationMs}ms`)

  await page.getByRole('button', { name: /\u5207\u6362\u5230\u6e90\u7801\u753b\u5e03/ }).click()
  await page.evaluate(() => {
    window.__fengshaCloseRequests = 0
    window.fengshaDesktop?.onCloseRequested(() => { window.__fengshaCloseRequests += 1 })
  })
  const closeEvent = page.waitForEvent('close', { timeout: 8_000 }).then(() => true).catch(() => false)
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  const closed = await closeEvent
  const closeDiagnostics = closed ? null : {
    rendererRequests: await page.evaluate(() => window.__fengshaCloseRequests).catch(() => -1),
    persistedWorkspace: await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('mermaid-workbench-v2') || '{}')?.state
      const active = state?.documents?.find((document) => document.id === state?.activeDocumentId)
      return { activeDocumentId: state?.activeDocumentId, activeEngine: active?.engine, activeTitle: active?.title }
    }).catch(() => null),
    sourceWorkspaceVisible: await page.locator('.editor-preview-workspace').isVisible().catch(() => false),
    rendererErrors,
    windows: await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => ({
      destroyed: window.isDestroyed(),
      visible: window.isVisible(),
      url: window.webContents.isDestroyed() ? '' : window.webContents.getURL(),
    }))).catch(() => []),
  }
  check(closed, `\u70b9\u51fb\u684c\u9762\u7a97\u53e3\u5173\u95ed\u6309\u94ae\u540e\uff0c\u65e0\u672a\u4fdd\u5b58\u53d8\u66f4\u65f6\u5e94\u6b63\u5e38\u9000\u51fa\uff1a${JSON.stringify(closeDiagnostics)}`)

  if (failures.length) {
    throw new Error(`\u53ef\u89c6\u5316\u753b\u5e03\u56de\u5f52\u6d4b\u8bd5\u5931\u8d25\uff1a\n- ${failures.join('\n- ')}`)
  }

  console.log(JSON.stringify({ localEditorDocumentRequests, onlineEditorDocumentRequests, returnDurationMs, dialogs, visualPng, portableLabelStyles: renderProbe.labels }))
} finally {
  await page?.close({ runBeforeUnload: false }).catch(() => undefined)
  if (application) {
    let forceClose
    const forcedClose = new Promise((resolve) => {
      forceClose = setTimeout(() => {
        if (applicationProcess && !applicationProcess.killed) applicationProcess.kill()
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

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const realFixture = process.env.FENGSHA_LABEL_FIXTURE?.trim()
const packagedExecutable = process.env.FENGSHA_E2E_EXECUTABLE?.trim()
const expectedVersion = process.env.FENGSHA_EXPECT_VERSION?.trim()
const fallbackSource = `flowchart TB
  START["开始"] --> NOTE["实线：SAP 800资料已确认的主数据关系或业务角色"]
  NOTE --> OTHER["其他外购件<br/>IH线圈盘／传感器／阀组／硅胶件／紧固件等"]`
const originalSource = realFixture ? await readFile(realFixture, 'utf8') : fallbackSource
const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'fengsha-label-e2e-'))
const failures = []
let application
let page
const fidelitySamples = realFixture
  ? [
      '采购申请／采购订单具体跨工厂与采购单据类型待核实',
      '附件与包装饭勺／汤勺／量杯／电源线彩箱／泡沫／说明书／标签等',
      '其他SKU的内锅锅坯／内锅／外锅',
    ]
  : ['实线：SAP 800资料已确认的主数据关系或业务角色']

function check(condition, message) {
  if (!condition) failures.push(message)
}

async function measuredOverflow(svgSource) {
  return page.evaluate((markup) => {
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-100000px;top:0;opacity:0;pointer-events:none'
    host.innerHTML = markup
    document.body.appendChild(host)
    let count = 0
    host.querySelectorAll('.node').forEach((node) => {
      const shape = node.querySelector('.label-container, rect, polygon, ellipse, path')
      const text = node.querySelector('text')
      const foreignObject = node.querySelector('foreignObject')
      if (!(shape instanceof SVGGraphicsElement)) return
      const shapeBox = shape.getBBox()
      if (text instanceof SVGGraphicsElement) {
        const textBox = text.getBBox()
        if (shapeBox.width > 0 && textBox.width > shapeBox.width - 12) count += 1
        return
      }
      if (foreignObject instanceof SVGForeignObjectElement) {
        const label = foreignObject.querySelector('.nodeLabel')
        const width = shapeBox.width - 12
        const contentWidth = Math.max(label?.scrollWidth || 0, label?.parentElement?.scrollWidth || 0, label?.getBoundingClientRect().width || 0)
        if (label && width > 0 && contentWidth > width) count += 1
      }
    })
    host.remove()
    return count
  }, svgSource)
}

async function previewQuality() {
  return page.locator('[data-rendered-diagram] svg').evaluate((svg, expectedLabels) => {
    const compact = (value) => String(value || '').replace(/[\s\u200B-\u200D\uFEFF]+/g, '')
    const renderedText = compact(svg.textContent)
    const parseWeight = (value) => value === 'normal' ? 400 : value === 'bold' ? 700 : Number.parseInt(value, 10) || 400
    let clippedForeignObjects = 0
    const clipDetails = []
    svg.querySelectorAll('.node foreignObject').forEach((foreignObject) => {
      const content = foreignObject.firstElementChild
      if (!(content instanceof HTMLElement)) return
      const declaredWidth = Number(foreignObject.getAttribute('width')) || foreignObject.getBoundingClientRect().width
      const declaredHeight = Number(foreignObject.getAttribute('height')) || foreignObject.getBoundingClientRect().height
      const scrollWidth = Math.max(content.scrollWidth, content.firstElementChild?.scrollWidth || 0)
      const scrollHeight = Math.max(content.scrollHeight, content.firstElementChild?.scrollHeight || 0)
      if (scrollWidth > declaredWidth + 0.5 || scrollHeight > declaredHeight + 0.5) {
        clippedForeignObjects += 1
        clipDetails.push({
          text: compact(content.textContent),
          declaredWidth,
          declaredHeight,
          scrollWidth,
          scrollHeight,
          overflow: getComputedStyle(foreignObject).overflow,
          contentOverflow: getComputedStyle(content).overflow,
        })
      }
    })
    const labelStyles = expectedLabels.map((label) => {
      const element = [...svg.querySelectorAll('.node foreignObject .nodeLabel')]
        .find((candidate) => compact(candidate.textContent).includes(compact(label)))
      const computed = element ? getComputedStyle(element) : null
      return {
        label,
        found: Boolean(element),
        fontWeight: parseWeight(computed?.fontWeight || ''),
        fontFamily: computed?.fontFamily || '',
        stroke: computed?.webkitTextStrokeWidth || '0px',
      }
    })
    return {
      clippedForeignObjects,
      clipDetails,
      missingLabels: expectedLabels.filter((label) => !renderedText.includes(compact(label))),
      labelStyles,
      viewBox: svg.getAttribute('viewBox'),
    }
  }, fidelitySamples)
}

async function exportedSvgQuality(svgSource) {
  return page.evaluate(({ markup, expectedLabels }) => {
    const compact = (value) => String(value || '').replace(/[\s\u200B-\u200D\uFEFF]+/g, '')
    const parseWeight = (value) => value === 'normal' ? 400 : value === 'bold' ? 700 : Number.parseInt(value, 10) || 400
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-100000px;top:0;opacity:0;pointer-events:none'
    host.innerHTML = markup
    document.body.appendChild(host)
    const svg = host.querySelector('svg')
    const viewBox = svg?.viewBox?.baseVal
    const fontSizes = []
    let overlappingLines = 0
    let labelsOutsideShapes = 0
    svg?.querySelectorAll('.node').forEach((node) => {
      const shape = node.querySelector('.label-container, rect, polygon, ellipse, path')
      const text = node.querySelector('text')
      if (!(shape instanceof SVGGraphicsElement) || !(text instanceof SVGGraphicsElement)) return
      const shapeBox = shape.getBoundingClientRect()
      const textBox = text.getBoundingClientRect()
      if (textBox.left < shapeBox.left - 1 || textBox.right > shapeBox.right + 1 || textBox.top < shapeBox.top - 1 || textBox.bottom > shapeBox.bottom + 1) labelsOutsideShapes += 1
      const spans = [...text.querySelectorAll('tspan')]
      const lineBoxes = spans.map((span) => span.getBBox()).filter((box) => box.width > 0 && box.height > 0)
      for (let index = 1; index < lineBoxes.length; index += 1) {
        if (lineBoxes[index].top < lineBoxes[index - 1].bottom - 0.5) overlappingLines += 1
      }
      const fontSize = Number.parseFloat(getComputedStyle(text).fontSize)
      if (Number.isFinite(fontSize)) fontSizes.push(fontSize)
    })
    fontSizes.sort((a, b) => a - b)
    const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 16
    const containScale = viewBox?.width && viewBox?.height ? Math.min(3840 / viewBox.width, 2160 / viewBox.height) : 0
    const labelStyles = expectedLabels.map((label) => {
      const element = [...(svg?.querySelectorAll('.node text') ?? [])]
        .find((candidate) => compact(candidate.textContent).includes(compact(label)))
      const computed = element ? getComputedStyle(element) : null
      return {
        label,
        found: Boolean(element),
        fontWeight: parseWeight(computed?.fontWeight || ''),
        fontFamily: computed?.fontFamily || '',
        stroke: computed?.stroke || 'none',
        strokeWidth: Number.parseFloat(computed?.strokeWidth || '0') || 0,
      }
    })
    const result = {
      missingLabels: expectedLabels.filter((label) => !compact(svg?.textContent).includes(compact(label))),
      labelStyles,
      overlappingLines,
      labelsOutsideShapes,
      viewBox: viewBox ? { width: viewBox.width, height: viewBox.height } : null,
      medianFontSize,
      effectiveFontSizeOn4kScreen: medianFontSize * containScale,
      aspectRatio: viewBox?.height ? viewBox.width / viewBox.height : 0,
    }
    host.remove()
    return result
  }, { markup: svgSource, expectedLabels: fidelitySamples })
}

try {
  application = await electron.launch({
    cwd: projectRoot,
    ...(packagedExecutable ? { executablePath: packagedExecutable } : {}),
    args: packagedExecutable
      ? [`--user-data-dir=${userDataDirectory}`]
      : [path.join(projectRoot, 'dist-electron', 'main.cjs'), `--user-data-dir=${userDataDirectory}`],
    env: { ...process.env, FENGSHA_DESKTOP_PORT: '43839' },
    timeout: 30_000,
  })
  const runtimeVersion = await application.evaluate(({ app }) => app.getVersion())
  if (expectedVersion) check(runtimeVersion === expectedVersion, `运行版本应为 ${expectedVersion}，实际 ${runtimeVersion}`)
  page = await application.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => Boolean(localStorage.getItem('mermaid-workbench-v2')), null, { timeout: 10_000 })
  if (process.env.FENGSHA_ISOLATE_LABEL_CSS === '1') {
    await page.addStyleTag({ content: 'svg, svg * { box-sizing: content-box !important; }' })
  }

  if (realFixture) {
    await page.locator('input[type="file"]').setInputFiles(realFixture)
  } else {
    await page.locator('input[type="file"]').setInputFiles({ name: 'label-overflow.mmd', mimeType: 'text/plain', buffer: Buffer.from(fallbackSource) })
  }
  const expectedTitle = realFixture ? path.basename(realFixture, path.extname(realFixture)) : 'label-overflow'
  await page.waitForFunction((title) => {
    const saved = JSON.parse(localStorage.getItem('mermaid-workbench-v2') || '{}')
    const state = saved.state || {}
    return state.documents?.find((item) => item.id === state.activeDocumentId)?.title === title
  }, expectedTitle, { timeout: 10_000 })
  await page.locator('.render-badge.success').waitFor({ state: 'visible', timeout: 20_000 })
  const expectedRenderedText = realFixture ? 'P1 3L内锅' : '实线：SAP 800'
  await page.waitForFunction((text) => {
    const compact = (value) => String(value || '').replace(/[\s\u200B-\u200D\uFEFF]+/g, '')
    return compact(document.querySelector('[data-rendered-diagram]')?.textContent).includes(compact(text))
  }, expectedRenderedText, { timeout: 20_000 })

  const beforeSvg = await page.locator('[data-rendered-diagram] svg').evaluate((svg) => svg.outerHTML)
  const overflowBefore = await measuredOverflow(beforeSvg)
  const previewBefore = await previewQuality()
  if (process.env.FENGSHA_CAPTURE_QUALITY === '1') await page.screenshot({ path: path.join(projectRoot, 'test-results', 'label-preview-before.png'), fullPage: true })
  check(previewBefore.missingLabels.length === 0, `修复前预览已经丢字：${previewBefore.missingLabels.join('；')}`)
  check(previewBefore.clippedForeignObjects === 0, `自动编译后仍有 ${previewBefore.clippedForeignObjects} 个 HTML 标签被裁切`)

  await page.getByRole('button', { name: '修复单元格内容可见' }).click()
  await page.locator('.canvas-feedback').waitFor({ state: 'visible', timeout: 8_000 })
  const repairFeedback = await page.locator('.canvas-feedback').textContent()
  check(/所有单元格文字均在边框内/.test(repairFeedback || ''), `可见性复核反馈异常：${repairFeedback}`)
  await page.waitForTimeout(900)
  await page.locator('.render-badge.success').waitFor({ state: 'visible', timeout: 10_000 })
  const repairedCode = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('mermaid-workbench-v2') || '{}')
    const state = saved.state || {}
    return state.documents?.find((item) => item.id === state.activeDocumentId)?.code || ''
  })
  const normalizedOriginalSource = originalSource.replace(/\r\n/g, '\n').trimEnd()
  const normalizedStoredSource = repairedCode.replace(/\r\n/g, '\n').trimEnd()
  check(normalizedStoredSource === normalizedOriginalSource, '自动编译和可见性复核不应改写用户源码')

  const repairedSvg = await page.locator('[data-rendered-diagram] svg').evaluate((svg) => svg.outerHTML)
  const overflowAfter = await measuredOverflow(repairedSvg)
  check(overflowAfter === 0, `自动修复并重新布局后不应残留文字溢出，实际 ${overflowAfter}`)
  const previewAfter = await previewQuality()
  if (process.env.FENGSHA_CAPTURE_QUALITY === '1') await page.screenshot({ path: path.join(projectRoot, 'test-results', 'label-preview-after.png'), fullPage: true })
  check(previewAfter.missingLabels.length === 0, `自动修复后预览丢字：${previewAfter.missingLabels.join('；')}`)
  check(previewAfter.clippedForeignObjects === 0, `自动修复后仍有 ${previewAfter.clippedForeignObjects} 个 HTML 标签被裁切`)

  await page.evaluate(() => {
    window.__fengshaPngMeta = null
    window.__fengshaSvgContent = ''
    const originalCreateObjectURL = URL.createObjectURL.bind(URL)
    URL.createObjectURL = function captureExport(blob) {
      if (blob.type.includes('image/png')) {
        void blob.slice(0, 24).arrayBuffer().then((buffer) => {
          const view = new DataView(buffer)
          window.__fengshaPngMeta = { width: view.getUint32(16), height: view.getUint32(20) }
        })
      }
      if (blob.type.includes('image/svg+xml')) void blob.text().then((content) => { window.__fengshaSvgContent = content })
      return originalCreateObjectURL(blob)
    }
  })

  await page.getByRole('button', { name: '导出当前图表' }).click()
  const exportPreviewMetrics = await page.locator('.export-preview-card svg').evaluate((svg) => ({ viewBox: svg.getAttribute('viewBox'), width: svg.getAttribute('width'), height: svg.getAttribute('height') }))
  const estimated = await page.locator('dt', { hasText: '预计尺寸' }).locator('..').locator('dd').textContent()
  const estimatedMatch = estimated?.match(/(\d+)\s*×\s*(\d+)/)
  check(Boolean(estimatedMatch), 'PNG 导出应显示实际像素尺寸')
  const pngButton = page.getByRole('button', { name: '下载 PNG' })
  const pngEnabled = await pngButton.isEnabled()
  const exportWarning = await page.locator('.export-warning, .export-inline-note').allTextContents()
  check(exportPreviewMetrics.viewBox?.split(/\s+/).length === 4, '导出预览应保留完整 SVG viewBox')
  check(pngEnabled, `PNG 下载按钮不应被禁用：${exportWarning.join('；')}`)
  await pngButton.click()
  await page.waitForFunction(() => Boolean(window.__fengshaPngMeta), null, { timeout: 45_000 })
  const actualPng = await page.evaluate(() => window.__fengshaPngMeta)
  check(actualPng?.width === Number(estimatedMatch?.[1]) && actualPng?.height === Number(estimatedMatch?.[2]), `PNG 实际尺寸应与界面承诺一致，预计 ${estimatedMatch?.[1]}×${estimatedMatch?.[2]}，实际 ${actualPng?.width}×${actualPng?.height}`)

  await page.getByRole('button', { name: '导出当前图表' }).click()
  await page.getByRole('button', { name: /^SVG/ }).click()
  await page.getByRole('button', { name: '下载 SVG' }).click()
  await page.waitForFunction(() => Boolean(window.__fengshaSvgContent), null, { timeout: 15_000 })
  const exportedSvg = await page.evaluate(() => window.__fengshaSvgContent)
  const exportedOverflow = await measuredOverflow(exportedSvg)
  const svgQuality = await exportedSvgQuality(exportedSvg)
  check(!exportedSvg.includes('<foreignObject'), 'SVG 导出不应残留 foreignObject')
  check(exportedOverflow === 0, `SVG 导出不应残留文字越界或重叠，实际 ${exportedOverflow}`)
  check(svgQuality.missingLabels.length === 0, `SVG 导出丢字：${svgQuality.missingLabels.join('；')}`)
  check(svgQuality.overlappingLines === 0, `SVG 导出存在 ${svgQuality.overlappingLines} 处行内文字重叠`)
  check(svgQuality.labelsOutsideShapes === 0, `SVG 导出存在 ${svgQuality.labelsOutsideShapes} 个标签超出所属图形`)
  for (const previewStyle of previewAfter.labelStyles) {
    const exportedStyle = svgQuality.labelStyles.find((item) => item.label === previewStyle.label)
    check(Boolean(exportedStyle?.found), `SVG 导出缺少字重对比样本：${previewStyle.label}`)
    check(exportedStyle?.fontWeight === previewStyle.fontWeight, `SVG 导出字重与预览不一致：${previewStyle.label}，预览 ${previewStyle.fontWeight}，导出 ${exportedStyle?.fontWeight}`)
    check((exportedStyle?.strokeWidth || 0) === 0 || exportedStyle?.stroke === 'none', `SVG 导出文字不应带描边：${previewStyle.label}，${exportedStyle?.stroke} ${exportedStyle?.strokeWidth}`)
  }
  const pngLongEdge = Math.max(actualPng?.width || 0, actualPng?.height || 0)
  const sourceLongEdge = Math.max(svgQuality.viewBox?.width || 1, svgQuality.viewBox?.height || 1)
  const rasterFontSize = svgQuality.medianFontSize * pngLongEdge / sourceLongEdge
  check(pngLongEdge >= 4400 && pngLongEdge <= 5200, `智能高清 PNG 长边应接近 4800px，实际 ${pngLongEdge}px`)
  check(rasterFontSize >= 18, `PNG 原始像素字号仅 ${rasterFontSize.toFixed(1)}px，放大查看仍不清晰`)
  // Aspect ratio is a business-layout choice (a long SOP can be intentionally
  // vertical). Guard only corrupt/near-zero geometry here; visual composition
  // remains an explicit review item in the quality receipt.
  check(Number.isFinite(svgQuality.aspectRatio) && svgQuality.aspectRatio >= 0.1 && svgQuality.aspectRatio <= 10, `全图宽高比 ${svgQuality.aspectRatio.toFixed(2)} 不可用`)

  const evidence = { fixture: realFixture || 'embedded', runtimeVersion, overflowBefore, overflowAfter, exportedOverflow, previewBefore, previewAfter, svgQuality, repairFeedback, estimated, actualPng }
  if (failures.length) throw new Error(`文字与高清导出回归失败：\n- ${failures.join('\n- ')}\n证据：${JSON.stringify(evidence)}`)
  console.log(JSON.stringify(evidence))
} finally {
  await application?.close().catch(() => undefined)
  await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
}

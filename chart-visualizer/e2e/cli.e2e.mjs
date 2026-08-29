import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import packageInfo from '../package.json' with { type: 'json' }

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(projectRoot, 'dist-cli', 'fengsha-diagram.cjs')
const source = path.join(projectRoot, 'e2e', 'fixtures', 'cli-process.mmd')
const plan = path.join(projectRoot, 'e2e', 'fixtures', 'cli-drawio-plan.json')
const outputDirectory = await mkdtemp(path.join(tmpdir(), 'fengsha-cli-e2e-'))
const unicodeOutputDirectory = path.join(outputDirectory, '中文 空格')
await mkdir(unicodeOutputDirectory)

function check(value, message) {
  if (!value) throw new Error(message)
}

function run(args, input) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: projectRoot,
    input,
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
  })
  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
  let payload = null
  try { payload = line ? JSON.parse(line) : null } catch { /* asserted by caller */ }
  return { ...result, payload }
}

function runAsync(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: projectRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.once('error', reject)
    const timer = setTimeout(() => child.kill(), 120_000)
    child.once('close', (status, signal) => {
      clearTimeout(timer)
      const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
      let payload = null
      try { payload = line ? JSON.parse(line) : null } catch { /* asserted by caller */ }
      resolve({ status, signal, stdout, stderr, payload })
    })
  })
}

try {
  const version = run(['version', '--json'])
  check(version.status === 0 && version.payload?.version === packageInfo.version, `版本命令失败：${version.stderr}`)

  const receiptOutputCollision = run(['deliver', source, '--output', path.join(outputDirectory, 'collision.png'), '--receipt', path.join(outputDirectory, 'collision.png'), '--force', '--json'])
  check(receiptOutputCollision.status === 2, '成品与回执使用同一路径时应返回退出码 2。')
  const receiptInputCollision = run(['visual-check', source, '--receipt', source, '--force', '--json'])
  check(receiptInputCollision.status === 2, '输入与回执使用同一路径时应返回退出码 2。')
  const compileExtensionMismatch = run(['compile', plan, '--target', 'mermaid', '--output', path.join(outputDirectory, 'wrong.drawio'), '--json'])
  check(compileExtensionMismatch.status === 2, 'compile 的目标与扩展名不一致时应返回退出码 2。')

  const validation = run(['validate', source, '--json'])
  check(validation.status === 0 && validation.payload?.diagram?.kind === 'flowchart', `校验命令失败：${validation.stderr || validation.stdout}`)

  const svgPath = path.join(unicodeOutputDirectory, '采购 流程.svg')
  const svgResult = run(['render', source, '--output', svgPath, '--format', 'svg', '--json'])
  check(svgResult.status === 0, `SVG 命令失败：${svgResult.stderr || svgResult.stdout}`)
  const svg = await readFile(svgPath, 'utf8')
  check(svg.startsWith('<svg'), 'SVG 命令成功但没有生成完整 SVG 文件。')
  check(!svg.includes('<foreignObject'), 'CLI SVG 不应残留 foreignObject。')
  check(svg.includes('业务需求') && svg.includes('完成交付'), 'CLI SVG 缺少中文节点文字。')

  const pngPath = path.join(outputDirectory, 'process.png')
  const pngResult = run(['render', source, '--output', pngPath, '--format', 'png', '--json'])
  check(pngResult.status === 0, `PNG 命令失败：${pngResult.stderr || pngResult.stdout}`)
  const png = await readFile(pngPath)
  check(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'PNG 命令成功但没有生成完整 PNG 文件。')
  check(pngResult.payload?.diagram?.outputWidth >= 1000, 'PNG 应使用智能高清尺寸。')

  const deliveredPath = path.join(outputDirectory, 'delivered.png')
  const receiptPath = path.join(outputDirectory, 'delivered.receipt.json')
  const delivered = run(['deliver', source, '--output', deliveredPath, '--format', 'png', '--quality', 'professional', '--receipt', receiptPath, '--json'])
  check(delivered.status === 0 && delivered.payload?.receipt?.acceptance === 'provisional', `可靠交付失败：${delivered.stderr || delivered.stdout}`)
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
  check(receipt.outputSha256 && receipt.visualReview === 'pending', '质量回执缺少哈希或人工视觉状态。')

  const pdfPath = path.join(outputDirectory, 'process.pdf')
  const pdfResult = run(['render', source, '--output', pdfPath, '--format', 'pdf', '--json'])
  check(pdfResult.status === 0, `PDF 命令失败：${pdfResult.stderr || pdfResult.stdout}`)
  const pdf = await readFile(pdfPath)
  check(pdf.subarray(0, 4).toString('ascii') === '%PDF', 'PDF 命令成功但没有生成完整 PDF 文件。')

  const drawioPath = path.join(outputDirectory, 'process.drawio')
  const drawioResult = run(['compile', plan, '--output', drawioPath, '--json'])
  check(drawioResult.status === 0, `draw.io 编译失败：${drawioResult.stderr || drawioResult.stdout}`)
  const drawio = await readFile(drawioPath, 'utf8')
  const planSource = await readFile(plan, 'utf8')
  const planSha256 = createHash('sha256').update(planSource).digest('hex').toUpperCase()
  check(drawio.includes('<mxfile'), 'draw.io 编译成功但没有生成完整 XML 文件。')
  check(drawioResult.payload?.diagram?.nodeCount === 3, 'draw.io 节点统计不正确。')
  check(drawioResult.payload?.receipt?.inputSha256 === planSha256, 'compile 回执必须追溯实际 Plan 输入，而不是派生 XML。')
  const drawioCheck = run(['visual-check', drawioPath, '--quality', 'professional', '--json'])
  check(drawioCheck.status === 0 && drawioCheck.payload?.receipt?.engine === 'drawio', `draw.io 统一质量检查失败：${drawioCheck.stderr || drawioCheck.stdout}`)

  const drawioPngPath = path.join(outputDirectory, 'drawio-direct.png')
  const drawioPngResult = run(['deliver', drawioPath, '--output', drawioPngPath, '--format', 'png', '--quality', 'professional', '--json'])
  check(drawioPngResult.status === 0 && drawioPngResult.payload?.receipt?.engine === 'drawio', `draw.io 直接交付失败：${drawioPngResult.stderr || drawioPngResult.stdout}`)
  const drawioPng = await readFile(drawioPngPath)
  check(drawioPng.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'draw.io 直接交付必须生成完整 PNG。')
  check(drawioPngResult.payload?.diagram?.outputWidth >= 1000, 'draw.io 直接交付应使用智能高清尺寸。')

  const declaredCompressedDrawio = path.join(projectRoot, 'vendor', 'drawio', 'templates', 'basic', 'swimlanes.xml')
  const declaredDrawioValidation = run(['validate', declaredCompressedDrawio, '--json'])
  check(declaredDrawioValidation.status === 0 && declaredDrawioValidation.payload?.diagram?.nodeCount > 0, '带 XML 声明的标准压缩 draw.io 文件应被正确识别和解压。')

  const stdinSvgPath = path.join(outputDirectory, 'stdin.svg')
  const stdinSource = await readFile(source, 'utf8')
  const stdinResult = run(['render', '-', '--output', stdinSvgPath, '--format', 'svg', '--json'], stdinSource)
  check(stdinResult.status === 0, `标准输入渲染失败：${stdinResult.stderr || stdinResult.stdout}`)

  const invalidPath = path.join(outputDirectory, 'invalid.mmd')
  await writeFile(invalidPath, 'flowchart LR\nA -->', 'utf8')
  const invalidResult = run(['validate', invalidPath, '--json'])
  check(invalidResult.status === 3 && invalidResult.payload?.error?.category === 'validation', '非法 Mermaid 应返回退出码 3。')
  const invalidDelivery = run(['deliver', invalidPath, '--output', path.join(outputDirectory, 'invalid.png'), '--json'])
  check(invalidDelivery.status === 3 && invalidDelivery.payload?.error?.category === 'validation', '同一非法 Mermaid 在 deliver 中也应返回校验退出码 3。')

  const emptyPath = path.join(outputDirectory, 'empty.mmd')
  await writeFile(emptyPath, 'flowchart LR\n', 'utf8')
  const emptyResult = run(['visual-check', emptyPath, '--quality', 'professional', '--json'])
  check(emptyResult.status === 6 && emptyResult.payload?.receipt?.counts?.nodes === 0, '空 Mermaid 必须被专业质量门拒绝。')

  const overwriteResult = run(['render', source, '--output', svgPath, '--format', 'svg', '--json'])
  check(overwriteResult.status === 2 && overwriteResult.payload?.error?.category === 'usage', '未指定 --force 时不应覆盖已有文件。')

  const invalidBackground = run(['render', source, '--output', path.join(outputDirectory, 'bad.svg'), '--background', 'url(https://invalid.example)', '--json'])
  check(invalidBackground.status === 4 && invalidBackground.payload?.error?.category === 'render', '非法背景值应被拒绝并返回退出码 4。')

  const rejectedPlanPath = path.join(outputDirectory, 'overlap.json')
  const protectedOutputPath = path.join(outputDirectory, 'protected.drawio')
  const protectedReceiptPath = path.join(outputDirectory, 'protected.receipt.json')
  const protectedContent = 'LAST-KNOWN-GOOD'
  const protectedReceiptContent = '{"state":"LAST-KNOWN-GOOD"}\n'
  await writeFile(rejectedPlanPath, JSON.stringify({
    version: 1,
    mode: 'replace',
    nodes: [
      { id: 'a', type: 'process', label: '节点 A', x: 20, y: 20, width: 160, height: 70 },
      { id: 'b', type: 'process', label: '节点 B', x: 20, y: 20, width: 160, height: 70 },
    ],
    edges: [],
  }), 'utf8')
  await writeFile(protectedOutputPath, protectedContent, 'utf8')
  await writeFile(protectedReceiptPath, protectedReceiptContent, 'utf8')
  const rejected = run(['compile', rejectedPlanPath, '--output', protectedOutputPath, '--receipt', protectedReceiptPath, '--force', '--quality', 'professional', '--json'])
  check(rejected.status === 6 && rejected.payload?.error?.category === 'quality', '重叠节点应返回质量退出码 6。')
  check(await readFile(protectedOutputPath, 'utf8') === protectedContent, '质量失败不得破坏已有成品。')
  check(await readFile(protectedReceiptPath, 'utf8') === protectedReceiptContent, '质量失败不得写入或覆盖质量回执。')

  const atomicOutputPath = path.join(outputDirectory, 'atomic.png')
  const invalidReceiptPath = path.join(outputDirectory, 'receipt-as-directory.json')
  await writeFile(atomicOutputPath, protectedContent, 'utf8')
  await mkdir(invalidReceiptPath)
  const atomicFailure = run(['deliver', source, '--output', atomicOutputPath, '--receipt', invalidReceiptPath, '--force', '--json'])
  check(atomicFailure.status === 2, '回执目标不是普通文件时应在渲染前返回退出码 2。')
  check(await readFile(atomicOutputPath, 'utf8') === protectedContent, '回执目标无效时不得覆盖已有成品。')

  const concurrentOutputPath = path.join(outputDirectory, 'concurrent.png')
  await writeFile(concurrentOutputPath, protectedContent, 'utf8')
  const concurrentResults = await Promise.all([
    runAsync(['deliver', source, '--output', concurrentOutputPath, '--force', '--json']),
    runAsync(['deliver', source, '--output', concurrentOutputPath, '--force', '--json']),
  ])
  const concurrentStatuses = concurrentResults.map((result) => result.status).sort((left, right) => left - right)
  check(concurrentStatuses[0] === 0 && concurrentStatuses[1] === 2, `并发覆盖必须恰好一个成功、一个锁冲突：${JSON.stringify(concurrentResults)}`)
  const concurrentPng = await readFile(concurrentOutputPath)
  check(concurrentPng.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), '并发覆盖后的最终成品必须是完整 PNG。')

  process.stdout.write(`${JSON.stringify({
    ok: true,
    version: version.payload.version,
    svg: { bytes: Buffer.byteLength(svg), foreignObjects: 0 },
    png: { bytes: png.length, width: pngResult.payload.diagram.outputWidth, height: pngResult.payload.diagram.outputHeight },
    pdf: { bytes: pdf.length },
    drawio: { bytes: Buffer.byteLength(drawio), nodes: drawioResult.payload.diagram.nodeCount, edges: drawioResult.payload.diagram.edgeCount, pngBytes: drawioPng.length, inputHashVerified: true },
    delivery: { acceptance: receipt.acceptance, visualReview: receipt.visualReview },
    stdin: true,
    exitCodes: { validation: invalidResult.status, existingOutput: overwriteResult.status, invalidBackground: invalidBackground.status, quality: rejected.status, targetConflict: concurrentStatuses[1] },
  }, null, 2)}\n`)
} finally {
  await rm(outputDirectory, { recursive: true, force: true })
}

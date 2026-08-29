import { spawnSync } from 'node:child_process'
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

try {
  const version = run(['version', '--json'])
  check(version.status === 0 && version.payload?.version === packageInfo.version, `版本命令失败：${version.stderr}`)

  const validation = run(['validate', source, '--json'])
  check(validation.status === 0 && validation.payload?.diagram?.kind === 'flowchart', `校验命令失败：${validation.stderr || validation.stdout}`)

  const svgPath = path.join(unicodeOutputDirectory, '采购 流程.svg')
  const svgResult = run(['render', source, '--output', svgPath, '--format', 'svg', '--json'])
  const svg = await readFile(svgPath, 'utf8')
  check(svgResult.status === 0 && svg.startsWith('<svg'), `SVG 命令失败：${svgResult.stderr || svgResult.stdout}`)
  check(!svg.includes('<foreignObject'), 'CLI SVG 不应残留 foreignObject。')
  check(svg.includes('业务需求') && svg.includes('完成交付'), 'CLI SVG 缺少中文节点文字。')

  const pngPath = path.join(outputDirectory, 'process.png')
  const pngResult = run(['render', source, '--output', pngPath, '--format', 'png', '--json'])
  const png = await readFile(pngPath)
  check(pngResult.status === 0 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `PNG 命令失败：${pngResult.stderr || pngResult.stdout}`)
  check(pngResult.payload?.diagram?.outputWidth >= 1000, 'PNG 应使用智能高清尺寸。')

  const deliveredPath = path.join(outputDirectory, 'delivered.png')
  const receiptPath = path.join(outputDirectory, 'delivered.receipt.json')
  const delivered = run(['deliver', source, '--output', deliveredPath, '--format', 'png', '--quality', 'professional', '--receipt', receiptPath, '--json'])
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
  check(delivered.status === 0 && delivered.payload?.receipt?.acceptance === 'provisional', `可靠交付失败：${delivered.stderr || delivered.stdout}`)
  check(receipt.outputSha256 && receipt.visualReview === 'pending', '质量回执缺少哈希或人工视觉状态。')

  const pdfPath = path.join(outputDirectory, 'process.pdf')
  const pdfResult = run(['render', source, '--output', pdfPath, '--format', 'pdf', '--json'])
  const pdf = await readFile(pdfPath)
  check(pdfResult.status === 0 && pdf.subarray(0, 4).toString('ascii') === '%PDF', `PDF 命令失败：${pdfResult.stderr || pdfResult.stdout}`)

  const drawioPath = path.join(outputDirectory, 'process.drawio')
  const drawioResult = run(['compile', plan, '--output', drawioPath, '--json'])
  const drawio = await readFile(drawioPath, 'utf8')
  check(drawioResult.status === 0 && drawio.includes('<mxfile'), `draw.io 编译失败：${drawioResult.stderr || drawioResult.stdout}`)
  check(drawioResult.payload?.diagram?.nodeCount === 3, 'draw.io 节点统计不正确。')
  const drawioCheck = run(['visual-check', drawioPath, '--quality', 'professional', '--json'])
  check(drawioCheck.status === 0 && drawioCheck.payload?.receipt?.engine === 'drawio', `draw.io 统一质量检查失败：${drawioCheck.stderr || drawioCheck.stdout}`)

  const stdinSvgPath = path.join(outputDirectory, 'stdin.svg')
  const stdinSource = await readFile(source, 'utf8')
  const stdinResult = run(['render', '-', '--output', stdinSvgPath, '--format', 'svg', '--json'], stdinSource)
  check(stdinResult.status === 0, `标准输入渲染失败：${stdinResult.stderr || stdinResult.stdout}`)

  const invalidPath = path.join(outputDirectory, 'invalid.mmd')
  await writeFile(invalidPath, 'flowchart LR\nA -->', 'utf8')
  const invalidResult = run(['validate', invalidPath, '--json'])
  check(invalidResult.status === 3 && invalidResult.payload?.error?.category === 'validation', '非法 Mermaid 应返回退出码 3。')

  const overwriteResult = run(['render', source, '--output', svgPath, '--format', 'svg', '--json'])
  check(overwriteResult.status === 2 && overwriteResult.payload?.error?.category === 'usage', '未指定 --force 时不应覆盖已有文件。')

  const invalidBackground = run(['render', source, '--output', path.join(outputDirectory, 'bad.svg'), '--background', 'url(https://invalid.example)', '--json'])
  check(invalidBackground.status === 4 && invalidBackground.payload?.error?.category === 'render', '非法背景值应被拒绝并返回退出码 4。')

  const rejectedPlanPath = path.join(outputDirectory, 'overlap.json')
  const protectedOutputPath = path.join(outputDirectory, 'protected.drawio')
  const protectedContent = 'LAST-KNOWN-GOOD'
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
  const rejected = run(['compile', rejectedPlanPath, '--output', protectedOutputPath, '--force', '--quality', 'professional', '--json'])
  check(rejected.status === 6 && rejected.payload?.error?.category === 'quality', '重叠节点应返回质量退出码 6。')
  check(await readFile(protectedOutputPath, 'utf8') === protectedContent, '质量失败不得破坏已有成品。')

  process.stdout.write(`${JSON.stringify({
    ok: true,
    version: version.payload.version,
    svg: { bytes: Buffer.byteLength(svg), foreignObjects: 0 },
    png: { bytes: png.length, width: pngResult.payload.diagram.outputWidth, height: pngResult.payload.diagram.outputHeight },
    pdf: { bytes: pdf.length },
    drawio: { bytes: Buffer.byteLength(drawio), nodes: drawioResult.payload.diagram.nodeCount, edges: drawioResult.payload.diagram.edgeCount },
    delivery: { acceptance: receipt.acceptance, visualReview: receipt.visualReview },
    stdin: true,
    exitCodes: { validation: invalidResult.status, existingOutput: overwriteResult.status, invalidBackground: invalidBackground.status, quality: rejected.status },
  }, null, 2)}\n`)
} finally {
  await rm(outputDirectory, { recursive: true, force: true })
}

import path from 'node:path'
import type { CliQualityProfile, CliRenderFormat, CliThemeId, CliWorkerRequest } from '../src/cli-contracts.ts'

export const CLI_EXIT = {
  success: 0,
  usage: 2,
  validation: 3,
  render: 4,
  io: 5,
  quality: 6,
  visualReview: 7,
  timeout: 8,
  internal: 10,
} as const

const themes = new Set<CliThemeId>(['paper', 'blueprint', 'executive', 'forest', 'midnight'])
const formats = new Set<CliRenderFormat>(['svg', 'png', 'jpeg', 'pdf'])

export type CliParsedCommand =
  | { command: 'help'; json: boolean }
  | { command: 'version'; json: boolean }
  | {
      command: 'validate' | 'render' | 'compile' | 'deliver' | 'visual-check'
      input: string
      output?: string
      json: boolean
      force: boolean
      timeoutMs: number
      receipt?: string
      request: CliWorkerRequest
    }

export class CliUsageError extends Error {}

function optionValue(argv: string[], index: number, name: string): { value: string; next: number } {
  const argument = argv[index]
  const equal = argument.indexOf('=')
  if (equal >= 0) return { value: argument.slice(equal + 1), next: index }
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new CliUsageError(`${name} 缺少参数值。`)
  return { value, next: index + 1 }
}

function parseNumber(value: string, name: string, minimum: number, maximum: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new CliUsageError(`${name} 必须是 ${minimum} 到 ${maximum} 之间的数字。`)
  }
  return parsed
}

function normalizeFormat(value: string): CliRenderFormat {
  const normalized = value.toLowerCase() === 'jpg' ? 'jpeg' : value.toLowerCase()
  if (!formats.has(normalized as CliRenderFormat)) {
    throw new CliUsageError('--format 仅支持 svg、png、jpeg、jpg、pdf。')
  }
  return normalized as CliRenderFormat
}

function inferFormat(output: string | undefined): CliRenderFormat {
  const extension = output ? path.extname(output).slice(1).toLowerCase() : ''
  if (!extension) return 'svg'
  return normalizeFormat(extension)
}

export function parseCliArguments(argv: string[], cwd = process.cwd()): CliParsedCommand {
  let commandName = ''
  let input = ''
  let output: string | undefined
  let format: CliRenderFormat | undefined
  let theme: CliThemeId = 'paper'
  let scale: number | 'auto' = 'auto'
  let padding = 32
  let background = 'white'
  let json = false
  let force = false
  let timeoutMs = 60_000
  let quality: CliQualityProfile = 'professional'
  let target: 'mermaid' | 'drawio' = 'drawio'
  let receipt: string | undefined
  let formatWasExplicit = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--json') { json = true; continue }
    if (argument === '--force' || argument === '-f') { force = true; continue }
    if (argument === '--help' || argument === '-h') { commandName = 'help'; continue }
    if (argument === '--version' || argument === '-v') { commandName = 'version'; continue }
    if (argument === '--output' || argument === '-o' || argument.startsWith('--output=')) {
      const result = optionValue(argv, index, '--output')
      output = path.resolve(cwd, result.value)
      index = result.next
      continue
    }
    if (argument === '--format' || argument.startsWith('--format=')) {
      const result = optionValue(argv, index, '--format')
      format = normalizeFormat(result.value)
      formatWasExplicit = true
      index = result.next
      continue
    }
    if (argument === '--quality' || argument.startsWith('--quality=')) {
      const result = optionValue(argv, index, '--quality')
      if (result.value !== 'standard' && result.value !== 'professional') throw new CliUsageError('--quality 仅支持 standard 或 professional。')
      quality = result.value
      index = result.next
      continue
    }
    if (argument === '--target' || argument.startsWith('--target=')) {
      const result = optionValue(argv, index, '--target')
      if (result.value !== 'mermaid' && result.value !== 'drawio') throw new CliUsageError('--target 仅支持 mermaid 或 drawio。')
      target = result.value
      index = result.next
      continue
    }
    if (argument === '--receipt' || argument.startsWith('--receipt=')) {
      const result = optionValue(argv, index, '--receipt')
      receipt = path.resolve(cwd, result.value)
      index = result.next
      continue
    }
    if (argument === '--theme' || argument.startsWith('--theme=')) {
      const result = optionValue(argv, index, '--theme')
      if (!themes.has(result.value as CliThemeId)) throw new CliUsageError('--theme 仅支持 paper、blueprint、executive、forest、midnight。')
      theme = result.value as CliThemeId
      index = result.next
      continue
    }
    if (argument === '--scale' || argument.startsWith('--scale=')) {
      const result = optionValue(argv, index, '--scale')
      scale = result.value === 'auto' ? 'auto' : parseNumber(result.value, '--scale', 0.1, 4)
      index = result.next
      continue
    }
    if (argument === '--padding' || argument.startsWith('--padding=')) {
      const result = optionValue(argv, index, '--padding')
      padding = parseNumber(result.value, '--padding', 0, 256)
      index = result.next
      continue
    }
    if (argument === '--background' || argument.startsWith('--background=')) {
      const result = optionValue(argv, index, '--background')
      background = result.value
      index = result.next
      continue
    }
    if (argument === '--timeout' || argument.startsWith('--timeout=')) {
      const result = optionValue(argv, index, '--timeout')
      timeoutMs = parseNumber(result.value, '--timeout', 1, 300) * 1000
      index = result.next
      continue
    }
    if (argument.startsWith('-') && argument !== '-') throw new CliUsageError(`未知参数：${argument}`)
    if (!commandName) { commandName = argument; continue }
    if (!input) { input = argument; continue }
    throw new CliUsageError(`多余参数：${argument}`)
  }

  if (!commandName || commandName === 'help') return { command: 'help', json }
  if (commandName === 'version') return { command: 'version', json }
  if (!['validate', 'render', 'compile', 'deliver', 'visual-check'].includes(commandName)) throw new CliUsageError(`未知命令：${commandName}`)
  if (!input) throw new CliUsageError(`${commandName} 命令需要输入文件；使用 - 可从标准输入读取。`)
  const command = commandName as 'validate' | 'render' | 'compile' | 'deliver' | 'visual-check'

  if ((command === 'render' || command === 'deliver') && !output) {
    if (input === '-') throw new CliUsageError('从标准输入渲染时必须使用 --output 指定输出文件。')
    output = path.resolve(cwd, `${path.basename(input, path.extname(input))}.${(format ?? 'svg') === 'jpeg' ? 'jpg' : format ?? 'svg'}`)
  }
  if (command === 'compile' && !output) {
    if (input === '-') throw new CliUsageError('从标准输入编译时必须使用 --output 指定输出文件。')
    output = path.resolve(cwd, `${path.basename(input, path.extname(input))}.${target === 'drawio' ? 'drawio' : 'mmd'}`)
  }

  const resolvedInput = input === '-' ? '-' : path.resolve(cwd, input)
  if (output && resolvedInput !== '-' && path.resolve(output).toLowerCase() === resolvedInput.toLowerCase()) {
    throw new CliUsageError('输入文件与输出文件不能是同一路径。')
  }
  if (output && formatWasExplicit && (command === 'render' || command === 'deliver')) {
    const extensionFormat = inferFormat(output)
    if (extensionFormat !== format) throw new CliUsageError(`输出扩展名与 --format 不一致：.${path.extname(output).slice(1)} / ${format}。`)
  }
  const request: CliWorkerRequest = command === 'compile'
    ? { protocolVersion: 2, operation: target === 'drawio' ? 'compile-drawio' : 'compile-mermaid', source: '', quality }
    : {
        protocolVersion: 2,
        operation: command,
        source: '',
        quality,
        render: { format: format ?? inferFormat(output), theme, scale, padding, background },
      }
  return {
    command,
    input: resolvedInput,
    output,
    json,
    force,
    timeoutMs,
    receipt,
    request,
  }
}

export const CLI_HELP = `风沙图表 CLI

用法：
  fengsha-diagram validate <文件|-> [--theme paper] [--json]
  fengsha-diagram render <文件|-> [-o 输出文件] [--format svg|png|jpg|pdf]
  fengsha-diagram deliver <文件|-> [-o 输出文件] [--quality professional] [--receipt 回执.json]
  fengsha-diagram visual-check <文件|-> [--quality professional] [--receipt 回执.json]
  fengsha-diagram compile <计划.json|-> [--target drawio|mermaid] [-o 输出文件]
  fengsha-diagram version [--json]

常用选项：
  -o, --output <路径>       输出文件；文件输入时可自动推导
      --format <格式>       svg、png、jpg、jpeg、pdf
      --theme <主题>        paper、blueprint、executive、forest、midnight
      --scale <auto|0.1-4> PNG/JPG/PDF 清晰度，默认 auto（长边约 4800px）
      --padding <0-256>     四周留白，默认 32
      --background <颜色>  white、transparent 或 CSS 颜色，默认 white
      --quality <档位>     standard 或 professional，默认 professional
      --target <目标>      compile 输出 drawio 或 mermaid
      --receipt <路径>     另存机器可读质量回执
  -f, --force               允许覆盖已有输出文件
      --timeout <秒>        最长处理时间，默认 60，范围 1-300
      --json                只输出单行机器可读 JSON
  -h, --help                显示帮助
  -v, --version             显示版本

示例：
  fengsha-diagram validate process.mmd --json
  fengsha-diagram render process.mmd -o process.png --theme paper --json
  fengsha-diagram deliver process.mmd -o process.png --quality professional --receipt process.receipt.json --json
  fengsha-diagram visual-check process.drawio --quality professional --json
  type process.mmd | fengsha-diagram render - -o process.svg --format svg --json
  fengsha-diagram compile plan.json -o process.drawio --json
`

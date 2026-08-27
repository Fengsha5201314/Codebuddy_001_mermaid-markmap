import path from 'node:path'
import type { CliRenderFormat, CliThemeId, CliWorkerRequest } from '../src/cli-contracts.ts'

export const CLI_EXIT = {
  success: 0,
  usage: 2,
  validation: 3,
  render: 4,
  io: 5,
  internal: 10,
} as const

const themes = new Set<CliThemeId>(['paper', 'blueprint', 'executive', 'forest', 'midnight'])
const formats = new Set<CliRenderFormat>(['svg', 'png', 'jpeg', 'pdf'])

export type CliParsedCommand =
  | { command: 'help'; json: boolean }
  | { command: 'version'; json: boolean }
  | {
      command: 'validate' | 'render' | 'compile'
      input: string
      output?: string
      json: boolean
      force: boolean
      timeoutMs: number
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
  if (!['validate', 'render', 'compile'].includes(commandName)) throw new CliUsageError(`未知命令：${commandName}`)
  if (!input) throw new CliUsageError(`${commandName} 命令需要输入文件；使用 - 可从标准输入读取。`)
  const command = commandName as 'validate' | 'render' | 'compile'

  if (command === 'render' && !output) {
    if (input === '-') throw new CliUsageError('从标准输入渲染时必须使用 --output 指定输出文件。')
    output = path.resolve(cwd, `${path.basename(input, path.extname(input))}.${(format ?? 'svg') === 'jpeg' ? 'jpg' : format ?? 'svg'}`)
  }
  if (command === 'compile' && !output) {
    if (input === '-') throw new CliUsageError('从标准输入编译时必须使用 --output 指定输出文件。')
    output = path.resolve(cwd, `${path.basename(input, path.extname(input))}.drawio`)
  }

  const resolvedInput = input === '-' ? '-' : path.resolve(cwd, input)
  const request: CliWorkerRequest = command === 'compile'
    ? { protocolVersion: 1, operation: 'compile-drawio', source: '' }
    : {
        protocolVersion: 1,
        operation: command,
        source: '',
        render: { format: format ?? inferFormat(output), theme, scale, padding, background },
      }
  return {
    command,
    input: resolvedInput,
    output,
    json,
    force,
    timeoutMs,
    request,
  }
}

export const CLI_HELP = `风沙图表 CLI

用法：
  fengsha-diagram validate <文件|-> [--theme paper] [--json]
  fengsha-diagram render <文件|-> [-o 输出文件] [--format svg|png|jpg|pdf]
  fengsha-diagram compile <计划.json|-> [-o 输出.drawio]
  fengsha-diagram version [--json]

常用选项：
  -o, --output <路径>       输出文件；文件输入时可自动推导
      --format <格式>       svg、png、jpg、jpeg、pdf
      --theme <主题>        paper、blueprint、executive、forest、midnight
      --scale <auto|0.1-4> PNG/JPG/PDF 清晰度，默认 auto（长边约 4800px）
      --padding <0-256>     四周留白，默认 32
      --background <颜色>  white、transparent 或 CSS 颜色，默认 white
  -f, --force               允许覆盖已有输出文件
      --timeout <秒>        最长处理时间，默认 60，范围 1-300
      --json                只输出单行机器可读 JSON
  -h, --help                显示帮助
  -v, --version             显示版本

示例：
  fengsha-diagram validate process.mmd --json
  fengsha-diagram render process.mmd -o process.png --theme paper --json
  type process.mmd | fengsha-diagram render - -o process.svg --format svg --json
  fengsha-diagram compile plan.json -o process.drawio --json
`

import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import packageInfo from '../package.json' with { type: 'json' }
import { CLI_WORKER_FLAG, type CliWorkerEnvelope, type CliWorkerResult } from '../src/cli-contracts.ts'
import { CLI_EXIT, CLI_HELP, CliUsageError, parseCliArguments } from './args.ts'

const MAX_INPUT_BYTES = 5 * 1024 * 1024

interface MachineResult {
  ok: boolean
  command: string
  version: string
  input?: string
  output?: string
  durationMs?: number
  error?: { category: string; message: string }
  diagram?: Record<string, unknown>
}

function emit(result: MachineResult, json: boolean) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }
  if (!result.ok) {
    process.stderr.write(`错误：${result.error?.message ?? '命令执行失败。'}\n`)
    return
  }
  if (result.command === 'version') {
    process.stdout.write(`风沙图表 CLI v${result.version}\n`)
    return
  }
  const size = result.diagram?.outputWidth && result.diagram?.outputHeight
    ? ` · ${result.diagram.outputWidth}×${result.diagram.outputHeight}`
    : ''
  const output = result.output ? `\n输出：${result.output}` : ''
  process.stdout.write(`完成：${result.command}${size}${output}\n`)
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_INPUT_BYTES) throw new Error('标准输入超过 5 MB 上限。')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function readSource(input: string): Promise<string> {
  if (input === '-') return readStdin()
  const details = await stat(input)
  if (!details.isFile()) throw new Error(`输入路径不是文件：${input}`)
  if (details.size > MAX_INPUT_BYTES) throw new Error('输入文件超过 5 MB 上限。')
  return readFile(input, 'utf8')
}

async function exists(filePath: string) {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function workerLaunch(requestPath: string, resultPath: string) {
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  if (process.versions.electron) {
    return {
      executable: process.execPath,
      args: [CLI_WORKER_FLAG, requestPath, resultPath],
      environment,
    }
  }

  const require = createRequire(__filename)
  const electronExecutable = require('electron') as string
  const desktopMain = path.resolve(__dirname, '..', 'dist-electron', 'main.cjs')
  return {
    executable: electronExecutable,
    args: [desktopMain, CLI_WORKER_FLAG, requestPath, resultPath],
    environment,
  }
}

async function runWorker(envelope: CliWorkerEnvelope, timeoutMs: number): Promise<CliWorkerResult> {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'fengsha-cli-'))
  const requestPath = path.join(temporaryDirectory, 'request.json')
  const resultPath = path.join(temporaryDirectory, 'result.json')
  try {
    await writeFile(requestPath, `${JSON.stringify(envelope)}\n`, { encoding: 'utf8', mode: 0o600 })
    const launch = workerLaunch(requestPath, resultPath)
    const workerError = await new Promise<string | null>((resolve, reject) => {
      const child = spawn(launch.executable, launch.args, {
        env: launch.environment,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      })
      let stderr = ''
      child.stderr?.on('data', (chunk) => {
        if (stderr.length < 16_384) stderr += String(chunk)
      })
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error(`处理超过 ${Math.round(timeoutMs / 1000)} 秒，已安全终止。`))
      }, timeoutMs)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        resolve(code === 0 ? null : stderr.trim() || `渲染进程异常退出（${code ?? 'unknown'}）。`)
      })
    })
    if (workerError) throw new Error(workerError)
    if (!(await exists(resultPath))) throw new Error('渲染进程没有返回结果。')
    return JSON.parse(await readFile(resultPath, 'utf8')) as CliWorkerResult
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

function failureExit(category: CliWorkerResult['category']) {
  if (category === 'validation') return CLI_EXIT.validation
  if (category === 'render') return CLI_EXIT.render
  if (category === 'io') return CLI_EXIT.io
  return CLI_EXIT.internal
}

async function main() {
  const argv = process.argv.slice(2)
  const wantsJson = argv.includes('--json')
  let parsed: ReturnType<typeof parseCliArguments>
  try {
    parsed = parseCliArguments(argv)
  } catch (error) {
    const message = error instanceof Error ? error.message : '参数不正确。'
    emit({ ok: false, command: 'usage', version: packageInfo.version, error: { category: 'usage', message } }, wantsJson)
    if (!wantsJson) process.stderr.write('\n使用 fengsha-diagram --help 查看完整说明。\n')
    return CLI_EXIT.usage
  }

  if (parsed.command === 'help') {
    if (parsed.json) emit({ ok: true, command: 'help', version: packageInfo.version }, true)
    else process.stdout.write(CLI_HELP)
    return CLI_EXIT.success
  }
  if (parsed.command === 'version') {
    emit({ ok: true, command: 'version', version: packageInfo.version }, parsed.json)
    return CLI_EXIT.success
  }

  const startedAt = Date.now()
  try {
    if (parsed.output && !parsed.force && await exists(parsed.output)) {
      throw new CliUsageError(`输出文件已存在：${parsed.output}；如需覆盖请增加 --force。`)
    }
    const source = await readSource(parsed.input)
    if (!source.trim()) throw new CliUsageError('输入内容为空。')
    const result = await runWorker({
      request: { ...parsed.request, source },
      outputPath: parsed.output,
      overwrite: parsed.force,
    }, parsed.timeoutMs)
    if (!result.ok) {
      emit({
        ok: false,
        command: parsed.command,
        version: packageInfo.version,
        input: parsed.input,
        output: parsed.output,
        durationMs: Date.now() - startedAt,
        error: { category: result.category ?? 'internal', message: result.message ?? '命令执行失败。' },
      }, parsed.json)
      return failureExit(result.category)
    }
    emit({
      ok: true,
      command: parsed.command,
      version: packageInfo.version,
      input: parsed.input,
      output: result.outputPath,
      durationMs: Date.now() - startedAt,
      diagram: result.metadata as Record<string, unknown> | undefined,
    }, parsed.json)
    return CLI_EXIT.success
  } catch (error) {
    const usage = error instanceof CliUsageError
    emit({
      ok: false,
      command: parsed.command,
      version: packageInfo.version,
      input: parsed.input,
      output: parsed.output,
      durationMs: Date.now() - startedAt,
      error: {
        category: usage ? 'usage' : 'io',
        message: error instanceof Error ? error.message : '文件处理失败。',
      },
    }, parsed.json)
    return usage ? CLI_EXIT.usage : CLI_EXIT.io
  }
}

void main().then((code) => { process.exitCode = code }).catch((error) => {
  const wantsJson = process.argv.includes('--json')
  emit({
    ok: false,
    command: 'internal',
    version: packageInfo.version,
    error: { category: 'internal', message: error instanceof Error ? error.message : 'CLI 内部错误。' },
  }, wantsJson)
  process.exitCode = CLI_EXIT.internal
})

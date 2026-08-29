import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { CliUsageError, parseCliArguments } from './args.ts'

const cwd = path.resolve('C:/workspace')

describe('CLI argument parser', () => {
  it('builds a deterministic render request and infers PNG from the output', () => {
    const parsed = parseCliArguments(['render', 'process.mmd', '-o', 'out/process.png', '--theme', 'blueprint', '--json'], cwd)
    expect(parsed).toMatchObject({
      command: 'render',
      input: path.resolve(cwd, 'process.mmd'),
      output: path.resolve(cwd, 'out/process.png'),
      json: true,
      request: { render: { format: 'png', theme: 'blueprint', scale: 'auto', padding: 32 } },
    })
  })

  it('supports standard input when an explicit output is provided', () => {
    const parsed = parseCliArguments(['render', '-', '--output=result.svg', '--format=svg'], cwd)
    expect(parsed).toMatchObject({ command: 'render', input: '-', output: path.resolve(cwd, 'result.svg') })
  })

  it('creates a draw.io compile request', () => {
    const parsed = parseCliArguments(['compile', 'plan.json'], cwd)
    expect(parsed).toMatchObject({
      command: 'compile',
      output: path.resolve(cwd, 'plan.drawio'),
      request: { operation: 'compile-drawio' },
    })
  })

  it('builds professional delivery and Mermaid compile requests', () => {
    expect(parseCliArguments(['deliver', 'process.mmd', '-o', 'process.png', '--receipt', 'receipt.json'], cwd)).toMatchObject({
      command: 'deliver',
      receipt: path.resolve(cwd, 'receipt.json'),
      request: { protocolVersion: 2, operation: 'deliver', quality: 'professional' },
    })
    expect(parseCliArguments(['compile', 'plan.json', '--target', 'mermaid'], cwd)).toMatchObject({
      output: path.resolve(cwd, 'plan.mmd'),
      request: { operation: 'compile-mermaid' },
    })
  })

  it('rejects destructive or misleading path combinations', () => {
    expect(() => parseCliArguments(['render', 'same.svg', '-o', 'same.svg'], cwd)).toThrow(/不能是同一路径/)
    expect(() => parseCliArguments(['render', 'source.mmd', '-o', 'wrong.png', '--format', 'svg'], cwd)).toThrow(/扩展名.*不一致/)
  })

  it('rejects ambiguous stdin output and unsupported options', () => {
    expect(() => parseCliArguments(['render', '-'], cwd)).toThrow(CliUsageError)
    expect(() => parseCliArguments(['render', 'a.mmd', '--format', 'bmp'], cwd)).toThrow(/仅支持/)
    expect(() => parseCliArguments(['render', 'a.mmd', '--scale', '9'], cwd)).toThrow(/0.1 到 4/)
  })
})

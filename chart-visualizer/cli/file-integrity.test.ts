import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  acquireCliTargetLocks,
  CliTargetChangedError,
  CliTargetLockedError,
  commitCliDeliveryTransaction,
  snapshotCliTarget,
} from './file-integrity.ts'

const temporaryDirectories: string[] = []

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fengsha-cli-integrity-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('CLI file integrity boundary', () => {
  it('commits the artifact and receipt as one delivery', async () => {
    const directory = await temporaryDirectory()
    const output = path.join(directory, 'result.png')
    const receipt = path.join(directory, 'result.receipt.json')
    await writeFile(output, 'OLD-OUTPUT')
    await writeFile(receipt, 'OLD-RECEIPT')

    await commitCliDeliveryTransaction({
      overwrite: true,
      output: { path: output, label: '输出文件', payload: 'NEW-OUTPUT', expected: await snapshotCliTarget(output) },
      receipt: { path: receipt, label: '质量回执', payload: 'NEW-RECEIPT', expected: await snapshotCliTarget(receipt) },
    })

    expect(await readFile(output, 'utf8')).toBe('NEW-OUTPUT')
    expect(await readFile(receipt, 'utf8')).toBe('NEW-RECEIPT')
  })

  it('does not touch an old artifact when the receipt target cannot be staged', async () => {
    const directory = await temporaryDirectory()
    const output = path.join(directory, 'protected.png')
    const receiptDirectory = path.join(directory, 'receipt.json')
    await writeFile(output, 'LAST-KNOWN-GOOD')
    await mkdir(receiptDirectory)

    await expect(commitCliDeliveryTransaction({
      overwrite: true,
      output: { path: output, label: '输出文件', payload: 'NEW-OUTPUT', expected: await snapshotCliTarget(output) },
      receipt: { path: receiptDirectory, label: '质量回执', payload: '{}', expected: await snapshotCliTarget(receiptDirectory) },
    })).rejects.toThrow(/不是普通文件/)

    expect(await readFile(output, 'utf8')).toBe('LAST-KNOWN-GOOD')
  })

  it('restores both old files when the second commit step fails', async () => {
    const directory = await temporaryDirectory()
    const output = path.join(directory, 'rollback.png')
    const receipt = path.join(directory, 'rollback.receipt.json')
    await writeFile(output, 'OLD-OUTPUT')
    await writeFile(receipt, 'OLD-RECEIPT')

    await expect(commitCliDeliveryTransaction({
      overwrite: true,
      output: { path: output, label: '输出文件', payload: 'NEW-OUTPUT', expected: await snapshotCliTarget(output) },
      receipt: { path: receipt, label: '质量回执', payload: 'NEW-RECEIPT', expected: await snapshotCliTarget(receipt) },
    }, {
      rename: async (sourcePath, targetPath) => {
        if (targetPath === receipt && String(sourcePath).endsWith('.tmp')) throw new Error('injected receipt commit failure')
        await rename(sourcePath, targetPath)
      },
    })).rejects.toThrow(/injected receipt commit failure/)

    expect(await readFile(output, 'utf8')).toBe('OLD-OUTPUT')
    expect(await readFile(receipt, 'utf8')).toBe('OLD-RECEIPT')
  })

  it('uses the preflight snapshot as a compare-and-swap guard', async () => {
    const directory = await temporaryDirectory()
    const output = path.join(directory, 'cas.png')
    await writeFile(output, 'INITIAL')
    const expected = await snapshotCliTarget(output)
    await writeFile(output, 'EXTERNAL-CHANGE')

    await expect(commitCliDeliveryTransaction({
      overwrite: true,
      output: { path: output, label: '输出文件', payload: 'CLI-CHANGE', expected },
    })).rejects.toBeInstanceOf(CliTargetChangedError)

    expect(await readFile(output, 'utf8')).toBe('EXTERNAL-CHANGE')
  })

  it('allows only one process owner for an overlapping target lock', async () => {
    const directory = await temporaryDirectory()
    const output = path.join(directory, 'locked.png')
    const releaseFirst = await acquireCliTargetLocks([output])
    await expect(acquireCliTargetLocks([output])).rejects.toBeInstanceOf(CliTargetLockedError)
    await releaseFirst()
    const releaseSecond = await acquireCliTargetLocks([output])
    await releaseSecond()
  })
})

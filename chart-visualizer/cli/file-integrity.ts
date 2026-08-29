import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { CliTargetSnapshot } from '../src/cli-contracts.ts'

export class CliTargetLockedError extends Error {}
export class CliTargetChangedError extends Error {}

interface LockOwner {
  pid: number
  token: string
  target: string
  createdAt: string
}

interface HeldLock {
  lockPath: string
  token: string
}

export interface CliCommitTarget {
  path: string
  payload: string | Buffer
  expected?: CliTargetSnapshot
  expectedSha256?: string
  label: string
}

export interface CliDeliveryTransaction {
  overwrite: boolean
  output?: CliCommitTarget
  receipt?: CliCommitTarget
}

interface CliDeliveryFileOperations {
  rename: typeof rename
  remove: typeof rm
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined
}

export function normalizeCliTargetPath(filePath: string): string {
  const resolved = path.resolve(filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function sameCliTargetPath(left: string, right: string): boolean {
  return normalizeCliTargetPath(left) === normalizeCliTargetPath(right)
}

export async function snapshotCliTarget(filePath: string): Promise<CliTargetSnapshot> {
  try {
    const details = await stat(filePath)
    if (!details.isFile()) return { kind: 'other' }
    const content = await readFile(filePath)
    return {
      kind: 'file',
      bytes: content.length,
      sha256: createHash('sha256').update(content).digest('hex').toUpperCase(),
    }
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return { kind: 'missing' }
    throw error
  }
}

export function sameCliTargetSnapshot(left: CliTargetSnapshot, right: CliTargetSnapshot): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind !== 'file') return true
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function processIsAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return errorCode(error) === 'EPERM'
  }
}

async function readLockOwner(lockPath: string): Promise<LockOwner | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const parsed = JSON.parse(await readFile(lockPath, 'utf8')) as Partial<LockOwner>
      if (typeof parsed.pid === 'number' && typeof parsed.token === 'string' && typeof parsed.target === 'string') {
        return parsed as LockOwner
      }
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return null
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return null
}

async function acquireOneLock(lockPath: string, target: string): Promise<HeldLock> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomUUID()
    try {
      const handle = await open(lockPath, 'wx', 0o600)
      try {
        const owner: LockOwner = { pid: process.pid, token, target, createdAt: new Date().toISOString() }
        await handle.writeFile(`${JSON.stringify(owner)}\n`, 'utf8')
        await handle.sync()
      } catch (error) {
        await handle.close().catch(() => undefined)
        await rm(lockPath, { force: true }).catch(() => undefined)
        throw error
      }
      await handle.close()
      return { lockPath, token }
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error
      const owner = await readLockOwner(lockPath)
      if (!owner) {
        const details = await stat(lockPath).catch(() => null)
        if (!details || Date.now() - details.mtimeMs < 30_000) {
          throw new CliTargetLockedError(`目标正在由另一个 CLI 任务处理：${target}`)
        }
        await rm(lockPath, { force: true })
        continue
      }
      if (processIsAlive(owner.pid)) {
        throw new CliTargetLockedError(`目标正在由另一个 CLI 任务处理：${target}`)
      }
      await rm(lockPath, { force: true })
    }
  }
  throw new CliTargetLockedError(`无法取得目标文件锁：${target}`)
}

export async function acquireCliTargetLocks(targetPaths: Array<string | undefined>): Promise<() => Promise<void>> {
  const targets = [...new Map(targetPaths
    .filter((value): value is string => Boolean(value))
    .map((value) => [normalizeCliTargetPath(value), path.resolve(value)] as const)).values()]
  const lockDirectory = path.join(tmpdir(), 'fengsha-diagram-cli-locks')
  await mkdir(lockDirectory, { recursive: true })
  const lockTargets = targets
    .map((target) => ({
      target,
      lockPath: path.join(lockDirectory, `${createHash('sha256').update(normalizeCliTargetPath(target)).digest('hex')}.lock`),
    }))
    .sort((left, right) => left.lockPath.localeCompare(right.lockPath))
  const held: HeldLock[] = []
  try {
    for (const item of lockTargets) held.push(await acquireOneLock(item.lockPath, item.target))
  } catch (error) {
    await releaseCliTargetLocks(held)
    throw error
  }
  return async () => releaseCliTargetLocks(held)
}

async function releaseCliTargetLocks(held: HeldLock[]): Promise<void> {
  for (const item of [...held].reverse()) {
    try {
      const owner = await readLockOwner(item.lockPath)
      if (owner?.token === item.token) await rm(item.lockPath, { force: true })
    } catch {
      // A stale lock is safer than deleting a lock that may now belong to another process.
    }
  }
}

async function assertSnapshot(filePath: string, expected: CliTargetSnapshot, label: string): Promise<void> {
  const current = await snapshotCliTarget(filePath)
  if (!sameCliTargetSnapshot(current, expected)) {
    throw new CliTargetChangedError(`${label}在处理期间被其他程序修改，已取消提交：${filePath}`)
  }
}

export async function commitCliDeliveryTransaction(
  transaction: CliDeliveryTransaction,
  operations: Partial<CliDeliveryFileOperations> = {},
): Promise<void> {
  const move = operations.rename ?? rename
  const remove = operations.remove ?? rm
  const targets = [transaction.output, transaction.receipt].filter((value): value is CliCommitTarget => Boolean(value))
  if (targets.length === 0) return
  if (transaction.output && transaction.receipt && sameCliTargetPath(transaction.output.path, transaction.receipt.path)) {
    throw new Error('输出文件与质量回执不能是同一路径。')
  }

  const token = `${process.pid}.${Date.now()}.${randomUUID()}`
  const items: Array<{
    target: CliCommitTarget
    targetPath: string
    expected: CliTargetSnapshot
    temporaryPath: string
    backupPath: string
    backedUp: boolean
    committed: boolean
  }> = []
  try {
    for (const target of targets) {
      const targetPath = path.resolve(target.path)
      const expected = target.expected ?? await snapshotCliTarget(targetPath)
      if (expected.kind === 'other') throw new Error(`${target.label}路径不是普通文件：${targetPath}`)
      if (expected.kind === 'file' && !transaction.overwrite) throw new Error(`${target.label}已存在：${targetPath}`)
      await mkdir(path.dirname(targetPath), { recursive: true })
      const temporaryPath = `${targetPath}.${token}.tmp`
      const backupPath = `${targetPath}.${token}.bak`
      items.push({ target, targetPath, expected, temporaryPath, backupPath, backedUp: false, committed: false })
      await writeFile(temporaryPath, target.payload, { flag: 'wx', mode: 0o600 })
      if (target.expectedSha256) {
        const temporaryHash = createHash('sha256').update(await readFile(temporaryPath)).digest('hex').toUpperCase()
        if (temporaryHash !== target.expectedSha256.toUpperCase()) {
          throw new Error(`${target.label}临时文件哈希与质量回执不一致，已停止覆盖。`)
        }
      }
    }
  } catch (error) {
    await Promise.all(items.map((item) => remove(item.temporaryPath, { force: true }).catch(() => undefined)))
    throw error
  }

  try {
    for (const item of items) await assertSnapshot(item.targetPath, item.expected, item.target.label)
    for (const item of items) {
      await assertSnapshot(item.targetPath, item.expected, item.target.label)
      if (item.expected.kind === 'file') {
        await move(item.targetPath, item.backupPath)
        item.backedUp = true
      }
      await move(item.temporaryPath, item.targetPath)
      item.committed = true
    }
  } catch (error) {
    const restoreErrors: string[] = []
    for (const item of [...items].reverse()) {
      try {
        if (item.committed || item.backedUp) await remove(item.targetPath, { force: true })
        if (item.backedUp) await move(item.backupPath, item.targetPath)
      } catch (restoreError) {
        restoreErrors.push(`${item.targetPath}: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`)
      }
    }
    if (restoreErrors.length > 0) {
      throw new Error(`CLI 事务提交失败，且旧文件恢复不完整；备份仍保留。${restoreErrors.join('；')}`, { cause: error })
    }
    throw error
  } finally {
    await Promise.all(items.map((item) => remove(item.temporaryPath, { force: true }).catch(() => undefined)))
  }

  await Promise.all(items.map((item) => remove(item.backupPath, { force: true }).catch(() => undefined)))
}

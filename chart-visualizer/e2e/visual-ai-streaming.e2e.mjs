import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packagedExecutable = process.env.FENGSHA_E2E_EXECUTABLE?.trim()
const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'fengsha-visual-ai-e2e-'))
let application
let providerServer

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server.address()))
  })
}

try {
  providerServer = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/v1/models') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ data: [{ id: 'fake-stream-model' }] }))
      return
    }
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end()
      return
    }
    const body = []
    request.on('data', (chunk) => body.push(chunk))
    request.on('end', () => {
      const payload = JSON.parse(Buffer.concat(body).toString('utf8'))
      if (payload.stream !== true) {
        response.writeHead(400).end()
        return
      }
      const isDrawio = payload.messages?.some((message) => message.role === 'system' && message.content.includes('draw.io'))
      const content = JSON.stringify(isDrawio ? {
        action: 'explain',
        summary: '已整理 AI 学习路径，先从基础概念开始。',
        code: '<mxfile><diagram><mxGraphModel><root><mxCell id="stream-visible" value="AI 基础概念" /></root></mxGraphModel></diagram></mxfile>',
        changes: [],
      } : {
        action: 'generate',
        summary: '已实时整理电饭煲完整生产流程。',
        code: {
          schemaVersion: 'fengsha.plan/v1',
          diagramType: 'workflow',
          title: '电饭煲完整生产流程',
          direction: 'LR',
          lanes: [{ id: 'rd', label: '研发' }],
          nodes: [{ id: 'design', type: 'process', label: '产品定义与研发', lane: 'rd', column: 0 }],
          edges: [],
        },
        changes: ['新增产品定义与研发节点'],
      })
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      if (isDrawio) {
        const splitAt = content.indexOf('AI 基础概念') + 'AI 基础概念'.length
        const chunks = [content.slice(0, splitAt), content]
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunks[0] } }] })}\n\n`)
        setTimeout(() => {
          response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunks[1] } }] })}\n\n`)
          response.end('data: [DONE]\n\n')
        }, 3_000)
        return
      }
      const firstEnd = content.indexOf(',"nodes"')
      const secondEnd = content.indexOf('产品定义与研发') + '产品定义与研发'.length
      const chunks = [content.slice(0, firstEnd), content.slice(firstEnd, secondEnd), content.slice(secondEnd)]
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunks[0] } }] })}\n\n`)
      setTimeout(() => response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunks[1] } }] })}\n\n`), 900)
      setTimeout(() => {
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunks[2] } }] })}\n\n`)
        response.end('data: [DONE]\n\n')
      }, 1_800)
    })
  })
  const providerAddress = await listen(providerServer)
  const providerOrigin = `http://127.0.0.1:${providerAddress.port}/v1`

  application = await electron.launch({
    cwd: projectRoot,
    ...(packagedExecutable ? { executablePath: packagedExecutable } : {}),
    args: packagedExecutable
      ? [`--user-data-dir=${userDataDirectory}`]
      : [path.join(projectRoot, 'dist-electron', 'main.cjs'), `--user-data-dir=${userDataDirectory}`],
    env: { ...process.env, FENGSHA_DESKTOP_PORT: '43834' },
    timeout: 30_000,
  })
  const page = await application.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  const saved = await page.evaluate(async ({ baseUrl }) => {
    const response = await fetch('/api/ai/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ provider: 'custom', label: '流式测试', baseUrl, apiKey: 'fake-stream-key' }),
    })
    return { status: response.status, body: await response.json() }
  }, { baseUrl: providerOrigin })
  if (saved.status !== 200) throw new Error(`Unable to configure fake provider: ${JSON.stringify(saved)}`)

  await page.evaluate(() => {
    localStorage.setItem('mermaid-workbench-v2', JSON.stringify({
      state: {
        preferences: {
          aiEnabledModels: [{ provider: 'custom', model: 'fake-stream-model', vision: false }],
          aiSelectedModel: 'custom:fake-stream-model',
          inspectorOpen: false,
        },
      },
      version: 3,
    }))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })

  await page.getByRole('button', { name: '打开 AI 助手' }).click()
  await page.locator('.ai-assistant:not(.visual-ai-assistant)').waitFor({ state: 'visible', timeout: 8_000 })
  const mermaidPrompt = page.locator('#ai-diagram-prompt')
  await mermaidPrompt.fill('生成电饭煲从产品定义到交付售后的完整流程')
  await page.locator('.ai-assistant:not(.visual-ai-assistant) .ai-send-button').click()
  const mermaidLiveOutput = page.locator('.ai-assistant:not(.visual-ai-assistant) .ai-running-card pre')
  await mermaidLiveOutput.waitFor({ state: 'visible', timeout: 8_000 })
  await mermaidLiveOutput.filter({ hasText: 'schemaVersion' }).waitFor({ state: 'visible', timeout: 8_000 })
  const firstMermaidFrame = await mermaidLiveOutput.textContent()
  await mermaidLiveOutput.filter({ hasText: '产品定义与研发' }).waitFor({ state: 'visible', timeout: 8_000 })
  const secondMermaidFrame = await mermaidLiveOutput.textContent()
  if (!firstMermaidFrame?.includes('电饭煲完整生产流程') || firstMermaidFrame === secondMermaidFrame) {
    throw new Error(`Mermaid plan preview did not progress beyond schemaVersion: ${firstMermaidFrame} -> ${secondMermaidFrame}`)
  }
  await page.locator('.ai-message-list article.assistant').filter({ hasText: '已实时整理电饭煲完整生产流程' }).waitFor({ state: 'visible', timeout: 8_000 })
  await page.getByRole('button', { name: '关闭 AI 与工具面板' }).click()

  await page.getByRole('button', { name: /进入可视化画布/ }).click()
  await page.locator('.visual-canvas-frame.is-visible').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByRole('button', { name: /AI 助手/ }).click()
  await page.locator('.visual-ai-assistant').waitFor({ state: 'visible', timeout: 8_000 })

  const prompt = page.locator('#visual-ai-prompt')
  await prompt.fill('把 AI 学习步骤整理成思维导图')
  await page.locator('.ai-send-button').click()
  await page.waitForFunction(() => document.querySelector('#visual-ai-prompt')?.value === '')

  const liveOutput = page.locator('.ai-running-card pre')
  await liveOutput.waitFor({ state: 'visible', timeout: 8_000 })
  const streamedText = await liveOutput.textContent()
  if (!streamedText?.includes('stream-visible') || !streamedText.includes('AI 基础概念')) {
    throw new Error(`Live XML text was not visible: ${streamedText}`)
  }
  if (streamedText.includes('已接收') && /\d+\s*字符/.test(streamedText)) {
    throw new Error(`Live output fell back to a character counter: ${streamedText}`)
  }

  await page.getByRole('button', { name: '关闭 AI 与工具面板' }).click()
  await page.locator('.visual-ai-assistant').waitFor({ state: 'detached', timeout: 5_000 })
  await page.waitForTimeout(3_200)
  await page.getByRole('button', { name: '打开 AI 助手' }).click()
  await page.locator('.visual-ai-assistant').waitFor({ state: 'visible', timeout: 8_000 })
  await page.locator('.ai-message-list article.assistant').filter({ hasText: '已整理 AI 学习路径' }).waitFor({ state: 'visible', timeout: 8_000 })
  if (await page.locator('.ai-error-card').count()) throw new Error('Successful streaming request displayed an error card.')

  process.stdout.write(`${JSON.stringify({ mermaidPlanAdvancedPastSchemaVersion: true, promptCleared: true, liveXmlVisible: true, panelClosedDuringRequest: true, resultRecoveredAfterReopen: true, completedWithoutError: true })}\n`)
} finally {
  await application?.close().catch(() => undefined)
  await new Promise((resolve) => providerServer?.close(() => resolve())).catch(() => undefined)
  await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
}

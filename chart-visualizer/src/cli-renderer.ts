import { compileAiDrawioCode } from '@/lib/ai-drawio-plan'
import { renderDiagram, isRenderError } from '@/lib/diagram-engine'
import { validateDrawioXml } from '@/lib/drawio-xml'
import { compileFengshaPlanToMermaid, isFengshaPlanSource } from '@/lib/fengsha-plan'
import {
  assessDrawioDiagram,
  assessMermaidDiagram,
  deliverMermaidDiagram,
  qualityFailureMessage,
} from '@/lib/reliable-diagram-delivery'
import { getDiagramTheme } from '@/data/themes'
import type {
  CliArtifactPayload,
  CliRendererResponse,
  CliWorkerRequest,
} from '@/cli-contracts'

const status = document.querySelector<HTMLElement>('#cli-status')

function setStatus(message: string) {
  if (status) status.textContent = message
}

async function blobPayload(blob: Blob, mimeType: string, extension: string): Promise<CliArtifactPayload> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const chunks: string[] = []
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)))
  }
  return { encoding: 'base64', content: btoa(chunks.join('')), mimeType, extension }
}

function textPayload(content: string, mimeType: string, extension: string): CliArtifactPayload {
  return { encoding: 'utf8', content, mimeType, extension }
}

function drawioCounts(xml: string) {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml')
  const vertices = [...parsed.querySelectorAll('mxCell[vertex="1"]')]
  const laneCount = vertices.filter((cell) => /(?:^|;)swimlane(?:=|;)/i.test(cell.getAttribute('style') ?? '')).length
  return {
    nodeCount: vertices.length - laneCount,
    edgeCount: parsed.querySelectorAll('mxCell[edge="1"]').length,
    laneCount,
  }
}

async function handleRequest(request: CliWorkerRequest): Promise<CliRendererResponse> {
  if (request.protocolVersion !== 1 && request.protocolVersion !== 2) {
    return { ok: false, category: 'internal', message: '不支持的 CLI 协议版本。' }
  }
  if (request.operation === 'compile-drawio') {
    try {
      const xml = compileAiDrawioCode(request.source, '')
      const validationError = validateDrawioXml(xml)
      if (validationError) return { ok: false, category: 'validation', message: validationError }
      const receipt = await assessDrawioDiagram(xml, request.quality ?? 'professional', xml)
      if (!receipt.ok) return { ok: false, category: 'quality', message: qualityFailureMessage(receipt), receipt }
      return {
        ok: true,
        artifact: textPayload(xml, 'application/vnd.jgraph.mxfile', 'drawio'),
        metadata: drawioCounts(xml),
        receipt,
      }
    } catch (error) {
      return {
        ok: false,
        category: 'validation',
        message: error instanceof Error ? error.message : 'draw.io 计划无法编译。',
      }
    }
  }

  if (request.operation === 'compile-mermaid') {
    try {
      const source = compileFengshaPlanToMermaid(request.source)
      const rendered = await renderDiagram(source, getDiagramTheme('paper'))
      const receipt = await assessMermaidDiagram(source, rendered, request.quality ?? 'professional', source)
      if (!receipt.ok) return { ok: false, category: 'quality', message: qualityFailureMessage(receipt), receipt }
      return {
        ok: true,
        artifact: textPayload(source, 'text/plain;charset=utf-8', 'mmd'),
        metadata: { kind: rendered.kind, width: rendered.width, height: rendered.height },
        receipt,
      }
    } catch (error) {
      return { ok: false, category: 'validation', message: error instanceof Error ? error.message : '风沙图纸无法编译。' }
    }
  }

  if (request.operation === 'visual-check' && /^\s*<mxfile\b/i.test(request.source)) {
    const receipt = await assessDrawioDiagram(request.source, request.quality ?? 'professional')
    return receipt.ok
      ? { ok: true, metadata: drawioCounts(request.source), receipt }
      : { ok: false, category: 'quality', message: qualityFailureMessage(receipt), receipt }
  }

  const options = request.render
  if (!options) return { ok: false, category: 'internal', message: '缺少 Mermaid 渲染参数。' }
  try {
    const mermaidSource = isFengshaPlanSource(request.source)
      ? compileFengshaPlanToMermaid(request.source)
      : request.source
    if (request.operation === 'validate') {
      const result = await renderDiagram(mermaidSource, getDiagramTheme(options.theme))
      return {
        ok: true,
        metadata: { kind: result.kind, width: result.width, height: result.height },
      }
    }

    if (request.operation === 'visual-check') {
      const result = await renderDiagram(mermaidSource, getDiagramTheme(options.theme))
      const receipt = await assessMermaidDiagram(mermaidSource, result, request.quality ?? 'professional')
      return receipt.ok
        ? { ok: true, metadata: { kind: result.kind, width: result.width, height: result.height }, receipt }
        : { ok: false, category: 'quality', message: qualityFailureMessage(receipt), receipt }
    }

    const delivered = await deliverMermaidDiagram(
      mermaidSource,
      options,
      request.operation === 'deliver' ? request.quality ?? 'professional' : 'standard',
    )
    if (!delivered.receipt.ok) {
      return { ok: false, category: 'quality', message: qualityFailureMessage(delivered.receipt), receipt: delivered.receipt }
    }
    const artifact = delivered.artifact
    const payload = typeof artifact.data === 'string'
      ? textPayload(artifact.data, artifact.mimeType, artifact.extension)
      : await blobPayload(artifact.data, artifact.mimeType, artifact.extension)
    return {
      ok: true,
      artifact: payload,
      metadata: {
        kind: artifact.result.kind,
        width: artifact.result.width,
        height: artifact.result.height,
        outputWidth: artifact.outputWidth,
        outputHeight: artifact.outputHeight,
        scale: artifact.scale,
      },
      receipt: delivered.receipt,
    }
  } catch (error) {
    const parsed = isRenderError(error) ? error : null
    return {
      ok: false,
      category: request.operation === 'validate' ? 'validation' : 'render',
      message: parsed?.message ?? (error instanceof Error ? error.message : '图表处理失败。'),
      line: parsed?.line,
    }
  }
}

const bridge = window.fengshaCliBridge
if (!bridge) {
  setStatus('CLI bridge is unavailable.')
} else {
  bridge.onRequest((request) => {
    setStatus(`Processing ${request.operation}…`)
    void handleRequest(request)
      .then((response) => bridge.respond(response))
      .catch((error) => bridge.respond({
        ok: false,
        category: 'internal',
        message: error instanceof Error ? error.message : 'CLI renderer failed.',
      }))
  })
  setStatus('CLI renderer is ready.')
  bridge.ready()
}

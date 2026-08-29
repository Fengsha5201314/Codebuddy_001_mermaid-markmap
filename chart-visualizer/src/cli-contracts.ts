export const CLI_WORKER_FLAG = '--fengsha-cli-worker'

export type CliThemeId = 'paper' | 'blueprint' | 'executive' | 'forest' | 'midnight'
export type CliRenderFormat = 'svg' | 'png' | 'jpeg' | 'pdf'
export type CliOperation = 'render' | 'validate' | 'compile-drawio' | 'compile-mermaid' | 'deliver' | 'visual-check'
export type CliQualityProfile = 'standard' | 'professional'

export interface CliQualityReceipt {
  receiptVersion: 1
  engine: 'mermaid' | 'drawio'
  quality: CliQualityProfile
  ok: boolean
  acceptance: 'rejected' | 'provisional' | 'passed'
  generatedAt: string
  inputSha256: string
  outputSha256?: string
  outputBytes?: number
  dimensions?: { width: number; height: number }
  counts: { nodes: number; edges: number; lanes: number }
  checks: Array<{ id: string; label: string; status: 'passed' | 'failed' | 'warning'; diagnosticCodes: string[] }>
  diagnostics: Array<{
    code: string
    severity: 'error' | 'warning'
    message: string
    subject: { kind: string; id?: string; field?: string; line?: number }
    evidence?: Record<string, string | number | boolean>
    supportedFixes: string[]
  }>
  visualReview: 'pending' | 'passed' | 'failed'
}

export interface CliRenderOptions {
  format: CliRenderFormat
  theme: CliThemeId
  padding: number
  background: string
  scale: number | 'auto'
}

export interface CliWorkerRequest {
  protocolVersion: 1 | 2
  operation: CliOperation
  source: string
  render?: CliRenderOptions
  quality?: CliQualityProfile
}

export interface CliArtifactPayload {
  encoding: 'utf8' | 'base64'
  content: string
  mimeType: string
  extension: string
}

export interface CliDiagramMetadata {
  kind?: string
  width?: number
  height?: number
  outputWidth?: number
  outputHeight?: number
  scale?: number
  nodeCount?: number
  edgeCount?: number
  laneCount?: number
}

export interface CliRendererSuccess {
  ok: true
  artifact?: CliArtifactPayload
  metadata: CliDiagramMetadata
  receipt?: CliQualityReceipt
}

export interface CliRendererFailure {
  ok: false
  category: 'validation' | 'render' | 'quality' | 'internal'
  message: string
  line?: number
  receipt?: CliQualityReceipt
}

export type CliRendererResponse = CliRendererSuccess | CliRendererFailure

export interface CliWorkerEnvelope {
  request: CliWorkerRequest
  outputPath?: string
  overwrite?: boolean
  receiptPath?: string
}

export interface CliWorkerResult {
  ok: boolean
  category?: 'validation' | 'render' | 'quality' | 'io' | 'timeout' | 'internal'
  message?: string
  outputPath?: string
  metadata?: CliDiagramMetadata
  receipt?: CliQualityReceipt
}

declare global {
  interface Window {
    fengshaCliBridge?: {
      ready: () => void
      onRequest: (callback: (request: CliWorkerRequest) => void) => () => void
      respond: (response: CliRendererResponse) => void
    }
  }
}

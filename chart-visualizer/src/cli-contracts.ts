export const CLI_WORKER_FLAG = '--fengsha-cli-worker'

export type CliThemeId = 'paper' | 'blueprint' | 'executive' | 'forest' | 'midnight'
export type CliRenderFormat = 'svg' | 'png' | 'jpeg' | 'pdf'
export type CliOperation = 'render' | 'validate' | 'compile-drawio'

export interface CliRenderOptions {
  format: CliRenderFormat
  theme: CliThemeId
  padding: number
  background: string
  scale: number | 'auto'
}

export interface CliWorkerRequest {
  protocolVersion: 1
  operation: CliOperation
  source: string
  render?: CliRenderOptions
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
}

export interface CliRendererFailure {
  ok: false
  category: 'validation' | 'render' | 'internal'
  message: string
  line?: number
}

export type CliRendererResponse = CliRendererSuccess | CliRendererFailure

export interface CliWorkerEnvelope {
  request: CliWorkerRequest
  outputPath?: string
  overwrite?: boolean
}

export interface CliWorkerResult {
  ok: boolean
  category?: 'validation' | 'render' | 'io' | 'internal'
  message?: string
  outputPath?: string
  metadata?: CliDiagramMetadata
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

import { createReadStream } from 'node:fs'
import { cp, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createAiMiddleware, type AiServiceConfig } from './server/ai-service.ts'

const drawioRoot = fileURLToPath(new URL('./vendor/drawio', import.meta.url))

function containsServerOnlyDrawioPath(value: string): boolean {
  return value.split(/[\\/]+/).some((segment) => segment.toLowerCase() === 'web-inf')
}

const drawioMimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
}

function drawioAssetsPlugin(): Plugin {
  let shouldCopyForBuild = false
  const serveDrawio = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url || '/', 'http://drawio.local')
    if (!url.pathname.startsWith('/drawio')) {
      next()
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.statusCode = 405
      response.end('Method Not Allowed')
      return
    }

    let relativePath = ''
    try {
      relativePath = decodeURIComponent(url.pathname.slice('/drawio'.length)).replace(/^\/+/, '') || 'index.html'
    } catch {
      response.statusCode = 400
      response.end('Bad Request')
      return
    }
    if (containsServerOnlyDrawioPath(relativePath)) {
      response.statusCode = 404
      response.end('Not Found')
      return
    }
    const requestedPath = path.resolve(drawioRoot, relativePath)
    if (requestedPath !== drawioRoot && !requestedPath.startsWith(`${drawioRoot}${path.sep}`)) {
      response.statusCode = 403
      response.end('Forbidden')
      return
    }

    try {
      const file = await stat(requestedPath)
      const finalPath = file.isDirectory() ? path.join(requestedPath, 'index.html') : requestedPath
      const finalFile = await stat(finalPath)
      if (!finalFile.isFile()) throw new Error('Not a file')
      response.statusCode = 200
      response.setHeader('Content-Type', drawioMimeTypes[path.extname(finalPath).toLowerCase()] || 'application/octet-stream')
      response.setHeader('Cache-Control', relativePath === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable')
      response.setHeader('X-Content-Type-Options', 'nosniff')
      if (request.method === 'HEAD') {
        response.end()
        return
      }
      createReadStream(finalPath).pipe(response)
    } catch {
      response.statusCode = 404
      response.end('Not Found')
    }
  }

  return {
    name: 'fengsha-bundled-drawio',
    configResolved(config) {
      shouldCopyForBuild = config.command === 'build'
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => { void serveDrawio(request, response, next) })
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => { void serveDrawio(request, response, next) })
    },
    async closeBundle() {
      if (!shouldCopyForBuild) return
      await cp(drawioRoot, fileURLToPath(new URL('./dist/drawio', import.meta.url)), {
        recursive: true,
        filter: (source) => !containsServerOnlyDrawioPath(path.relative(drawioRoot, source)),
      })
    },
  }
}

function aiApiPlugin(config: AiServiceConfig): Plugin {
  const middleware = createAiMiddleware(config)
  return {
    name: 'mermaid-workbench-ai-api',
    configureServer(server) {
      server.middlewares.use('/api/ai', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/ai', middleware)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const runtimeEnv = { ...env, ...process.env }
  return {
    plugins: [
      react(),
      drawioAssetsPlugin(),
      aiApiPlugin({
        settingsFile: runtimeEnv.AI_SETTINGS_FILE || fileURLToPath(new URL('./.data/ai-providers.json', import.meta.url)),
        providers: {
          cpa: {
            apiKey: runtimeEnv.CPA_API_KEY,
            baseUrl: runtimeEnv.CPA_BASE_URL,
          },
          deepseek: {
            apiKey: runtimeEnv.DEEPSEEK_API_KEY,
            baseUrl: runtimeEnv.DEEPSEEK_BASE_URL,
          },
          custom: {
            apiKey: runtimeEnv.CUSTOM_AI_API_KEY,
            baseUrl: runtimeEnv.CUSTOM_AI_BASE_URL,
            label: runtimeEnv.CUSTOM_AI_LABEL,
          },
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      entries: ['index.html'],
    },
    build: {
      target: 'es2022',
      sourcemap: false,
    },
    server: {
      watch: {
        ignored: ['**/vendor/drawio/**'],
      },
    },
    test: {
      environment: 'jsdom',
    },
  }
})

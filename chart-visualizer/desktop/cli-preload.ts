import { contextBridge, ipcRenderer } from 'electron'
import type { CliRendererResponse, CliWorkerRequest } from '../src/cli-contracts.ts'

contextBridge.exposeInMainWorld('fengshaCliBridge', {
  ready: () => ipcRenderer.send('cli:ready'),
  onRequest: (callback: (request: CliWorkerRequest) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: CliWorkerRequest) => callback(request)
    ipcRenderer.on('cli:request', listener)
    return () => ipcRenderer.removeListener('cli:request', listener)
  },
  respond: (response: CliRendererResponse) => ipcRenderer.send('cli:response', response),
})


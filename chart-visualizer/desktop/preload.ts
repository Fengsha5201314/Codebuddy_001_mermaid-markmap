import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('fengshaDesktop', {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getUpdateState: () => ipcRenderer.invoke('updates:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  confirmClose: (hasUnsavedChanges: boolean) => ipcRenderer.invoke('app:confirm-close', hasUnsavedChanges),
  closeNow: () => ipcRenderer.send('app:close-now'),
  onCloseRequested: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('app:close-requested', listener)
    return () => ipcRenderer.removeListener('app:close-requested', listener)
  },
  onUpdateState: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state)
    ipcRenderer.on('updates:state', listener)
    return () => ipcRenderer.removeListener('updates:state', listener)
  },
})

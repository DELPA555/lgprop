import { contextBridge, ipcRenderer } from 'electron'

type UpdateInfo = { version: string }

// Suscribe a un canal de update y devuelve una función para desuscribir
function onChannel(channel: string, cb: (info: UpdateInfo) => void): () => void {
  const listener = (_e: unknown, info: UpdateInfo): void => cb(info)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// API mínima y segura expuesta al renderer
const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  // Actualización automática
  onUpdateAvailable: (cb: (info: UpdateInfo) => void): (() => void) =>
    onChannel('update:available', cb),
  onUpdateDownloaded: (cb: (info: UpdateInfo) => void): (() => void) =>
    onChannel('update:downloaded', cb),
  restartToUpdate: (): Promise<void> => ipcRenderer.invoke('update:restart')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('lgprop', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (fallback sin contextIsolation)
  window.lgprop = api
}

import { contextBridge, ipcRenderer } from 'electron'

type UpdateInfo = { version: string }
type UpdateError = { message: string }
type CheckResult = { ok: boolean; error?: string; dev?: boolean }

// Suscribe a un canal de update y devuelve una función para desuscribir
function onChannel<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
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
  onUpdateNotAvailable: (cb: (info: UpdateInfo) => void): (() => void) =>
    onChannel('update:not-available', cb),
  onUpdateDownloaded: (cb: (info: UpdateInfo) => void): (() => void) =>
    onChannel('update:downloaded', cb),
  onUpdateError: (cb: (err: UpdateError) => void): (() => void) =>
    onChannel('update:error', cb),
  // Chequeo manual (botón en Ajustes)
  checkForUpdates: (): Promise<CheckResult> => ipcRenderer.invoke('update:check'),
  restartToUpdate: (): Promise<void> => ipcRenderer.invoke('update:restart'),
  // Almacenamiento seguro de la sesión (login persistente)
  session: {
    getItem: (key: string): Promise<string | null> => ipcRenderer.invoke('session:get', key),
    setItem: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('session:set', key, value),
    removeItem: (key: string): Promise<void> => ipcRenderer.invoke('session:remove', key),
    setPersist: (value: boolean): Promise<void> => ipcRenderer.invoke('session:setPersist', value)
  },
  prefs: {
    getEmail: (): Promise<string | null> => ipcRenderer.invoke('prefs:getEmail'),
    setEmail: (email: string): Promise<void> => ipcRenderer.invoke('prefs:setEmail', email)
  }
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

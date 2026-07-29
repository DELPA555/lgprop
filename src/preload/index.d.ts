export interface UpdateInfo {
  version: string
}

export interface LgPropApi {
  getVersion: () => Promise<string>
  openExternal: (url: string) => Promise<void>
  onUpdateAvailable: (cb: (info: UpdateInfo) => void) => () => void
  onUpdateDownloaded: (cb: (info: UpdateInfo) => void) => () => void
  restartToUpdate: () => Promise<void>
}

declare global {
  interface Window {
    lgprop: LgPropApi
  }
}

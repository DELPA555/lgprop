export interface UpdateInfo {
  version: string
}

export interface LgPropApi {
  getVersion: () => Promise<string>
  openExternal: (url: string) => Promise<void>
  onUpdateAvailable: (cb: (info: UpdateInfo) => void) => () => void
  onUpdateDownloaded: (cb: (info: UpdateInfo) => void) => () => void
  restartToUpdate: () => Promise<void>
  session: {
    getItem: (key: string) => Promise<string | null>
    setItem: (key: string, value: string) => Promise<void>
    removeItem: (key: string) => Promise<void>
    setPersist: (value: boolean) => Promise<void>
  }
  prefs: {
    getEmail: () => Promise<string | null>
    setEmail: (email: string) => Promise<void>
  }
}

declare global {
  interface Window {
    lgprop: LgPropApi
  }
}

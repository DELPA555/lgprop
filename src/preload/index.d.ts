export interface LgPropApi {
  getVersion: () => Promise<string>
  openExternal: (url: string) => Promise<void>
}

declare global {
  interface Window {
    lgprop: LgPropApi
  }
}

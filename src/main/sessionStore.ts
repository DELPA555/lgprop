// Almacenamiento seguro de la sesión de Supabase para el proceso principal.
// Guarda SOLO el token de sesión/refresh (nunca la contraseña), cifrado con
// safeStorage (DPAPI en Windows) en un archivo del userData. Si el usuario
// desmarca "Mantener sesión iniciada", la sesión queda solo en memoria (no se
// escribe a disco) y se pierde al cerrar la app.
//
// Además recuerda el último email (dato no sensible, en texto plano) para
// precargar el campo del login.
import { app, ipcMain, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs'

const sessionPath = (): string => join(app.getPath('userData'), 'lgprop-session.bin')
const prefsPath = (): string => join(app.getPath('userData'), 'lgprop-prefs.json')

let data: Record<string, string> = {}
let persist = true
let loaded = false

function load(): void {
  if (loaded) return
  loaded = true
  try {
    if (existsSync(sessionPath())) {
      const buf = readFileSync(sessionPath())
      const json = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(buf)
        : buf.toString('utf-8')
      data = JSON.parse(json)
    }
  } catch {
    data = {}
  }
}

function save(): void {
  try {
    if (!persist) {
      if (existsSync(sessionPath())) rmSync(sessionPath())
      return
    }
    const json = JSON.stringify(data)
    const buf = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, 'utf-8')
    writeFileSync(sessionPath(), buf)
  } catch {
    // si falla el guardado, la app sigue funcionando (sesión en memoria)
  }
}

export function registerSessionIpc(): void {
  // Storage adapter que consume Supabase (getItem/setItem/removeItem)
  ipcMain.handle('session:get', (_e, key: string) => {
    load()
    return data[key] ?? null
  })
  ipcMain.handle('session:set', (_e, key: string, value: string) => {
    load()
    data[key] = value
    save()
  })
  ipcMain.handle('session:remove', (_e, key: string) => {
    load()
    delete data[key]
    save()
  })
  // "Mantener sesión iniciada": true = persistir a disco; false = solo memoria
  ipcMain.handle('session:setPersist', (_e, value: boolean) => {
    persist = !!value
    if (!persist) {
      if (existsSync(sessionPath())) rmSync(sessionPath())
    } else {
      load()
      save()
    }
  })

  // Recordar el último email (no sensible)
  ipcMain.handle('prefs:getEmail', () => {
    try {
      if (existsSync(prefsPath())) {
        return (JSON.parse(readFileSync(prefsPath(), 'utf-8')).lastEmail as string) ?? null
      }
    } catch {
      /* ignore */
    }
    return null
  })
  ipcMain.handle('prefs:setEmail', (_e, email: string) => {
    try {
      writeFileSync(prefsPath(), JSON.stringify({ lastEmail: email || null }))
    } catch {
      /* ignore */
    }
  })
}

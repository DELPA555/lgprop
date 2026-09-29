import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import electronUpdater from 'electron-updater'
import { registerSessionIpc } from './sessionStore'

const { autoUpdater } = electronUpdater

let mainWindow: BrowserWindow | null = null

// ── Actualización automática vía GitHub Releases ────────────────────────────
// Al abrir la app (empaquetada), chequea si hay una versión nueva publicada,
// la descarga en segundo plano y avisa al renderer para mostrar el aviso.
function setupAutoUpdater(win: BrowserWindow): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = console

  const send = (channel: string, payload?: unknown): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }

  // Eventos del updater → renderer. Se registran SIEMPRE porque también
  // alimentan el chequeo manual desde Ajustes, no sólo el automático.
  autoUpdater.on('update-available', (info) => send('update:available', { version: info.version }))
  autoUpdater.on('update-not-available', (info) =>
    send('update:not-available', { version: info.version })
  )
  autoUpdater.on('update-downloaded', (info) => send('update:downloaded', { version: info.version }))
  autoUpdater.on('error', (err) => {
    console.error('[auto-update]', err)
    send('update:error', { message: err instanceof Error ? err.message : String(err) })
  })

  // El chequeo automático (al abrir + cada 6 h) sólo corre sobre la app
  // instalada; en `npm run dev` electron-updater no puede actualizar.
  if (!app.isPackaged) return
  const check = (): void => {
    autoUpdater.checkForUpdates().catch((e) => console.error('[auto-update] check', e))
  }
  check() // al arrancar
  setInterval(check, 6 * 60 * 60 * 1000) // y cada 6 horas mientras esté abierta
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0d12',
    title: 'LG Prop',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Abrir enlaces externos (mailto, https) en el navegador del sistema
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Cargar el renderer: dev server en desarrollo, archivo compilado en producción
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))
  // Reiniciar para aplicar la actualización ya descargada
  ipcMain.handle('update:restart', () => autoUpdater.quitAndInstall())
  // Chequeo manual de actualizaciones (botón en Ajustes). El progreso real
  // (disponible / descargada / sin novedades / error) llega por los eventos
  // que emite setupAutoUpdater; acá sólo disparamos y reportamos el arranque.
  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) {
      return {
        ok: false,
        dev: true,
        error: 'El chequeo de actualizaciones sólo funciona en la app instalada.'
      }
    }
    try {
      await autoUpdater.checkForUpdates()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
  // Almacenamiento seguro de la sesión (login persistente)
  registerSessionIpc()

  if (mainWindow) setupAutoUpdater(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

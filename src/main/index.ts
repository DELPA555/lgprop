import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

let mainWindow: BrowserWindow | null = null

// ── Actualización automática vía GitHub Releases ────────────────────────────
// Al abrir la app (empaquetada), chequea si hay una versión nueva publicada,
// la descarga en segundo plano y avisa al renderer para mostrar el aviso.
function setupAutoUpdater(win: BrowserWindow): void {
  // El updater sólo funciona sobre la app instalada (no en `npm run dev`).
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = console

  const send = (channel: string, payload?: unknown): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }

  autoUpdater.on('update-available', (info) => send('update:available', { version: info.version }))
  autoUpdater.on('update-downloaded', (info) => send('update:downloaded', { version: info.version }))
  autoUpdater.on('error', (err) => console.error('[auto-update]', err))

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

  if (mainWindow) setupAutoUpdater(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

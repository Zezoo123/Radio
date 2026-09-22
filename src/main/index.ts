import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc'
import { setupAutoUpdate } from './updater'

const isDev = !app.isPackaged

// The packaged Windows app gets its icon from the exe (electron-builder embeds
// build/icon.ico); dev runs would otherwise show Electron's logo in the window
// corner, taskbar and Dock.
const devIcon = isDev
  ? join(app.getAppPath(), 'build', process.platform === 'darwin' ? 'icon.png' : 'icon.ico')
  : undefined

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f1115',
    title: `Radio Scheduler ${app.getVersion()}`,
    ...(devIcon && process.platform !== 'darwin' ? { icon: devIcon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // The renderer's <title> would overwrite the versioned window title.
  win.on('page-title-updated', (e) => e.preventDefault())

  // Surface renderer problems to the main-process log (otherwise a failed load
  // just shows a blank window).
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    console.log(`[renderer:${level}] ${message} (${source}:${line})`)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[renderer] did-fail-load ${code} ${desc} ${url}`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[renderer] process gone: ${details.reason}`)
  })
  if (isDev) win.webContents.openDevTools({ mode: 'detach' })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (devIcon && process.platform === 'darwin') app.dock?.setIcon(devIcon)
  registerIpc()
  setupAutoUpdate()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

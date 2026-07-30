import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
// electron-updater is CommonJS; a named ESM import crashes the built app at
// module load ("Named export 'autoUpdater' not found") — go through default.
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

/**
 * Auto-update from GitHub Releases, kept deliberately quiet: the update
 * downloads in the background and installs on the next quit; the renderer just
 * gets an "update ready" signal so it can offer a one-click restart. A station
 * PC mid-broadcast must never be interrupted by a dialog.
 */
export function setupAutoUpdate(): void {
  // Only the installed (NSIS) build can update itself — the portable exe has
  // no install location, and dev runs carry no app-update.yml.
  if (!app.isPackaged || process.env['PORTABLE_EXECUTABLE_DIR']) return
  if (!existsSync(join(process.resourcesPath, 'app-update.yml'))) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', (info) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('update:downloaded', info.version)
    }
  })

  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall())

  // A failed check (offline, GitHub down, rate limit) must never surface to
  // the operator — the app simply stays on its current version.
  autoUpdater.checkForUpdates().catch(() => {})
}

import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import Store from 'electron-store'

const store = new Store()

function createWindow() {
  const window = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 760,
    minHeight: 600,
    backgroundColor: '#f8f7f4',
    title: 'Blink',
    webPreferences: {
      preload: join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    window.loadFile(join(import.meta.dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  void store
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

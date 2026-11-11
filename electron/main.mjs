import { app, BrowserWindow, components, ipcMain, safeStorage, shell } from 'electron'
import { createServer } from 'node:http'
import { join } from 'node:path'
import Store from 'electron-store'

const store = new Store()
const spotifyClientId = '1720e78833f940348f746d417be3b00c'
const spotifyRedirectUri = 'http://127.0.0.1:43821/callback'

function readTokens() {
  const encrypted = store.get('spotify-tokens')
  if (typeof encrypted !== 'string' || !safeStorage.isEncryptionAvailable()) return null
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64')))
  } catch {
    return null
  }
}

function writeTokens(tokens) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable')
  const encrypted = safeStorage.encryptString(JSON.stringify(tokens)).toString('base64')
  store.set('spotify-tokens', encrypted)
}

async function refreshSpotifyToken(tokens) {
  if (!tokens.refresh_token || tokens.expires_at > Date.now() + 60_000) return tokens
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: spotifyClientId,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  })
  if (!response.ok) throw new Error(`Spotify token refresh failed (${response.status})`)
  const data = await response.json()
  const refreshed = { ...tokens, ...data, expires_at: Date.now() + data.expires_in * 1000 }
  writeTokens(refreshed)
  return refreshed
}

function waitForSpotifyCallback(authUrl, codeVerifier, expectedState) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (request, response) => {
      const callback = new URL(request.url || '/', spotifyRedirectUri)
      if (callback.pathname !== '/callback') {
        response.writeHead(404).end()
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Blink</title><p>Авторизация завершена. Можно вернуться в Blink.</p>')
      server.close()
      if (callback.searchParams.get('state') !== expectedState) {
        reject(new Error('Spotify authorization state mismatch'))
        return
      }
      const error = callback.searchParams.get('error')
      if (error) {
        reject(new Error(`Spotify authorization failed: ${error}`))
        return
      }
      try {
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: spotifyClientId,
            grant_type: 'authorization_code',
            code: callback.searchParams.get('code') || '',
            redirect_uri: spotifyRedirectUri,
            code_verifier: codeVerifier,
          }),
        })
        if (!tokenResponse.ok) throw new Error(`Spotify token request failed (${tokenResponse.status})`)
        const data = await tokenResponse.json()
        const tokens = { ...data, expires_at: Date.now() + data.expires_in * 1000 }
        writeTokens(tokens)
        resolve({ display_name: null })
      } catch (error) {
        reject(error)
      }
    })
    server.on('error', reject)
    server.listen(43821, '127.0.0.1', () => { void shell.openExternal(authUrl) })
  })
}

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

ipcMain.handle('spotify-status', () => Boolean(readTokens()))
ipcMain.handle('spotify-auth-start', (_event, args) => waitForSpotifyCallback(args.authUrl, args.codeVerifier, args.state))
ipcMain.handle('spotify-token', async () => {
  const stored = readTokens()
  if (!stored) throw new Error('Spotify is not connected')
  const tokens = await refreshSpotifyToken(stored)
  return tokens.access_token
})
ipcMain.handle('spotify-api', async (_event, args) => {
  const stored = readTokens()
  if (!stored) throw new Error('Spotify is not connected')
  const tokens = await refreshSpotifyToken(stored)
  const method = args.method || 'GET'
  const response = await fetch(`https://api.spotify.com/v1${args.path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      ...(args.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(args.body ? { body: JSON.stringify(args.body) } : {}),
  })
  if (!response.ok) {
    let detail = ''
    try { detail = await response.text() } catch { /* response body is optional */ }
    throw new Error(`Spotify API request failed (${response.status})${detail ? `: ${detail}` : ''}`)
  }
  if (response.status === 204) return null
  return response.json()
})
ipcMain.handle('spotify-disconnect', () => { store.delete('spotify-tokens') })

app.whenReady().then(async () => {
  void store
  try {
    await components.whenReady()
    console.log('Widevine components ready', components.status())
  } catch (error) {
    console.error('Widevine components failed', error)
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

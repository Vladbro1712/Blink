import { app, components, ipcMain, safeStorage, shell } from 'electron'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import Store from 'electron-store'

const store = new Store()
let edgeServer = null
let edgeProcess = null
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) app.quit()

app.on('second-instance', () => { openEdge() })
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
    const callbackServer = createServer(async (request, response) => {
      const callback = new URL(request.url || '/', spotifyRedirectUri)
      if (callback.pathname !== '/callback') {
        response.writeHead(404).end()
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Blink</title><p>Авторизация завершена. Можно вернуться в Blink.</p>')
      callbackServer.close()
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
    callbackServer.on('error', reject)
    callbackServer.listen(43821, '127.0.0.1', () => { void shell.openExternal(authUrl) })
  })
}

function createEdgeServer() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1:43820')
    const sendJson = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); response.end(JSON.stringify(value)) }
    const readBody = async () => { let body = ''; for await (const chunk of request) body += chunk; return body ? JSON.parse(body) : {} }
    try {
      if (url.pathname === '/api/spotify/status') return sendJson(200, Boolean(readTokens()))
      if (url.pathname === '/api/spotify/token') {
        const stored = readTokens(); if (!stored) return sendJson(401, { error: 'Spotify is not connected' })
        return sendJson(200, { token: (await refreshSpotifyToken(stored)).access_token })
      }
      if (url.pathname === '/api/spotify/disconnect' && request.method === 'POST') { store.delete('spotify-tokens'); return sendJson(200, { ok: true }) }
      if (url.pathname === '/api/spotify/auth-start' && request.method === 'POST') {
        const args = await readBody(); void waitForSpotifyCallback(args.authUrl, args.codeVerifier, args.state).then(() => sendJson(200, { ok: true })).catch(error => sendJson(500, { error: error.message }))
        return
      }
      if (url.pathname === '/api/spotify/api') {
        const stored = readTokens(); if (!stored) return sendJson(401, { error: 'Spotify is not connected' })
        const tokens = await refreshSpotifyToken(stored)
        const spotifyResponse = await fetch(`https://api.spotify.com/v1${url.searchParams.get('path') || '/'}`, { method: request.method === 'POST' ? 'POST' : request.method === 'PUT' ? 'PUT' : request.method === 'DELETE' ? 'DELETE' : 'GET', headers: { Authorization: `Bearer ${tokens.access_token}`, ...(request.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) }, ...(request.method !== 'GET' ? { body: await readBody().then(JSON.stringify) } : {}) })
        const spotifyBody = await spotifyResponse.text()
        if (!spotifyResponse.ok) return sendJson(spotifyResponse.status, { error: spotifyBody || 'Spotify returned an empty error response' })
        if (!spotifyBody.trim()) { response.writeHead(204, { 'Access-Control-Allow-Origin': '*' }).end(); return }
        return sendJson(200, JSON.parse(spotifyBody))
      }
      const filePath = url.pathname === '/' ? join(import.meta.dirname, '../dist/index.html') : join(import.meta.dirname, '../dist', url.pathname.slice(1))
      if (!existsSync(filePath)) return response.writeHead(404).end()
      const content = await readFile(filePath)
      const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.ico': 'image/x-icon' }
      response.writeHead(200, { 'Content-Type': contentTypes[filePath.slice(filePath.lastIndexOf('.'))] || 'application/octet-stream' }).end(content)
    } catch (error) { sendJson(500, { error: error instanceof Error ? error.message : String(error) }) }
  })
  return new Promise((resolve, reject) => {
    server.once('error', error => {
      if (error.code === 'EADDRINUSE') {
        resolve(null)
        return
      }
      reject(error)
    })
    server.listen(43820, '127.0.0.1', () => { edgeServer = server; resolve(server) })
  })
}

function openEdge() {
  const candidates = [
    join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ]
  const edge = candidates.find(candidate => existsSync(candidate)) || 'msedge.exe'
  const profile = join(app.getPath('userData'), 'edge-profile')
  edgeProcess = execFile(edge, [`--app=http://127.0.0.1:43820/`, `--user-data-dir=${profile}`, '--no-first-run'], error => { if (error) console.error('Failed to open Microsoft Edge', error) })
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
  void components.whenReady().then(() => console.log('Electron components ready', components.status())).catch(error => console.error('Electron components failed', error))
  const server = await createEdgeServer()
  if (!server) {
    openEdge()
    return
  }
  openEdge()
  app.on('activate', () => openEdge())
})

app.on('before-quit', () => { edgeServer?.close(); edgeProcess?.kill() })
app.on('window-all-closed', () => { app.quit() })

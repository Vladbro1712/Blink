type SpotifyBridge = {
  status: () => Promise<boolean>
  authenticate: (args: { authUrl: string; codeVerifier: string; state: string }) => Promise<unknown>
  token: () => Promise<string>
  api: (path: string, options?: { method?: string; body?: unknown }) => Promise<unknown>
  disconnect: () => Promise<void>
}

const edgeBridge: SpotifyBridge = {
  status: async () => (await fetch('/api/spotify/status')).json(),
  authenticate: async args => {
    const response = await fetch('/api/spotify/auth-start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  },
  token: async () => {
    const response = await fetch('/api/spotify/token')
    if (!response.ok) throw new Error(await response.text())
    const data = await response.json() as { token: string }
    return data.token
  },
  api: async (path, options) => {
    const response = await fetch(`/api/spotify/api?path=${encodeURIComponent(path)}`, {
      method: options?.method || 'GET',
      headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })
    if (!response.ok) throw new Error(await response.text())
    if (response.status === 204) return null
    return response.json()
  },
  disconnect: async () => {
    const response = await fetch('/api/spotify/disconnect', { method: 'POST' })
    if (!response.ok) throw new Error(await response.text())
  },
}

export const spotifyBridge: SpotifyBridge = window.blink?.spotify || edgeBridge
export const hasSpotifyBridge = Boolean(window.blink?.spotify) || window.location.protocol === 'http:'

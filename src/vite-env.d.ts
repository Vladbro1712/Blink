interface SpotifyBridge {
  status: () => Promise<boolean>
  authenticate: (args: { authUrl: string; codeVerifier: string; state: string }) => Promise<unknown>
  token: () => Promise<string>
  api: (path: string, options?: { method?: string; body?: unknown }) => Promise<unknown>
  disconnect: () => Promise<void>
}

interface SpotifyPlayer {
  addListener: (event: string, callback: (payload: any) => void) => boolean
  connect: () => Promise<boolean>
  disconnect: () => void
  activateElement: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  togglePlay: () => Promise<void>
  seek: (positionMs: number) => Promise<void>
  setVolume: (volume: number) => Promise<void>
}

declare global {
  interface Window {
    Spotify?: { Player: new (options: { name: string; getOAuthToken: (callback: (token: string) => void) => void; volume?: number; enableMediaSession?: boolean }) => SpotifyPlayer }
    blink?: {
      platform: string
      spotify: SpotifyBridge
    }
  }
}

export {}

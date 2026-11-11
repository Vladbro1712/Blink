interface SpotifyBridge {
  status: () => Promise<boolean>
  authenticate: (args: { authUrl: string; codeVerifier: string; state: string }) => Promise<unknown>
  api: (path: string) => Promise<unknown>
  disconnect: () => Promise<void>
}

declare global {
  interface Window {
    blink?: {
      platform: string
      spotify: SpotifyBridge
    }
  }
}

export {}

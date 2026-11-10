import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.blink.music',
  appName: 'Blink',
  webDir: 'dist',
  server: { androidScheme: 'https' },
}

export default config

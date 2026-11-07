import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.brushx.animator',
  appName: 'Brush X',
  webDir: 'dist',
  backgroundColor: '#080A0F',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
}

export default config

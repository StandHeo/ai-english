import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.aienglish.fruitforest',
  appName: 'Fruit Forest',
  webDir: 'dist',
  server: {
    // 允许 App(WebView HTTPS) 访问局域网 HTTP API，避免 Mixed Content
    cleartext: true,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
  },
}

export default config

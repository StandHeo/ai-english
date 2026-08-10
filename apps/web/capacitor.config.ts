import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.aienglish.fruitforest',
  appName: 'Fruit Forest',
  webDir: 'dist',
  server: {
    // 允许 App(WebView) 访问局域网 HTTP API，避免 Mixed Content
    cleartext: true,
    androidScheme: 'https',
    iosScheme: 'https',
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    // 安全区域由 Web CSS 处理；真机装包后若顶栏遮挡可再调
    contentInset: 'automatic',
  },
  // 用原生 HTTP 发请求，绕过 WebView 对 http://局域网 API 的 Mixed Content 拦截
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

/** 手机局域网调试：VITE_PHONE=1 时启用 HTTPS + 监听全网卡，以便浏览器允许麦克风 */
const phone = process.env.VITE_PHONE === '1'

export default defineConfig({
  plugins: [react(), ...(phone ? [basicSsl()] : [])],
  server: {
    host: phone ? '0.0.0.0' : undefined,
    proxy: {
      '/api': 'http://localhost:8787',
      '/health': 'http://localhost:8787',
    },
  },
})

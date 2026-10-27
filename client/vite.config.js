import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  server: {
    host: '0.0.0.0',
    port: 6600,
    strictPort: true,
    proxy: {
      '/api': {
        // 后端地址：默认本机 8080；换机器/连远端时用环境变量覆盖，避免把个人地址硬编码进共享配置
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8080',
        changeOrigin: true,   // 解决跨域
        // 如果后端接口路径也带 /api，就不需要 rewrite
        // rewrite: (path) => path.replace(/^\/api/, '') // 如果后端没有 /api 前缀才需要开
      }
    }
  }
})

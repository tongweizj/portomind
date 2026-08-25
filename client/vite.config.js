import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://192.168.2.150:9080', // 你的后端地址
        changeOrigin: true,   // 解决跨域
        // 如果后端接口路径也带 /api，就不需要 rewrite
        // rewrite: (path) => path.replace(/^\/api/, '') // 如果后端没有 /api 前缀才需要开
      }
    }
  }
})

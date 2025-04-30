import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx'
import './index.css'
// 1. 创建一个全局 QueryClient 实例
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 全局配置，可按需调整：
      retry: 1,
      staleTime: 1000 * 60, 
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <App />
    </QueryClientProvider>
)

// src/components/auth/authContext.js
// TASK-058 U2：会话 Context 与 useAuth hook（与 Provider 组件分文件，满足 react-refresh 约束）。
import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth 必须在 <AuthProvider> 内使用');
  return context;
}

// src/components/auth/RequireAuth.jsx
// TASK-058 U2：未登录守卫（FS §4.5 / D10）。
// 未登录深链 → /login?next=<pathname+search>；会话加载中显示占位，避免误跳登录页。
import { Navigate, Outlet, useLocation } from 'react-router';
import { LoadingState } from '../DataState';
import { useAuth } from './authContext';
import { buildLoginPath } from '../../utils/safeNext';

export default function RequireAuth() {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingState />;
  if (!isAuthenticated) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={buildLoginPath(next)} replace />;
  }
  return <Outlet />;
}

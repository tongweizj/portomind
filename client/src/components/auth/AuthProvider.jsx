// src/components/auth/AuthProvider.jsx
// TASK-058 U2：全站会话 Provider（TanStack Query 单一数据源 queryKey = ['session']）。
// - GET /api/auth/session 未登录也返回 200，故「未登录」是正常数据态而不是错误态；
// - 401 拦截器 → 本 Provider 清缓存并跳 /login?next=…（authSession 事件桥）；
// - login / logout / updateSessionUser 统一维护 ['session']，页面不各自拉会话。
import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSession,
  login as loginRequest,
  logout as logoutRequest
} from '../../services/auth.service';
import {
  setUnauthorizedHandler,
  setPasswordChangeRequiredHandler
} from '../../services/authSession';
import { buildLoginPath } from '../../utils/safeNext';
import { AuthContext } from './authContext';

const SESSION_KEY = ['session'];

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const sessionQuery = useQuery({
    queryKey: SESSION_KEY,
    queryFn: getSession,
    // 会话是准入依据：不缓存、不在窗口聚焦时静默刷新，避免「已登出但界面还在」的假象。
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false
  });

  /** 只清业务缓存，保留 session 键并由调用方显式写好，避免守卫短暂读到 undefined 而闪烁。 */
  const clearBusinessCache = useCallback(() => {
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== SESSION_KEY[0]
    });
  }, [queryClient]);

  const markUnauthenticated = useCallback(() => {
    queryClient.setQueryData(SESSION_KEY, { authenticated: false });
    clearBusinessCache();
  }, [queryClient, clearBusinessCache]);

  // 业务接口 401 / 403 PASSWORD_CHANGE_REQUIRED 的统一处置
  useEffect(() => {
    setUnauthorizedHandler(() => {
      const { pathname, search } = window.location;
      markUnauthenticated();
      // 已在登录页则不再跳转，避免自我重定向循环（登录失败本身不会触发本分支，见 api.js）
      if (pathname === '/login') return;
      navigate(buildLoginPath(`${pathname}${search}`), { replace: true });
    });
    setPasswordChangeRequiredHandler(() => {
      queryClient.invalidateQueries({ queryKey: SESSION_KEY });
    });
    return () => {
      setUnauthorizedHandler(null);
      setPasswordChangeRequiredHandler(null);
    };
  }, [markUnauthenticated, navigate, queryClient]);

  const login = useCallback(async (credentials) => {
    const data = await loginRequest(credentials);
    queryClient.setQueryData(SESSION_KEY, { authenticated: true, user: data.user });
    clearBusinessCache();
    return data.user;
  }, [queryClient, clearBusinessCache]);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // 登出失败也必须让本地进入未登录态：cookie 可能已失效，不能把用户困在界面里
    } finally {
      markUnauthenticated();
      navigate('/login', { replace: true });
    }
  }, [markUnauthenticated, navigate]);

  /** 改用户名 / 改密码后局部更新会话快照（顶栏身份行、强制改密闸门立即生效）。 */
  const updateSessionUser = useCallback((patch) => {
    queryClient.setQueryData(SESSION_KEY, (previous) => {
      if (!previous || !previous.authenticated) return previous;
      return { ...previous, user: { ...previous.user, ...patch } };
    });
  }, [queryClient]);

  const value = useMemo(() => {
    const session = sessionQuery.data;
    const user = session?.authenticated ? session.user : null;
    return {
      user,
      isLoading: sessionQuery.isLoading,
      isAuthenticated: Boolean(user),
      mustChangePassword: Boolean(user?.mustChangePassword),
      isAdmin: user?.role === 'admin',
      login,
      logout,
      updateSessionUser,
      refresh: () => queryClient.invalidateQueries({ queryKey: SESSION_KEY })
    };
  }, [sessionQuery.data, sessionQuery.isLoading, login, logout, updateSessionUser, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

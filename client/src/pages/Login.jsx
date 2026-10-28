// src/pages/Login.jsx
// TASK-058 U2：登录页（FS §4.1 / §4.5 / U2-R1）。不套 AppLayout（无侧栏/顶栏）。
// 失败文案由后端统一给出（「用户名或密码错误」/ 停用账号例外），前端不再自行判断账号是否存在。
// 登录成功：mustChangePassword → /account；否则落 safeNext(next) 或 /（D10）。
import { useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../components/auth/authContext';
import { getApiErrorMessage } from '../services/api';
import { safeNext } from '../utils/safeNext';
import { colors, radii, fontStack } from '../constants/design-tokens';

const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: radii.md,
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.bgCard,
  color: colors.textPrimary,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

export default function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // 登录成功后本组件会先收到 isAuthenticated=true，此标记避免与下面的手动跳转抢跑。
  const redirectingRef = useRef(false);

  if (!isLoading && isAuthenticated && !redirectingRef.current) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    if (!username.trim() || !password) {
      setError('请输入用户名与密码');
      return;
    }
    setSubmitting(true);
    try {
      const user = await login({ username: username.trim(), password });
      redirectingRef.current = true;
      if (user?.mustChangePassword) {
        navigate('/account', { replace: true });
      } else {
        const next = safeNext(searchParams.get('next'));
        navigate(next || '/', { replace: true });
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, '登录失败，请稍后重试'));
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        boxSizing: 'border-box',
        fontFamily: fontStack.sans,
        background: `linear-gradient(160deg, ${colors.bgPage} 0%, ${colors.brandSurface} 100%)`,
      }}
    >
      <div
        style={{
          width: 400,
          maxWidth: '100%',
          backgroundColor: colors.bgCard,
          border: `1px solid ${colors.border}`,
          borderRadius: 14,
          boxShadow: '0 20px 48px rgba(10, 37, 64, 0.12)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '28px 28px 8px' }}>
          <div
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              borderRadius: radii.md,
              backgroundColor: colors.brand,
              color: colors.textInverse,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            ✦
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, color: colors.textPrimary }}>PortoMind</div>
            <div style={{ fontSize: 12, color: colors.textMuted }}>家庭投资组合 · 登录</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '8px 28px 28px' }} noValidate>
          <div style={{ marginBottom: 14 }}>
            <label
              htmlFor="login-username"
              style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: colors.textSecondary }}
            >
              用户名
            </label>
            <input
              id="login-username"
              name="username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="用户名"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="login-password"
              style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: colors.textSecondary }}
            >
              密码
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="密码"
              style={inputStyle}
            />
          </div>

          {error && (
            <div
              role="alert"
              style={{
                marginBottom: 14,
                padding: '9px 12px',
                borderRadius: radii.md,
                border: `1px solid ${colors.danger}`,
                backgroundColor: colors.bgCard,
                color: colors.danger,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: radii.md,
              border: `1px solid ${colors.brand}`,
              backgroundColor: colors.brand,
              color: colors.textInverse,
              fontSize: 14,
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? '登录中…' : '登录'}
          </button>

          <div style={{ marginTop: 16, fontSize: 12, color: colors.textMuted, lineHeight: 1.6 }}>
            账号由管理员创建。忘记密码请联系管理员重置。
          </div>
        </form>
      </div>
    </div>
  );
}

// src/pages/Account.jsx
// TASK-058 U2：账户页（FS §4.3 / §4.5 / §13.2 / U2-R4·R5）。
// - 身份区只读；改用户名即时更新顶栏身份行（无需刷新）；
// - 改密码需校验当前密码；成功后该账号其它会话失效（当前会话保留）；
// - 强制改密态（mustChangePassword=true）：隐藏「修改用户名」卡，改密表单上首屏，无可跳过入口。
// 注：D-1 —— 强制改密态也要求「当前密码」（服务端 changeOwnPassword 强制校验，不接受旁路）。
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../components/auth/authContext';
import { changePassword, updateProfile } from '../services/auth.service';
import { getApiErrorMessage } from '../services/api';
import { USER_ROLE_LABELS } from '../constants/enums';
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

const cardStyle = {
  backgroundColor: colors.bgCard,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.lg,
  marginBottom: 16,
  fontFamily: fontStack.sans,
};

const cardHeadStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '14px 18px',
  borderBottom: `1px solid ${colors.border}`,
};

const cardBodyStyle = { padding: '16px 18px' };

const labelStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 500,
  color: colors.textSecondary,
};

const hintStyle = { marginTop: 10, fontSize: 12, color: colors.textMuted, lineHeight: 1.6 };

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function Chip({ tone = 'gray', children }) {
  const toneStyle = tone === 'brand'
    ? { backgroundColor: colors.brandSurface, color: colors.brand }
    : tone === 'warn'
      ? { backgroundColor: colors.bgCard, color: colors.warn, border: `1px solid ${colors.warn}` }
      : { backgroundColor: colors.bgPage, color: colors.textSecondary, border: `1px solid ${colors.border}` };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 9px',
        borderRadius: radii.pill,
        fontSize: 11,
        fontWeight: 600,
        ...toneStyle,
      }}
    >
      {children}
    </span>
  );
}

function Feedback({ error, success }) {
  if (!error && !success) return null;
  return (
    <p
      role={error ? 'alert' : 'status'}
      style={{
        margin: '0 0 12px',
        fontSize: 13,
        lineHeight: 1.6,
        color: error ? colors.danger : colors.down,
      }}
    >
      {error || success}
    </p>
  );
}

export default function Account() {
  const { user, mustChangePassword, updateSessionUser } = useAuth();
  const navigate = useNavigate();
  const forced = Boolean(mustChangePassword);

  const [newUsername, setNewUsername] = useState(user?.username || '');
  const [nameError, setNameError] = useState('');
  const [nameSuccess, setNameSuccess] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  if (!user) return null;

  const handleSaveUsername = async (event) => {
    event.preventDefault();
    if (savingName) return;
    setNameError('');
    setNameSuccess('');
    const nextUsername = newUsername.trim();
    if (!nextUsername) {
      setNameError('请输入新用户名');
      return;
    }
    if (nextUsername === user.username) {
      setNameError('新用户名与当前用户名相同');
      return;
    }
    setSavingName(true);
    try {
      const data = await updateProfile({ username: nextUsername });
      updateSessionUser({ username: data.user.username });
      setNewUsername(data.user.username);
      setNameSuccess('用户名已更新');
    } catch (requestError) {
      setNameError(getApiErrorMessage(requestError, '修改用户名失败'));
    } finally {
      setSavingName(false);
    }
  };

  const handleSavePassword = async (event) => {
    event.preventDefault();
    if (savingPassword) return;
    setPasswordError('');
    setPasswordSuccess('');
    if (!currentPassword) {
      setPasswordError(forced ? '请输入当前密码（管理员给你的初始密码）' : '请输入当前密码');
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 72) {
      setPasswordError('新密码需为 8–72 个字符');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (forced) {
        updateSessionUser({ mustChangePassword: false });
        navigate('/', { replace: true });
        return;
      }
      updateSessionUser({ mustChangePassword: false });
      setPasswordSuccess('密码已修改。该账号其他设备的会话已失效（当前会话保留）。');
    } catch (requestError) {
      setPasswordError(getApiErrorMessage(requestError, '修改密码失败'));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div style={{ fontFamily: fontStack.sans, maxWidth: 760 }}>
      {forced && (
        <div
          role="status"
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: radii.lg,
            border: `1px solid ${colors.warn}`,
            backgroundColor: colors.bgCard,
            fontSize: 13,
            lineHeight: 1.6,
            color: colors.textPrimary,
          }}
        >
          <span aria-hidden="true">🔒</span>
          <span>
            <b>首次登录需修改密码</b>{' '}除「修改密码」与顶栏下拉外，其余功能已锁定。
          </span>
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: colors.textPrimary, letterSpacing: 0.2 }}>账户设置</div>
        <div style={{ marginTop: 2, fontSize: 13, color: colors.textSecondary }}>
          管理你的身份与登录信息{user.role === 'admin' ? '　·　账号与权限在顶栏下拉「系统设置」' : ''}
        </div>
      </div>

      {/* 身份（只读） */}
      <section style={cardStyle}>
        <header style={cardHeadStyle}>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>身份</span>
          <span style={{ fontSize: 12, color: colors.textMuted }}>只读</span>
        </header>
        <div style={cardBodyStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px 14px', fontSize: 13, alignItems: 'center' }}>
            <span style={{ color: colors.textMuted }}>用户名</span>
            <span style={{ fontWeight: 600, color: colors.textPrimary }}>{user.username}</span>
            <span style={{ color: colors.textMuted }}>角色</span>
            <span>
              <Chip tone={user.role === 'admin' ? 'brand' : 'gray'}>
                {USER_ROLE_LABELS[user.role] || user.role}
              </Chip>
            </span>
            <span style={{ color: colors.textMuted }}>状态</span>
            <span><Chip tone="gray">启用</Chip></span>
            <span style={{ color: colors.textMuted }}>上次登录</span>
            <span style={{ fontWeight: 600, color: colors.textPrimary }}>{formatDateTime(user.lastLoginAt)}</span>
          </div>
        </div>
      </section>

      {/* 修改用户名（强制改密态隐藏：后端在强制改密期间只放行改密码/登出/查会话） */}
      {!forced && (
        <section style={cardStyle}>
          <header style={cardHeadStyle}>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>修改用户名</span>
          </header>
          <form style={cardBodyStyle} onSubmit={handleSaveUsername} noValidate>
            <Feedback error={nameError} success={nameSuccess} />
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="account-username" style={labelStyle}>新用户名</label>
              <input
                id="account-username"
                type="text"
                value={newUsername}
                onChange={(event) => setNewUsername(event.target.value)}
                style={inputStyle}
                autoComplete="username"
              />
            </div>
            <button
              type="submit"
              disabled={savingName}
              style={{
                padding: '8px 14px',
                borderRadius: radii.md,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bgCard,
                color: colors.textPrimary,
                fontSize: 13,
                fontWeight: 500,
                cursor: savingName ? 'not-allowed' : 'pointer',
                opacity: savingName ? 0.6 : 1,
              }}
            >
              {savingName ? '保存中…' : '保存用户名'}
            </button>
            <div style={hintStyle}>唯一性校验；保存后当前会话保持有效、界面即时刷新。</div>
          </form>
        </section>
      )}

      {/* 修改密码 */}
      <section style={cardStyle}>
        <header style={cardHeadStyle}>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>修改密码</span>
          <span style={{ fontSize: 12, color: colors.textMuted }}>{forced ? '必须优先完成' : '需校验当前密码'}</span>
        </header>
        <form style={cardBodyStyle} onSubmit={handleSavePassword} noValidate>
          <Feedback error={passwordError} success={passwordSuccess} />
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="account-current-password" style={labelStyle}>当前密码</label>
            <input
              id="account-current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              style={inputStyle}
              autoComplete="current-password"
            />
            {forced && <div style={hintStyle}>首次登录也需填写管理员给你的初始密码。</div>}
          </div>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="account-new-password" style={labelStyle}>新密码</label>
            <input
              id="account-new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="8–72 字符"
              style={inputStyle}
              autoComplete="new-password"
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="account-confirm-password" style={labelStyle}>确认新密码</label>
            <input
              id="account-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              style={inputStyle}
              autoComplete="new-password"
            />
          </div>
          <button
            type="submit"
            disabled={savingPassword}
            style={{
              padding: '9px 16px',
              borderRadius: radii.md,
              border: `1px solid ${colors.brand}`,
              backgroundColor: colors.brand,
              color: colors.textInverse,
              fontSize: 13,
              fontWeight: 600,
              cursor: savingPassword ? 'not-allowed' : 'pointer',
              opacity: savingPassword ? 0.6 : 1,
            }}
          >
            {savingPassword ? '保存中…' : (forced ? '设定新密码并进入' : '保存密码')}
          </button>
          <div style={hintStyle}>
            保存后，<b>该账号其他设备的会话立即失效</b>（当前会话保留）。
          </div>
        </form>
      </section>
    </div>
  );
}

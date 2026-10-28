// src/components/layout/UserMenu.jsx
// TASK-058 U2：顶栏头像下拉（FS §4.5 / §13.2 / D11·D12·D13 / v1.5）。
// 账户与登出的唯一入口：
//   身份行（用户名 + 角色同一行，角色弱化）+ 分隔线 + 账户设置 + 系统设置（仅 admin）
//   + 提醒规则 + 退出登录（末位）。member 恰 3 个动作项 / admin 恰 4 个。
// 强制改密态：下拉仍可用（登出不被挡），仅「系统设置」保留但禁用并提示原因（§13.3-8）。
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '../auth/authContext';
import { colors, radii, fontStack } from '../../constants/design-tokens';
import { USER_ROLE_LABELS } from '../../constants/enums';

const menuItemStyle = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '8px 12px',
  borderRadius: radii.sm,
  border: 'none',
  background: 'none',
  color: colors.textSecondary,
  fontSize: 13,
  fontWeight: 500,
  fontFamily: fontStack.sans,
  cursor: 'pointer',
};

export default function UserMenu() {
  const { user, mustChangePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // 点击外部 / Esc 关闭（FS §4.5）
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const isAdmin = user.role === 'admin';
  const initial = (user.username || '?').slice(0, 1).toUpperCase();

  const pick = (path) => {
    setOpen(false);
    navigate(path);
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="user-menu-panel"
        title="账户菜单"
        aria-label="账户菜单"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: 0,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontFamily: fontStack.sans,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            backgroundColor: colors.brand,
            color: colors.textInverse,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {initial}
        </span>
        <ChevronDown size={14} color={colors.textMuted} aria-hidden="true" />
      </button>

      {open && (
        <div
          id="user-menu-panel"
          role="menu"
          aria-label="账户菜单"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            width: 200,
            backgroundColor: colors.bgCard,
            border: `1px solid ${colors.border}`,
            borderRadius: radii.lg,
            boxShadow: '0 12px 32px rgba(10, 37, 64, 0.14)',
            padding: 6,
            zIndex: 50,
            fontFamily: fontStack.sans,
          }}
        >
          {/* 身份行：只读（非 a/button），用户名 + 角色同一行，角色弱化 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 12px 8px',
              cursor: 'default',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.username}
            </span>
            <span style={{ fontSize: 12, fontWeight: 500, color: colors.textMuted, flexShrink: 0 }}>
              {USER_ROLE_LABELS[user.role] || user.role}
            </span>
          </div>

          <div style={{ height: 1, backgroundColor: colors.border, margin: '4px 6px' }} />

          <button type="button" role="menuitem" style={menuItemStyle} onClick={() => pick('/account')}>
            账户设置
          </button>

          {isAdmin && (
            <button
              type="button"
              role="menuitem"
              disabled={mustChangePassword}
              title={mustChangePassword ? '请先完成密码修改' : undefined}
              style={{
                ...menuItemStyle,
                opacity: mustChangePassword ? 0.45 : 1,
                cursor: mustChangePassword ? 'not-allowed' : 'pointer',
              }}
              onClick={() => pick('/account/users')}
            >
              系统设置
            </button>
          )}

          <button type="button" role="menuitem" style={menuItemStyle} onClick={() => pick('/alerts/rules')}>
            提醒规则
          </button>

          <button
            type="button"
            role="menuitem"
            style={{ ...menuItemStyle, color: colors.danger }}
            onClick={handleLogout}
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}

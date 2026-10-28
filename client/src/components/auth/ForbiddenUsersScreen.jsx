// src/components/auth/ForbiddenUsersScreen.jsx
// TASK-058 U3：member 直访 /account/users 的 403 说明屏（FS U3-R5 / D13：不静默）。
import { useNavigate } from 'react-router';
import { colors, fontStack, radii } from '../../constants/design-tokens';

export default function ForbiddenUsersScreen() {
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ minHeight: '60vh', fontFamily: fontStack.sans, textAlign: 'center' }}
    >
      <div style={{ fontSize: 40, lineHeight: 1 }} aria-hidden="true">🚫</div>
      <h1 style={{ marginTop: 16, fontSize: 20, fontWeight: 700, color: colors.textPrimary }}>
        无权访问用户管理
      </h1>
      <p style={{ marginTop: 8, maxWidth: 460, fontSize: 14, color: colors.textSecondary, lineHeight: 1.7 }}>
        当前账号为「成员」角色，无法管理用户。如需管理请联系管理员。
      </p>
      <button
        type="button"
        onClick={() => navigate('/')}
        style={{
          marginTop: 20,
          padding: '10px 18px',
          borderRadius: radii.md,
          border: 'none',
          cursor: 'pointer',
          backgroundColor: colors.brand,
          color: colors.textInverse,
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        返回 Dashboard
      </button>
    </div>
  );
}

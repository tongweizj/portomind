// src/components/auth/ForcedChangeScreen.jsx
// TASK-058 U2：强制改密闸门（FS §4.2 / §13.3-1 / D10）。
// 除 /account 外的任何页面在 mustChangePassword=true 时显示本屏，无可跳过入口。
import { useNavigate } from 'react-router';
import { colors, fontStack, radii } from '../../constants/design-tokens';

export default function ForcedChangeScreen() {
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ minHeight: '60vh', fontFamily: fontStack.sans, textAlign: 'center' }}
    >
      <div style={{ fontSize: 40, lineHeight: 1 }} aria-hidden="true">🔒</div>
      <h1 style={{ marginTop: 16, fontSize: 20, fontWeight: 700, color: colors.textPrimary }}>
        需要修改密码后才能继续
      </h1>
      <p style={{ marginTop: 8, maxWidth: 460, fontSize: 14, color: colors.textSecondary, lineHeight: 1.7 }}>
        根据安全策略，你的账号需先设置自己的密码。请完成修改，此步骤无可跳过入口。
      </p>
      <button
        type="button"
        onClick={() => navigate('/account')}
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
        前往修改密码
      </button>
    </div>
  );
}

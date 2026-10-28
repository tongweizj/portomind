// src/components/users/ResetPasswordModal.jsx
// TASK-058 U3：重置他人密码弹窗（FS §4.4 / D9）。
// - 只能重置「他人」：自己那一行不提供本入口，自助改密走 /account（页面保证，弹窗内再写明约束）；
// - 成功后服务端删除目标用户全部会话 + 置 mustChangePassword=true；
// - 失败展示后端 message（如 SELF_RESET_FORBIDDEN）。
import { useState } from 'react';
import { getApiErrorMessage } from '../../services/api';
import { colors, fontStack, radii } from '../../constants/design-tokens';

// 与 FS §8 一致：8–72 个字符
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;

const labelStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 500,
  color: colors.textSecondary,
};

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

const hintStyle = { marginTop: 10, fontSize: 12, color: colors.textMuted, lineHeight: 1.6 };

const errorStyle = {
  marginTop: 12,
  padding: '8px 12px',
  borderRadius: radii.md,
  border: `1px solid ${colors.danger}`,
  backgroundColor: colors.bgCard,
  color: colors.danger,
  fontSize: 13,
  lineHeight: 1.6,
};

const secondaryButton = {
  padding: '8px 14px',
  borderRadius: radii.md,
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.bgCard,
  color: colors.textPrimary,
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const primaryButton = {
  ...secondaryButton,
  border: `1px solid ${colors.brand}`,
  backgroundColor: colors.brand,
  color: colors.textInverse,
  fontWeight: 600,
};

/**
 * @param {{id: string, username: string}} user 被重置密码的目标用户（页面保证不是自己）
 * @param {() => void} onClose 关闭弹窗
 * @param {(newPassword: string) => Promise<void>} onSubmit
 *        由页面执行 mutateAsync；成功时页面负责关闭弹窗，失败时抛回本组件展示 message。
 */
export default function ResetPasswordModal({ user, onClose, onSubmit }) {
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) {
      setError(`新密码需为 ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} 个字符`);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(newPassword);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, '重置密码失败'));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ fontFamily: fontStack.sans }}>
      {/* 遮罩：点击遮罩关闭；颜色取自设计 token（textPrimary + opacity），不引入新色值 */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, backgroundColor: colors.textPrimary, opacity: 0.45 }}
      />

      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-password-title"
        noValidate
        onSubmit={handleSubmit}
        className="relative w-full shadow-xl"
        style={{
          maxWidth: 420,
          backgroundColor: colors.bgCard,
          border: `1px solid ${colors.border}`,
          borderRadius: radii.lg,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}` }}>
          <h2 id="reset-password-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>
            重置密码 · {user.username}
          </h2>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <div>
            <label htmlFor="reset-password-value" style={labelStyle}>新密码</label>
            <input
              id="reset-password-value"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="8–72 个字符"
              style={inputStyle}
            />
          </div>

          {error && <div role="alert" style={errorStyle}>{error}</div>}

          <div style={hintStyle}>
            重置后该用户全部会话立即失效，下次登录必须改密。<b>不能重置自己的密码</b>——请到「账户设置」自助修改。
          </div>
        </div>

        <div
          className="flex justify-end"
          style={{
            gap: 8,
            padding: '14px 20px',
            borderTop: `1px solid ${colors.border}`,
            backgroundColor: colors.bgPage,
          }}
        >
          <button type="button" onClick={onClose} disabled={submitting} style={secondaryButton}>
            取消
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              ...primaryButton,
              opacity: submitting ? 0.6 : 1,
              cursor: submitting ? 'wait' : 'pointer',
            }}
          >
            {submitting ? '重置中…' : '重置'}
          </button>
        </div>
      </form>
    </div>
  );
}

// src/components/users/CreateUserModal.jsx
// TASK-058 U3：新建用户弹窗（FS §4.4 / U3-R2）。
// - 受控 div 遮罩 + role="dialog" + aria-modal（D-10，不引入第三方弹窗库）；
// - 初始密码由管理员设定 → 服务端置 mustChangePassword=true，对方首次登录强制改密；
// - 失败一律展示后端 message（getApiErrorMessage）：如 USERNAME_TAKEN →「用户名已存在」。
import { useState } from 'react';
import { getApiErrorMessage } from '../../services/api';
import { USER_ROLES } from '../../constants/enums';
import { colors, fontStack, radii } from '../../constants/design-tokens';

// 与 shared/models/user.js 的 USERNAME_PATTERN 对齐：小写字母/数字开头，3–32 位，可含 _ . -
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{2,31}$/;
// 与 FS §8 一致：8–72 个字符（bcrypt 有效上限）
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
 * @param {() => void} onClose 关闭弹窗
 * @param {(payload: {username: string, password: string, role: string}) => Promise<void>} onSubmit
 *        由页面执行 mutateAsync；成功时页面负责关闭弹窗，失败时抛回本组件展示 message。
 */
export default function CreateUserModal({ onClose, onSubmit }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('member');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    const normalizedUsername = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setError('用户名需为 3–32 位小写字母/数字，可含 _ . -，且以字母或数字开头');
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      setError(`初始密码需为 ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} 个字符`);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ username: normalizedUsername, password, role });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, '创建用户失败'));
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
        aria-labelledby="create-user-title"
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
          <h2 id="create-user-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>
            新建用户
          </h2>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="create-user-username" style={labelStyle}>用户名</label>
            <input
              id="create-user-username"
              name="username"
              type="text"
              autoComplete="off"
              autoFocus
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="小写字母/数字，3–32 位"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label htmlFor="create-user-password" style={labelStyle}>初始密码</label>
            <input
              id="create-user-password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8–72 个字符"
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="create-user-role" style={labelStyle}>角色</label>
            <select
              id="create-user-role"
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              style={inputStyle}
            >
              {USER_ROLES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {error && <div role="alert" style={errorStyle}>{error}</div>}

          <div style={hintStyle}>初始密码由管理员设定，对方首次登录需强制改密。</div>
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
            {submitting ? '创建中…' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}

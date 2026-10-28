// src/pages/AccountUsers.jsx
// TASK-058 U3：系统设置页（管理员用户管理，路由 /account/users；FS §4.4 / §6.3 / §13.2，D13 独立页面）。
// 规则要点：
// - 非 admin 直访 → ForbiddenUsersScreen（U3-R5，不静默、不空白）；
// - 用户只可停用/启用，不可删除（NG8）；新建账号由管理员设定初始密码 → 对方首登强制改密；
// - 自己那一行不提供「重置密码」（会清掉自己全部会话，D9），改为「改密码」跳 /account；
// - 唯一启用 admin 的「停用」「降级」按钮禁用 + title 说明原因（D-9），后端 409 仍兜底展示 message；
// - 行内操作成功 → 失效 ['users'] 缓存；改自己的角色 → 同步会话快照（顶栏入口据此立即隐藏）。
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../components/auth/authContext';
import ForbiddenUsersScreen from '../components/auth/ForbiddenUsersScreen';
import { EmptyState, ErrorState, LoadingState } from '../components/DataState';
import CreateUserModal from '../components/users/CreateUserModal';
import ResetPasswordModal from '../components/users/ResetPasswordModal';
import {
  useCreateUser,
  useResetUserPassword,
  useUpdateUser,
  useUsers
} from '../hooks/useUsers';
import { getApiErrorMessage } from '../services/api';
import { USER_ROLE_LABELS, USER_ROLES } from '../constants/enums';
import { colors, fontStack, radii } from '../constants/design-tokens';

const buttonBase = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '8px 14px',
  borderRadius: radii.md,
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.bgCard,
  color: colors.textPrimary,
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const primaryButton = {
  ...buttonBase,
  border: `1px solid ${colors.brand}`,
  backgroundColor: colors.brand,
  color: colors.textInverse,
  fontWeight: 600,
};

const smallButton = {
  ...buttonBase,
  padding: '4px 10px',
  fontSize: 12,
};

const roleSelectStyle = {
  padding: '4px 8px',
  borderRadius: radii.sm,
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.bgCard,
  color: colors.textPrimary,
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const cellStyle = { padding: '10px 14px', verticalAlign: 'middle' };

const headCellStyle = {
  ...cellStyle,
  fontSize: 12,
  fontWeight: 600,
  color: colors.textSecondary,
  whiteSpace: 'nowrap',
  borderBottom: `1px solid ${colors.border}`,
};

const CHIP_TONE_STYLES = {
  brand: {
    backgroundColor: colors.brandSurface,
    color: colors.brand,
    border: `1px solid ${colors.brandSurfaceHover}`,
  },
  success: {
    backgroundColor: colors.bgCard,
    color: colors.down,
    border: `1px solid ${colors.down}`,
  },
  warning: {
    backgroundColor: colors.bgCard,
    color: colors.warn,
    border: `1px solid ${colors.warn}`,
  },
  gray: {
    backgroundColor: colors.bgPage,
    color: colors.textSecondary,
    border: `1px solid ${colors.border}`,
  },
};

function Chip({ tone = 'gray', children }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 9px',
        borderRadius: radii.pill,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
        ...CHIP_TONE_STYLES[tone],
      }}
    >
      {children}
    </span>
  );
}

/** 时间统一按中文区域格式展示；null / 非法值显示 '—'（FS：上次登录、创建时间）。 */
function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatRole(role) {
  return USER_ROLE_LABELS[role] || role;
}

const successBannerStyle = {
  marginTop: 16,
  padding: '10px 14px',
  borderRadius: radii.md,
  border: `1px solid ${colors.down}`,
  backgroundColor: colors.bgCard,
  color: colors.textPrimary,
  fontSize: 13,
  lineHeight: 1.6,
};

const errorBannerStyle = {
  ...successBannerStyle,
  border: `1px solid ${colors.danger}`,
  color: colors.danger,
};

const invariantBannerStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  marginTop: 16,
  padding: '12px 16px',
  borderRadius: radii.lg,
  border: `1px solid ${colors.warn}`,
  backgroundColor: colors.bgCard,
  color: colors.textPrimary,
  fontSize: 13,
  lineHeight: 1.6,
};

export default function AccountUsers() {
  const navigate = useNavigate();
  const { user, isAdmin, updateSessionUser } = useAuth();
  // 非 admin 不发必然 403 的列表请求（403 屏由本页渲染，见下方角色守卫）
  const { data: users, isLoading, isError, refetch } = useUsers({ enabled: isAdmin });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetUserPassword();

  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // 唯一启用 admin 守护的判断基于服务端列表事实（D-9），不依赖本地推断
  const activeAdminCount = users.filter((item) => item.active && item.role === 'admin').length;
  const onlyOneActiveAdmin = activeAdminCount <= 1;

  const clearFeedback = () => {
    setNotice('');
    setActionError('');
  };

  const handleRefresh = async () => {
    clearFeedback();
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreateUser = async (payload) => {
    // 失败时抛出，由 CreateUserModal 展示后端 message（如 USERNAME_TAKEN）
    await createUser.mutateAsync(payload);
    setCreateOpen(false);
    setNotice('已创建用户，对方首次登录需改密');
  };

  const handleResetPassword = async (newPassword) => {
    // 失败时抛出，由 ResetPasswordModal 展示后端 message（如 SELF_RESET_FORBIDDEN）
    await resetPassword.mutateAsync({ id: resetTarget.id, newPassword });
    setResetTarget(null);
    setNotice('已重置密码，该用户全部会话已失效，下次登录必须改密');
  };

  const handleRoleChange = async (target, nextRole) => {
    if (nextRole === target.role) return;
    clearFeedback();
    const isSelf = String(target.id) === String(user?.id);
    try {
      await updateUser.mutateAsync({ id: target.id, patch: { role: nextRole } });
      if (isSelf) {
        // 权限即时生效（D9）：同步会话快照 → 顶栏「系统设置」入口与本人页权限立即更新
        updateSessionUser({ role: nextRole });
        setNotice(`你的角色已改为「${formatRole(nextRole)}」，你已失去用户管理权限`);
      } else {
        setNotice(`「${target.username}」的角色已改为「${formatRole(nextRole)}」`);
      }
    } catch (error) {
      // 409 LAST_ADMIN_PROTECTED 等必须兜底展示，不得静默
      setActionError(getApiErrorMessage(error, '修改角色失败'));
    }
  };

  const handleToggleActive = async (target) => {
    clearFeedback();
    const nextActive = !target.active;
    try {
      await updateUser.mutateAsync({ id: target.id, patch: { active: nextActive } });
      setNotice(nextActive
        ? `已启用「${target.username}」`
        : `已停用「${target.username}」，其现有会话已失效`);
    } catch (error) {
      // 409 CANNOT_DEACTIVATE_SELF / LAST_ADMIN_PROTECTED 等必须兜底展示，不得静默
      setActionError(getApiErrorMessage(error, '操作失败'));
    }
  };

  // 角色守卫（U3-R5 / D6）：member 直访 URL → 403 说明屏，不是空白也不是静默
  if (!isAdmin) return <ForbiddenUsersScreen />;

  const openCreate = () => {
    clearFeedback();
    setCreateOpen(true);
  };

  return (
    <div style={{ fontFamily: fontStack.sans, color: colors.textPrimary }}>
      {/* 页头：独立页面自有页头（D13） */}
      <div className="flex items-start justify-between" style={{ gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: 0.2 }}>系统设置</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textSecondary }}>
            账号仅由管理员创建；用户只可停用，不可删除
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          title="重新加载用户列表"
          style={{
            ...buttonBase,
            opacity: refreshing ? 0.6 : 1,
            cursor: refreshing ? 'wait' : 'pointer',
          }}
        >
          {refreshing ? '刷新中…' : '↻ 刷新'}
        </button>
      </div>

      {notice && (
        <div role="status" style={successBannerStyle}>
          <span aria-hidden="true">✅</span> {notice}
        </div>
      )}
      {actionError && (
        <div role="alert" style={errorBannerStyle}>
          <span aria-hidden="true">⚠️</span> {actionError}
        </div>
      )}

      {/* 工具栏：始终可见 —— 加载失败 / 空列表时也能新建用户 */}
      <div
        className="flex items-center justify-between"
        style={{ gap: 12, flexWrap: 'wrap', marginTop: 18 }}
      >
        <button type="button" onClick={openCreate} style={primaryButton}>＋ 新建用户</button>
        {!isLoading && !isError && (
          <span style={{ fontSize: 13, color: colors.textSecondary }}>
            共 {users.length} 个账号 · 启用管理员 {activeAdminCount} 个
          </span>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        {isLoading ? <LoadingState />
          : isError ? <ErrorState />
            : users.length === 0 ? (
              <div>
                <EmptyState />
                <div style={{ marginTop: 10, textAlign: 'center' }}>
                  <button type="button" onClick={openCreate} style={primaryButton}>＋ 新建用户</button>
                </div>
              </div>
            ) : (
              <div
                className="overflow-x-auto"
                style={{
                  backgroundColor: colors.bgCard,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radii.lg,
                }}
              >
                <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ backgroundColor: colors.bgPage, textAlign: 'left' }}>
                      <th style={headCellStyle}>用户名</th>
                      <th style={headCellStyle}>角色</th>
                      <th style={headCellStyle}>状态</th>
                      <th style={headCellStyle}>上次登录</th>
                      <th style={headCellStyle}>创建时间</th>
                      <th style={headCellStyle}>改密</th>
                      <th style={{ ...headCellStyle, textAlign: 'right' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((item) => {
                      const isSelf = String(item.id) === String(user?.id);
                      // 唯一启用 admin：停用 / 降级均禁用（D-9，按钮的判断依据是服务端列表事实）
                      const isLastActiveAdmin = item.active && item.role === 'admin' && onlyOneActiveAdmin;
                      const deactivateDisabled = item.active && (isSelf || isLastActiveAdmin);
                      // 两个禁用条件可能同时成立（典型：唯一启用的 admin 就是自己）：
                      // title 同时写明两条原因，避免「换一种说法就不提示」的静默感（D-9）。
                      const deactivateReasons = [];
                      if (isSelf) deactivateReasons.push('不能停用自己');
                      if (isLastActiveAdmin) deactivateReasons.push('最后一个启用管理员，不可停用');
                      const deactivateTitle = !item.active
                        ? '启用该账号'
                        : deactivateReasons.length > 0
                          ? deactivateReasons.join('；')
                          : '停用后该用户现有会话立即失效';
                      return (
                        <tr key={item.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                          <td style={cellStyle}>
                            <span style={{ fontWeight: 600 }}>{item.username}</span>
                            {isSelf && (
                              <span style={{ marginLeft: 8 }}>
                                <Chip tone="gray">你</Chip>
                              </span>
                            )}
                          </td>
                          <td style={cellStyle}>
                            <Chip tone={item.role === 'admin' ? 'brand' : 'gray'}>{formatRole(item.role)}</Chip>
                          </td>
                          <td style={cellStyle}>
                            <Chip tone={item.active ? 'success' : 'gray'}>{item.active ? '启用' : '停用'}</Chip>
                          </td>
                          <td style={{ ...cellStyle, color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                            {formatDateTime(item.lastLoginAt)}
                          </td>
                          <td style={{ ...cellStyle, color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                            {formatDateTime(item.createdAt)}
                          </td>
                          <td style={cellStyle}>
                            {item.mustChangePassword
                              ? <Chip tone="warning">待改密</Chip>
                              : <span style={{ color: colors.textMuted }}>—</span>}
                          </td>
                          <td style={{ ...cellStyle, textAlign: 'right' }}>
                            <div className="flex items-center justify-end" style={{ gap: 6, flexWrap: 'wrap' }}>
                              {/* D9：自己那一行不提供「重置密码」（会清掉自己全部会话），改为「改密码」走 /account */}
                              {isSelf ? (
                                <button
                                  type="button"
                                  onClick={() => navigate('/account')}
                                  title="重置自己的密码会清掉自己全部会话，请到账户页自助修改（D9）"
                                  style={smallButton}
                                >
                                  改密码
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    clearFeedback();
                                    setResetTarget(item);
                                  }}
                                  style={smallButton}
                                >
                                  重置密码
                                </button>
                              )}

                              <select
                                value={item.role}
                                disabled={isLastActiveAdmin}
                                title={isLastActiveAdmin ? '最后一个启用管理员，不可降级' : '修改角色'}
                                aria-label={`修改 ${item.username} 的角色`}
                                onChange={(event) => handleRoleChange(item, event.target.value)}
                                style={{
                                  ...roleSelectStyle,
                                  ...(isLastActiveAdmin ? { opacity: 0.5, cursor: 'not-allowed' } : null),
                                }}
                              >
                                {USER_ROLES.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>

                              <button
                                type="button"
                                onClick={() => handleToggleActive(item)}
                                disabled={deactivateDisabled}
                                title={deactivateTitle}
                                style={{
                                  ...smallButton,
                                  ...(deactivateDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : null),
                                }}
                              >
                                {item.active ? '停用' : '启用'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
      </div>

      {/* 核心不变量提示条（FS §4.4 / §13.3-3）：明确告知「不会静默失败」 */}
      <div role="note" style={invariantBannerStyle}>
        <span aria-hidden="true">🛡️</span>
        <span>
          <b>系统不变量：</b>任意时刻至少有一个启用状态的管理员。停用/降级唯一管理员的操作按钮会被禁用并提示原因（不会静默失败）。
        </span>
      </div>

      {createOpen && (
        <CreateUserModal onClose={() => setCreateOpen(false)} onSubmit={handleCreateUser} />
      )}
      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onSubmit={handleResetPassword}
        />
      )}
    </div>
  );
}

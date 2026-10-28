// src/components/layout/AppLayout.jsx
// 与 Ardot 设计稿 Component/Topbar 对齐：
//   - 高 64px、底色 #FFFFFF、底部 1px #E3E8EE 分隔
//   - 左侧：Logo + 名称（移动到 Sidebar 后此处只放页签/面包屑占位）
//   - 右侧：搜索框 + 铃铛（含未读徽标，跳 /alerts/rules）+ 账户头像下拉（TASK-058 U2）
// 强制改密闸门（TASK-058 U2 / FS §4.2）：mustChangePassword=true 时，除 /account 外的页面
// 只渲染「需要修改密码后才能继续」屏——业务页不挂载，避免整页并行发请求全 403 的噪声。
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Bell, Search } from 'lucide-react';
import Sidebar from './Sidebar';
import UserMenu from './UserMenu';
import { useUnreadAlertCount } from '../../hooks/useAlerts';
import { useAuth } from '../auth/authContext';
import ForcedChangeScreen from '../auth/ForcedChangeScreen';
import { colors, layout, fontStack } from '../../constants/design-tokens';
import { GAP_THRESHOLD_DAYS } from '../../utils/priceDisplay';

export default function AppLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { mustChangePassword } = useAuth();
  // 强制改密期间只放行改密码/登出/查会话，未读徽标轮询会被 403 → 直接停掉，避免噪声请求
  const { count } = useUnreadAlertCount({ enabled: !mustChangePassword });
  const forcedPasswordChange = mustChangePassword && pathname !== '/account';

  return (
    <div
      className="flex min-h-screen"
      style={{ backgroundColor: colors.bgPage, fontFamily: fontStack.sans }}
    >
      <Sidebar />

      {/* 避开 Sidebar（232） */}
      <div
        className="flex-1 flex flex-col"
        style={{ marginLeft: layout.sidebarWidth }}
      >
        {/* 顶部导航栏：64px、白底、底部 1px 边 */}
        <header
          className="flex items-center justify-between"
          style={{
            height: layout.topbarHeight,
            padding: '0 32px',
            backgroundColor: colors.bgCard,
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          {/* 左侧：面包屑占位 + 数据告警 pill（FS R3：标红阈值） */}
          <div className="flex items-center gap-3">
            <div
              style={{
                color: colors.textSecondary,
                fontSize: 13,
              }}
            >
              {/* 后续可接入 useMatches 渲染面包屑 */}
            </div>
            <div
              style={{
                fontSize: 12,
                color: colors.textSecondary,
                backgroundColor: colors.bgPage,
                border: `1px solid ${colors.border}`,
                borderRadius: 999,
                padding: '4px 12px',
              }}
              title={`价格缺口告警：某标的落后同市场其他标的工作日 ${GAP_THRESHOLD_DAYS} 天以上即标红（同组一致停更不计为缺口）`}
            >
              标红阈值 <b style={{ color: colors.brand }}>落后同市场 {GAP_THRESHOLD_DAYS} 个工作日</b>
            </div>
          </div>

          {/* 右侧：搜索 + 铃铛 + 账户下拉（唯一账户/登出入口） */}
          <div className="flex items-center gap-5">
            <div className="relative">
              <input
                type="text"
                placeholder="搜索..."
                className="text-sm focus:outline-none"
                style={{
                  padding: '8px 12px 8px 36px',
                  width: 256,
                  borderRadius: 8,
                  backgroundColor: colors.bgPage,
                  border: `1px solid ${colors.border}`,
                  color: colors.textPrimary,
                }}
              />
              <Search
                className="absolute"
                style={{ left: 12, top: 10, color: colors.textMuted }}
                size={16}
              />
            </div>

            {/* 提醒中心入口：未读徽标（PRD AL-07 / FAM-03） */}
            <button
              type="button"
              onClick={() => navigate('/alerts/rules')}
              title="提醒中心"
              className="relative flex items-center justify-center transition-colors"
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bgCard,
              }}
            >
              <Bell size={18} color={colors.textSecondary} />
              {count > 0 && (
                <span
                  className="absolute flex items-center justify-center font-semibold"
                  style={{
                    top: -6,
                    right: -6,
                    minWidth: 20,
                    height: 20,
                    padding: '0 4px',
                    borderRadius: 999,
                    backgroundColor: colors.danger,
                    color: colors.textInverse,
                    fontSize: 11,
                    lineHeight: 1,
                  }}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>

            {/* TASK-058 U2：账户设置 / 系统设置（仅 admin）/ 提醒规则 / 退出登录 */}
            <UserMenu />
          </div>
        </header>

        {/* 主体内容区域 */}
        <main
          className="flex-1 overflow-y-auto"
          style={{
            padding: `${layout.contentPaddingY}px ${layout.contentPaddingX}px`,
          }}
        >
          {forcedPasswordChange ? <ForcedChangeScreen /> : <Outlet />}
        </main>
      </div>
    </div>
  );
}

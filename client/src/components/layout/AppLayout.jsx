// src/components/layout/AppLayout.jsx
// 与 Ardot 设计稿 Component/Topbar 对齐：
//   - 高 64px、底色 #FFFFFF、底部 1px #E3E8EE 分隔
//   - 左侧：Logo + 名称（移动到 Sidebar 后此处只放页签/面包屑占位）
//   - 右侧：搜索框 + 铃铛（含未读徽标，跳 /alerts/rules）+ 用户头像
import { Outlet, useNavigate } from 'react-router';
import { Bell, Search, User } from 'lucide-react';
import Sidebar from './Sidebar';
import { useUnreadAlertCount } from '../../hooks/useAlerts';
import { colors, layout, fontStack } from '../../constants/design-tokens';

export default function AppLayout() {
  const navigate = useNavigate();
  const { count } = useUnreadAlertCount();

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
          {/* 左侧：面包屑占位（保持与设计稿一致的高度与留白） */}
          <div
            style={{
              color: colors.textSecondary,
              fontSize: 13,
            }}
          >
            {/* 后续可接入 useMatches 渲染面包屑 */}
          </div>

          {/* 右侧：搜索 + 铃铛 + 用户 */}
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

            <button
              type="button"
              className="flex items-center justify-center transition-colors"
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bgCard,
              }}
              title="账户"
            >
              <User size={18} color={colors.textSecondary} />
            </button>
          </div>
        </header>

        {/* 主体内容区域 */}
        <main
          className="flex-1 overflow-y-auto"
          style={{
            padding: `${layout.contentPaddingY}px ${layout.contentPaddingX}px`,
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

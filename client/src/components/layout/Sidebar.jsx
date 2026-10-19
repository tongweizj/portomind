// src/components/layout/Sidebar.jsx
// 与 Ardot 设计稿 Component/Sidebar 对齐：
//   - 宽 232px、底色 #F6F8FA、与主内容用 1px 右边框 #E3E8EE 分隔
//   - 顶部：紫底白方块 logo + "PortoMind" 文字
//   - 段标题「总览」灰小字
//   - 导航项：默认 #5E6B7E，激活态 #EEEDFF 底 + #635BFF 紫文，圆角 8
//   - 底部：分隔线 + 「退出登录」+ 版本号 v0.9.2 · 自托管
// 信息架构（FS-asset-price-consolidation）：顶层 8 → 7 项；
//   原「资产管理」移出导航，收敛为「今日行情」屏内入口；「价格」→「今日行情」+「监控」badge。
import { NavLink } from 'react-router';
import {
  LayoutDashboard, LineChart, ListOrdered, FileText, LogOut, Layers, Bell, Users
} from 'lucide-react';
import { colors, layout, fontStack, radii } from '../../constants/design-tokens';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard · 提醒', end: true },
  { to: '/portfolios', icon: Layers, label: '组合管理' },
  { to: '/prices', icon: LineChart, label: '今日行情', badge: '监控' },
  { to: '/transactions', icon: ListOrdered, label: '交易记录' },
  { to: '/family', icon: Users, label: '家庭视图' },
  { to: '/alerts/rules', icon: Bell, label: '提醒规则' },
  { to: '/logs', icon: FileText, label: '日志' },
];

export default function Sidebar() {
  return (
    <aside
      style={{
        width: layout.sidebarWidth,
        backgroundColor: colors.bgPage,
        borderRight: `1px solid ${colors.border}`,
        fontFamily: fontStack.sans,
        color: colors.textPrimary,
      }}
      className="h-screen fixed top-0 left-0 z-30 flex flex-col"
    >
      {/* Logo 块 */}
      <div className="flex items-center gap-2 px-6 pt-6 pb-2">
        <div
          style={{
            width: 28,
            height: 28,
            backgroundColor: colors.brand,
            borderRadius: radii.sm,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-hidden="true"
        >
          <span
            style={{
              color: colors.textInverse,
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            ✦
          </span>
        </div>
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: colors.textPrimary,
            letterSpacing: 0.2,
          }}
        >
          PortoMind
        </span>
      </div>

      {/* 段标题：总览 */}
      <div
        style={{
          color: colors.textMuted,
          fontSize: 12,
          padding: '20px 24px 8px 24px',
        }}
      >
        总览
      </div>

      {/* 导航项（7 项） */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2 text-sm transition-colors',
                isActive ? 'font-semibold' : 'font-medium',
              ].join(' ')
            }
            style={({ isActive }) => ({
              borderRadius: radii.md,
              color: isActive ? colors.brand : colors.textSecondary,
              backgroundColor: isActive ? colors.brandSurface : 'transparent',
            })}
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={18}
                  color={isActive ? colors.brand : colors.textSecondary}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
                <span>{label}</span>
                {badge && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 10,
                      lineHeight: 1.6,
                      padding: '0 7px',
                      borderRadius: radii.pill,
                      backgroundColor: isActive ? colors.bgCard : colors.border,
                      color: isActive ? colors.brand : colors.textSecondary,
                    }}
                  >
                    {badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* 底部：分隔线 + 退出 + 版本号 */}
      <div className="px-3 pb-4">
        <div
          style={{
            height: 1,
            backgroundColor: colors.border,
            margin: '0 12px 12px 12px',
          }}
        />
        <button
          type="button"
          className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors"
          style={{
            borderRadius: radii.md,
            color: colors.textSecondary,
            backgroundColor: 'transparent',
          }}
        >
          <LogOut size={18} color={colors.textSecondary} strokeWidth={1.8} />
          <span>退出登录</span>
        </button>
        <div
          style={{
            color: colors.textMuted,
            fontSize: 12,
            padding: '8px 16px 0 16px',
          }}
        >
          v0.9.2 · 自托管
        </div>
      </div>
    </aside>
  );
}

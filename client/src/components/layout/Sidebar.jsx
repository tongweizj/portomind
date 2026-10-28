// src/components/layout/Sidebar.jsx
// 与 Ardot 设计稿 Component/Sidebar 对齐：
//   - 宽 232px、底色 #F6F8FA、与主内容用 1px 右边框 #E3E8EE 分隔
//   - 顶部：紫底白方块 logo + "PortoMind" 文字
//   - 段标题「总览」灰小字
//   - 导航项：默认 #5E6B7E，激活态 #EEEDFF 底 + #635BFF 紫文，圆角 8
//   - 底部：分隔线 + 「退出登录」+ 版本号 v0.9.2 · 自托管
// 信息架构（FS-asset-price-consolidation）：顶层 8 → 7 项；
//   原「资产管理」移出导航，收敛为「今日行情」屏内入口；「价格」→「今日行情」+「监控」badge。
// 信息架构（TASK-044）：顶层 7 → 6 项，交易收拢为组合子资源 ——
//   「组合管理」改为可展开父项，下挂「组合列表」与「全部交易」；原顶层「交易记录」移除。
// 信息架构（TASK-050）：顶层 6 → 5 项，「家庭视图」移除（五区块并入 `/portfolios`）。
// 信息架构（TASK-058 U2 / FS v1.5 `D12`）：顶层 5 → 4 项——「提醒规则」移入顶栏头像下拉；
//   侧栏不含任何账户入口（无用户名区 / 无账户设置 / 无退出登录），底部只留版本注记。
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import {
  LayoutDashboard, LineChart, Layers, FileText, ChevronRight
} from 'lucide-react';
import { ROUTES } from '../../constants/routes';
import { colors, layout, fontStack, radii } from '../../constants/design-tokens';

// 「组合列表」族：组合增删改查与详情 Tab 都算它的落点。
// 注意排除 `/portfolios/transactions`（那属于「全部交易」子项）。
const isPortfolioListPath = (pathname) =>
  pathname === ROUTES.PORTFOLIO_LIST
  || pathname.startsWith('/portfolios/new')
  || pathname.startsWith('/portfolios/edit')
  || pathname.startsWith('/portfolios/view');

// 顶层 4 项（TASK-058 U2）：「提醒规则」已移入顶栏头像下拉，侧栏不再有账户入口。
// `active` 为显式判定函数，不用 NavLink 的前缀匹配 ——
// 否则父项 `/portfolios` 会同时高亮「全部交易」等所有子路径。
const navItems = [
  // TASK-049：首页承接家庭总资产卡，标签由「Dashboard · 提醒」改为「Dashboard」
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', active: (p) => p === '/' },
  {
    to: ROUTES.PORTFOLIO_LIST,
    icon: Layers,
    label: '组合管理',
    children: [
      { to: ROUTES.PORTFOLIO_LIST, label: '组合列表', active: isPortfolioListPath },
      { to: ROUTES.PORTFOLIO_TX_ALL, label: '全部交易', active: (p) => p === ROUTES.PORTFOLIO_TX_ALL },
    ],
  },
  { to: '/prices', icon: LineChart, label: '今日行情', badge: '监控', active: (p) => p.startsWith('/prices') },
  { to: '/logs', icon: FileText, label: '日志', active: (p) => p === '/logs' },
];

const itemClass = 'flex items-center gap-3 px-3 py-2 text-sm transition-colors';

export default function Sidebar() {
  const { pathname } = useLocation();
  // OQ4 / AC11：展开态**不持久化** —— 仅组件内 useState，不写 localStorage/sessionStorage，
  // 刷新即回到默认收起态。
  const [expanded, setExpanded] = useState(false);

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

      {/* 导航项（5 项，「组合管理」含二级） */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label, badge, active, children }) => {
          const childActive = Boolean(children?.some(child => child.active(pathname)));
          const isActive = childActive || Boolean(active?.(pathname));

          // 含二级子项的父项：文本区跳落点，右侧 chevron 单独切换展开（设计见 FS §4.1）
          if (children) {
            return (
              <div key={label}>
                <div
                  className="flex items-center"
                  style={{
                    borderRadius: radii.md,
                    backgroundColor: isActive ? colors.brandSurface : 'transparent',
                  }}
                >
                  <Link
                    to={to}
                    aria-current={isActive ? 'page' : undefined}
                    className={`${itemClass} flex-1 min-w-0 ${isActive ? 'font-semibold' : 'font-medium'}`}
                    style={{ color: isActive ? colors.brand : colors.textSecondary }}
                  >
                    <Icon
                      size={18}
                      color={isActive ? colors.brand : colors.textSecondary}
                      strokeWidth={isActive ? 2.2 : 1.8}
                    />
                    <span>{label}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setExpanded(value => !value)}
                    aria-expanded={expanded}
                    aria-label={expanded ? '收起组合管理' : '展开组合管理'}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '8px 10px 8px 2px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <ChevronRight
                      size={16}
                      color={isActive ? colors.brand : colors.textMuted}
                      strokeWidth={2}
                      style={{
                        transform: expanded ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.15s ease',
                      }}
                    />
                  </button>
                </div>

                {expanded && (
                  <div className="mt-1 space-y-1">
                    {children.map(child => (
                      <Link
                        key={child.to}
                        to={child.to}
                        aria-current={child.active(pathname) ? 'page' : undefined}
                        className={`flex items-center px-3 py-1.5 text-sm transition-colors ${child.active(pathname) ? 'font-semibold' : 'font-medium'}`}
                        style={{
                          borderRadius: radii.md,
                          paddingLeft: 44,
                          color: child.active(pathname) ? colors.brand : colors.textSecondary,
                          backgroundColor: child.active(pathname) ? colors.brandSurface : 'transparent',
                        }}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={to}
              to={to}
              aria-current={isActive ? 'page' : undefined}
              className={`${itemClass} ${isActive ? 'font-semibold' : 'font-medium'}`}
              style={{
                borderRadius: radii.md,
                color: isActive ? colors.brand : colors.textSecondary,
                backgroundColor: isActive ? colors.brandSurface : 'transparent',
              }}
            >
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
            </Link>
          );
        })}
      </nav>

      {/* 底部：只保留版本注记（TASK-058 U2：删假「退出登录」，账户/登出唯一入口在顶栏下拉） */}
      <div className="px-3 pb-4">
        <div
          style={{
            height: 1,
            backgroundColor: colors.border,
            margin: '0 12px 12px 12px',
          }}
        />
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

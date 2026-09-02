// src/constants/design-tokens.js
// 与 Ardot 设计稿《PortoMind 投资组合管理工具 Web 设计稿》对齐的设计 token。
// 仅放当前布局组件实际使用到的颜色/字号/间距，避免一次性大改 theme。

export const colors = {
  // 背景 / 卡片
  bgPage: '#F6F8FA',
  bgCard: '#FFFFFF',

  // 边框 / 分隔
  border: '#E3E8EE',
  borderStrong: '#D7DEE6',

  // 文本
  textPrimary: '#0A2540',
  textSecondary: '#5E6B7E',
  textMuted: '#8A95A5',
  textInverse: '#FFFFFF',

  // 主色 Stripe 紫
  brand: '#635BFF',
  brandHover: '#5247DB',
  brandSurface: '#EEEDFF', // 浅紫背景（激活态、tag）
  brandSurfaceHover: '#E0DEFF',

  // 状态色
  up: '#DF1B41', // A 股 涨红
  down: '#0E9F6E', // A 股 跌绿
  warn: '#F5A524',
  danger: '#E0254B',
};

export const radii = {
  sm: '6px',
  md: '8px',
  lg: '10px',
  pill: '999px',
};

export const fontStack = {
  // Noto Sans SC 优先，Inter 兜底数字与拉丁字符
  sans: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  numeric: '"Inter", "Noto Sans SC", system-ui, sans-serif',
};

export const layout = {
  sidebarWidth: 232, // 设计稿 Component/Sidebar
  topbarHeight: 64,  // 设计稿 Component/Topbar
  contentPaddingX: 32,
  contentPaddingY: 24,
};

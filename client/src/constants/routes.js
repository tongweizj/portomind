export const ROUTE_PATTERNS = Object.freeze({
  PORTFOLIO_LIST: '/portfolios',
  PORTFOLIO_NEW: '/portfolios/new',
  // ⚠️ 路由歧义约束（TASK-044 / FS §4.2 / AC4）：
  // `/portfolios/transactions` 是 2 段**字面量**路由，`PORTFOLIO_TX_NEW|EDIT|IMPORT` 都是
  // `/portfolios/:id/transactions/*`（≥4 段）动态路由，当前不冲突（React Router v6 中静态段
  // 优先级高于动态段）。但将来**若新增 2 段 `/portfolios/:id` 直连页**，本聚合页会被 `:id`
  // 吞掉 —— 届时必须改用其它字面量或加精确匹配，勿直接加 `:id` 两段路由。
  PORTFOLIO_TX_ALL: '/portfolios/transactions',
  PORTFOLIO_TX_NEW: '/portfolios/:id/transactions/new',
  PORTFOLIO_TX_EDIT: '/portfolios/:id/transactions/edit/:txId',
  PORTFOLIO_TX_IMPORT: '/portfolios/:id/transactions/import',
  PORTFOLIO_VIEW: '/portfolios/view/:id',
  PORTFOLIO_TAB: '/portfolios/view/:id/:tab',
  PORTFOLIO_EDIT: '/portfolios/edit/:id'
});

export const ROUTES = Object.freeze({
  PORTFOLIO_LIST: ROUTE_PATTERNS.PORTFOLIO_LIST,
  PORTFOLIO_NEW: ROUTE_PATTERNS.PORTFOLIO_NEW,
  // 「全部交易」跨组合聚合页（只读）
  PORTFOLIO_TX_ALL: ROUTE_PATTERNS.PORTFOLIO_TX_ALL,
  // 写操作一律带组合 id：路径即上下文，不存在「未指定组合」的写入路径（OQ2）
  PORTFOLIO_TX_NEW: id => `/portfolios/${id}/transactions/new`,
  PORTFOLIO_TX_EDIT: (id, txId) => `/portfolios/${id}/transactions/edit/${txId}`,
  PORTFOLIO_TX_IMPORT: id => `/portfolios/${id}/transactions/import`,
  // 组合详情「交易记录」Tab 的显式别名（等价于 PORTFOLIO_TAB(id, 'transactions')）
  PORTFOLIO_TX_TAB: id => `/portfolios/view/${id}/transactions`,
  PORTFOLIO_VIEW: id => `/portfolios/view/${id}/basic`,
  PORTFOLIO_TAB: (id, tab) => `/portfolios/view/${id}/${tab}`,
  PORTFOLIO_EDIT: id => `/portfolios/edit/${id}`
});

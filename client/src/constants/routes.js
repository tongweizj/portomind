export const ROUTE_PATTERNS = Object.freeze({
  PORTFOLIO_LIST: '/portfolios',
  PORTFOLIO_NEW: '/portfolios/new',
  PORTFOLIO_VIEW: '/portfolios/view/:id',
  PORTFOLIO_TAB: '/portfolios/view/:id/:tab',
  PORTFOLIO_EDIT: '/portfolios/edit/:id'
});

export const ROUTES = Object.freeze({
  PORTFOLIO_LIST: ROUTE_PATTERNS.PORTFOLIO_LIST,
  PORTFOLIO_NEW: ROUTE_PATTERNS.PORTFOLIO_NEW,
  PORTFOLIO_VIEW: id => `/portfolios/view/${id}/basic`,
  PORTFOLIO_TAB: (id, tab) => `/portfolios/view/${id}/${tab}`,
  PORTFOLIO_EDIT: id => `/portfolios/edit/${id}`
});

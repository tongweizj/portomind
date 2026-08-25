# AGENTS.md — PortoMind Client

React 19 + Vite 6 单页应用（PortoMind 前端）。UI 文案与代码注释使用简体中文。后端在 `../server`，API 契约见 `../doc/API_CONTRACT.md`。

## 常用命令

```bash
npm run dev       # Vite 开发服务器，默认 http://localhost:5173
npm run build     # 生产构建（验证入口之一）
npm run lint      # ESLint 检查（代码修改后必须通过）
npm run preview   # 预览构建产物
```

`VITE_API_URL` 留空时默认使用同源 `/api`；配置时应包含 `/api` 前缀（见 `.env.example`）。

## 架构约定

- 所有网络请求必须走 `src/services/api.js` 的统一 Axios 实例，禁止在页面里拼接 host 或 `/api`。
- 响应拦截器已解包 `response.data`；列表接口的 service 返回 `{ data, pagination }`（`page`、`pageSize`、`total`）。
- 错误统一用 `getApiErrorMessage(err, fallback)` 提取 `message` 和 `traceId` 展示。
- 数据获取优先用 TanStack Query hooks（`src/hooks/`），queryKey 模式：`['portfolios']`、`['portfolio', id]`、`['transactions', ...]`；全局 `staleTime: 60s`、`retry: 1`。
- 每个业务一个 `*.service.js`，位于 `src/services/`，函数签名遵循「参数解构在前、列表返回 `{ data, pagination }`」的现有风格。
- 路由集中在 `src/router.jsx`，路径模板和生成器在 `src/constants/routes.js`；组合详情使用 Tab 路由 `/portfolios/view/:id/:tab`，各 Tab 独立加载数据，单个 Tab 失败不阻断其他 Tab。
- 页面按域组织：`pages/Asset`、`pages/Portfolio`、`pages/Prices`、`pages/Transaction`，外加 `Dashboard` 与 `LogViewer`。
- 通用状态用 `components/DataState`（`LoadingState` / `EmptyState` / `ErrorState`）；复用按钮走 `components/ButtonGroup`。

## 代码风格

- 纯 JS/JSX，无 TypeScript、无 PropTypes（eslint 已关 `react/prop-types`）。数据形状用 `models/*.js` 的 JSDoc `@typedef` 描述。
- 枚举与下拉选项集中在 `src/constants/enums.js`；符号推断用 `utils/symbolUtils.js`（`.TO`→CA/CAD、`.SS`→CN-SH、`.SZ`→CN-SZ、`.CN`→CN-FUND、否则 US/USD）。
- 前端校验集中在 `utils/`（如 `portfolioValidation.js`），在表单/提交边界校验，避免重复造轮子。

## 业务规则（前端需保持一致）

- 交易方向仅 `buy | sell`，数量与价格必须大于零。
- 目标配置非空时各比例总和必须精确等于 100%（见 `validatePortfolioTargets`）。
- 金额保留资产原币种，不做跨币种合计。
- 修改前端校验时需同步检查 `../server` 后端校验，避免两侧规则漂移。

## 目录索引

- `src/services/api.js` — Axios 实例、错误规范化（所有请求入口）
- `src/router.jsx` — 唯一路由入口
- `src/constants/` — `enums.js`、`routes.js`
- `src/hooks/` — TanStack Query 数据 hooks
- `src/utils/` — 格式化、校验、符号与图表配置
- `src/components/layout/` — AppLayout（Sidebar + Header + Outlet）

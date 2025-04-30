# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh



src/
├── services/              # 原 api/，保留 services 命名
│   ├── portfolio.ts
│   └── transaction.ts
│
├── hooks/                 # 自定义 Hook 逻辑层（不变）
│   ├── usePortfolios.ts
│   └── useTransactions.ts
│
├── components/            # 可复用 UI 组件（不变）
│   ├── PortfolioCard/
│   └── TransactionTable/
│
├── pages/                 # 原 features/，改为 pages/
│   └── portfolios/
│       ├── List.tsx
│       ├── Detail.tsx
│       ├── Edit.tsx
│       └── Rebalance.tsx
│
├── models/                # 类型定义（不变）
│   ├── portfolio.ts
│   └── transaction.ts
│
├── constants/             # 存放全局常量
│   ├── routes.ts
│   └── storageKeys.ts
│
├── contexts/              # 全局状态（可选，不变）
│   └── PortfolioContext.tsx
│
├── router.tsx             # 路由配置，引用 constants/routes.ts
└── main.tsx


下面是一份按优先级和功能模块划分的重构开发 TODO List，帮助你按步骤推进 Portfolio 页面及相关代码的重构工作：

 1. 搭建新目录结构

在 src/ 下创建 api/、hooks/、components/、features/portfolios/、models/、constants/ 等文件夹

搬移旧版文件到临时 legacy/ 目录，保证重构过程中随时可回滚

 2. 定义类型 & 常量

models/portfolio.ts、models/transaction.ts：集中定义接口

constants/routes.ts：统一管理所有路由路径

 3. 封装数据服务（API Layer）

api/portfolioService.ts：CRUD 接口封装

api/transactionService.ts：交易流水接口封装

编写并测试基础的 fetch/axios 调用

 4. 实现数据 Hook（Data Fetching）

hooks/usePortfolios.ts：获取所有组合

hooks/usePortfolio.ts：获取单个组合详情

hooks/useTransactions.ts：获取指定组合的交易列表

可选：集成 React Query，补充 isLoading / isError 处理

 5. 抽离通用 UI 组件

components/PortfolioCard/：列表卡片

components/TransactionTable/：流水表格

components/ButtonGroup/：操作按钮组

确保所有样式和交互都通过 Props 配置

 6. 重写功能页（Feature Layer）

features/portfolios/List.tsx：调用 usePortfolios，渲染 PortfolioCard 列表

features/portfolios/Detail.tsx：调用 usePortfolio + useTransactions，渲染详情 & TransactionTable

features/portfolios/Edit.tsx（如有）：表单页重构

features/portfolios/Rebalance.tsx：再平衡功能抽离与重写

 7. 更新路由配置

修改 router.tsx，使用 constants/routes.ts 中的路由常量

验证列表、详情、编辑、再平衡等页面的跳转都可用

 8. 状态 & 全局 Context（可选）

如需跨页面共享当前选中组合，创建 contexts/PortfolioContext.tsx

用 useReducer 或轻量状态库（Zustand）管理全局状态

 9. 单元测试 & 集成测试

针对 api 层写 Mock 测试

针对 hooks 层写逻辑测试

针对核心组件（Card、Table）写快照和行为测试

 10. 清理 & 优化

删除 legacy/ 目录中的冗余代码

调整 ESLint / Prettier 格式

运行全项目 smoke test，确保无回归

 11. 文档 & 演示

在 README.md 更新重构后的项目结构说明

撰写简短的重构报告／开发文档，指明各模块职责与使用方式
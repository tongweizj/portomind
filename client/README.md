# PortoMind Client

React + Vite 单页应用。所有网络请求通过 `src/services/api.js` 中的统一 Axios 实例访问后端。

```bash
cp .env.example .env
npm ci
npm run dev
```

`VITE_API_URL` 应包含 `/api` 前缀，例如 `http://localhost:8080/api`；未配置时默认使用同源 `/api`，不会生成 `undefined/assets` 一类地址。

验证命令：

```bash
npm run lint
npm run build
```

页面按资产、价格、交易和组合详情 Tab 划分。组合详情各 Tab 独立加载，统一使用加载、空数据和错误状态组件。

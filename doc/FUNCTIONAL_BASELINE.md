# PortoMind 功能验证基线

基线日期：2026-08-24。验证环境为 Node.js 24、MongoDB 本地实例、React 19、Express 4.22 和 Mongoose 6.13。

## 自动化验证结果

| 检查 | 结果 |
| --- | --- |
| 后端核心及 HTTP 集成测试 | 58/58 通过 |
| 后端语法检查 | 64 个文件通过 |
| MongoDB 基线验证 | 2 资产、1 组合、4 交易、6 价格通过 |
| 前端 ESLint | 通过 |
| 前端生产构建 | 通过；主 JS bundle 约 821 kB，仍有拆包优化空间 |
| 前后端生产依赖审计 | 0 vulnerabilities |

## 已验证业务链

- Asset CRUD、重复 symbol、字段枚举、搜索、分页、排序、active/watchlist。
- Price 固定路由优先级、指定日期和当日分页、年月/日期范围历史查询、市场时区、幂等存储、外部错误分类。
- Transaction CRUD、组合/资产存在性、正数量与价格、超卖拒绝、稳定排序、组合删除级联。
- Position 移动平均成本：多次买入、部分/全部卖出、非法先卖后买、缺价、多资产、小数数量和历史快照。
- Portfolio 目标比例 100% 校验、详情 Tab 独立加载、原币种持仓展示。
- Rebalance 阈值解释、零持仓目标、零市值、费用/税费、人工确认执行、反向交易撤销和重做。
- Scheduler 每日 cron、单例防重、逐资产失败隔离、任务摘要、历史日志查询和敏感字段脱敏。

## 当前限制

- 没有认证或多用户授权，只能用于可信网络。
- 没有汇率换算，金额按原币种分组。
- 再平衡只自动生成建议，不自动交易。
- Yahoo Finance 适配器仍使用已 EOL 的 `yahoo-finance2` 2.x，已列为下一次依赖迁移首项。
- 尚无浏览器端组件测试和端到端视觉测试；当前前端验证由 lint、生产构建及后端契约测试组成。
- 前端主 bundle 超过 500 kB，应通过路由级懒加载和图表库拆包优化。

## 可重复命令

```bash
cd server
npm test
npm run verify
npm audit --omit=dev

cd ../client
npm run lint
npm run build
npm audit --omit=dev
```

# 依赖升级评估

评估日期：2026-08-24。

## 本轮已完成

根据 `npm outdated` 和 `npm audit`，本轮优先处理安全问题，并控制迁移跨度：

- 后端：Axios 1.19、Express 4.22、body-parser 1.20、Mongoose 6.13、node-cron 4.6、UUID 11.1、Winston 3.19。
- 前端：Axios 1.19、React/React DOM 19.2、React Router 7.18、Vite 6.4、PostCSS 8.5、Tailwind CSS 4.3。
- 前后端 `npm audit` 均达到 0 vulnerabilities。

Mongoose 从 5 升到 6、node-cron 从 3 升到 4，是为消除安全公告而接受的主版本升级，并由完整后端测试覆盖。其余核心框架保持原主版本。

## 暂缓的大版本

| 依赖 | 当前边界 | 可用新主版本 | 暂缓原因 |
| --- | --- | --- | --- |
| Express | 4.x | 5.x | 错误处理和路由语义需要独立迁移回归 |
| Mongoose | 6.x | 9.x | 查询、连接和结果对象跨多个主版本变化较大 |
| node-cron | 4.x | — | 已升级到当前主版本 |
| yahoo-finance2 | 2.x | 4.x | 2.x 已 EOL；抓取适配器需按官方迁移指南单独改造 |
| React Router | 7.x | 8.x | 路由 API 和生态兼容性应独立验证 |
| Vite | 6.x | 8.x | Node 要求、插件和构建输出需要专项验证 |
| ESLint | 9.x | 10.x | Flat config 与插件兼容性需一并升级 |
| Recharts | 2.x | 3.x | 图表行为和响应式尺寸需要视觉回归 |

## 建议顺序

1. 优先迁移 `yahoo-finance2` 4，并用固定行情样本测试返回结构和错误分类。
2. 独立升级 Express 5，覆盖所有 400/404/409/500 契约测试。
3. 分阶段升级 Mongoose 7 → 8 → 9，每阶段运行数据库集成测试和索引检查。
4. 前端将 Vite、插件、ESLint 作为一组升级，再处理 React Router 和图表库。

依赖升级不得使用无审查的 `npm audit fix --force`；每次升级都应提交 lockfile、审计结果和回归测试结果。

# PortoMind

PortoMind 是一个自托管的个人/家庭投资组合管理应用，覆盖资产、行情、交易、持仓、目标配置、再平衡建议、站内提醒与家庭层 RMB 汇总。当前版本面向单用户本地部署；建议仅在可信网络中运行。

![PortoMind Logo](./docs/logo.png)

> 📖 新手从这里开始：[客户端使用手册](./docs/manual/CLIENT.md)

## 当前能力

- 资产 CRUD、搜索、分页、排序、大类分类（equity/bond/gold/cash）、关注列表和启用状态
- 行情适配器（Yahoo 美股/加股/港股、东方财富 A股、天天基金场外基金）、日价格幂等同步、历史价格查询与完整性检查
- 交易 CRUD（含 fee、现金分红/分红再投、A股整手提示）、超卖校验、移动平均成本持仓计算、**CSV 批量导入**
- 组合目标配置（资产级或大类级）、持仓概览及历史趋势、账户类型、归档
- “生成建议 → 用户确认执行 → 撤销/重做”的再平衡闭环 + AUTO 调度（只生成建议，不自动交易）
- 提醒中心：到价/盈亏/漂移/52 周新高新低/估值分位/人工信号 8 种规则，每日跑批产生站内事件
- 家庭视图：以 RMB 折算家庭总资产，CNY/USD/CAD/HKD 分桶 + 组合贡献 + 最近动态（汇率自动采集 + 手动兜底）
- 单一常驻调度进程 `cron-worker`（价格同步/完整性检查/提醒评估/汇率同步/再平衡分发共 5 类任务）、TaskRun 防重、逐资产故障隔离和可追踪日志
- 前后端统一 API 响应与 Axios 错误处理

当前不支持登录、多用户或无人值守自动交易；不同币种在组合层不直接合计（仅家庭层按汇率折算）。

## 仓库结构

npm workspaces monorepo，四个 workspace：

| 目录 | 说明 |
|---|---|
| `shared/` | 唯一业务内核（models / services / tasks / fetchers / constants / config / utils），被 `server` 与 `cron-worker` 共用 |
| `server/` | REST API 进程。**不注册任何定时任务**，只提供接口与手动触发端点 |
| `cron-worker/` | **全项目唯一的调度所有者**，注册全部 5 类定时任务 |
| `client/` | React SPA 前端 |

## 技术栈

- 前端：React 19、Vite 6、React Router 7、TanStack Query、Tailwind CSS
- 后端：Node.js、Express 4、Mongoose 6、MongoDB
- 任务：node-cron、Winston、MongoDB `TaskRun` 防重记录
- 包管理：npm workspaces
- 测试：Node.js test runner、HTTP 集成测试和表格驱动业务测试

## 快速开始

要求 Node.js 24、npm 和 MongoDB。完整步骤见 [系统部署手册](./docs/manual/DEPLOYMENT.md) §5。

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env

npm ci                      # 根目录一次安装（workspaces）
npm run seed:baseline --workspace server
npm run dev:server
```

另开终端：

```bash
npm run dev:client
```

需要跑定时任务时再开一个终端（可选）：

```bash
cp cron-worker/.env.example cron-worker/.env
npm run dev:worker
```

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8080`
- API 前缀：`http://localhost:8080/api`

定时任务（价格同步/完整性检查/提醒评估/汇率同步/再平衡分发）**只在 `cron-worker` 中注册**，API 进程不跑任何定时任务。`SCHEDULER_ENABLED` 与全部 `*_CRON` 配置只存在于 `cron-worker/.env`。启动方式与自检见 [cron-worker 运维手册](./docs/manual/CRON_WORKER_OPS.md) §5。

## 验证

```bash
npm test                    # 根目录跑全部 workspace 测试
npm run test:server
npm run test:worker
```

单端验证：

```bash
cd server
npm run validate

cd ../client
npm run lint
npm run build
```

需要连接本地 MongoDB 的可重复基线验证：

```bash
cd server
npm run verify
```

## 文档

- [客户端使用手册](./docs/manual/CLIENT.md) — 界面业务操作、业务口径、常见问题
- [服务端使用手册](./docs/manual/SERVER.md) — server 进程、手动 API 端点、排障
- [cron-worker 总览](./docs/manual/CRON_WORKER.md) — 进程入口；运维 / 产品介绍 / 开发三视角导航见其内链接
- [系统部署手册](./docs/manual/DEPLOYMENT.md) — 本地开发、生产部署、环境变量全表、安全边界、备份
- [产品线总览与功能评估](./docs/product/PRODUCT_LINES.md) — 产品线划分、功能全景与取舍建议（子文件 PL-0~PL-6）
- [架构总览](./docs/architecture/ARCHITECTURE.md) — 分层与模块边界
- [ADR-002 单一调度器与共享内核](./docs/architecture/adr/ADR-002-single-scheduler.md) — 调度所有权收敛决策
- [REST API 契约](./docs/dev/API_CONTRACT.md)
- [数据模型参考](./docs/dev/DATA_MODEL.md) — 各模型字段、索引、引用关系、已知契约缺口
- [前端开发文档](./docs/dev/CLIENT_DEV.md) — 路由、Query 数据层、组件清单、设计 token
- [产品需求文档 PRD](./docs/product/specs/PRD.md) — 需求基线
- [任务板与阶段路线](./docs/tasks/TASKS.md)
- [文档索引](./docs/readme.md) — 全部文档入口

## 重要业务规则

- 交易方向为 `buy | sell | div_cash | div_reinvest`，数量和价格必须大于零，禁止做空。
- 持仓采用移动平均成本；买入成本含费（fee），卖出按卖出前平均成本减记剩余成本、已实现盈亏扣费。
- 非空目标配置必须精确合计 100%；资产级与大类级目标二选一，不允许混合。
- 再平衡自动任务只生成建议，不会自动创建交易。
- 日价格按 `MARKET_TIMEZONE` 解释，数据库保存 UTC 时间。
- 组合层金额保留原币种；家庭层按最新汇率折算 RMB（缺价/缺汇率不误报，标「折算不完整」）。

## 安全边界

当前没有认证与授权，API 不应直接暴露到公网。**CORS 当前也不校验来源**（任意来源都被接受，`CORS_ORIGINS` 尚未生效）。完整说明与上线前要求见 [系统部署手册 § 安全边界](./docs/manual/DEPLOYMENT.md#9-安全边界)。

## License

后端 package 当前声明 ISC。若准备公开发布，应在仓库根目录补充正式 `LICENSE` 文件并统一前后端许可声明。

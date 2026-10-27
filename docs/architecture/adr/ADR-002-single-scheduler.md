# ADR-002 — 单一调度器：全部定时任务收敛到 cron-worker

## Status

`Accepted`

Date:

`2026-10-15`

Decision Owner:

`Human Owner（方案 A / workspaces / 变量归属 / calendar 迁入 四项均由人工裁决）`

Related Task:

`TASK-005`

Related ExecPlan:

`docs/exec-plans/complete/TASK-005-unify-scheduler.md`

Supersedes:

`None`

Superseded By:

`None`

---

## 1. Context

PortoMind 由三个进程组成：`client`（Vite SPA）、`server`（Express API）、`cron-worker`（独立调度 Worker）。
`server` 与 `cron-worker` **共享同一个 MongoDB**。

原设计用 `SCHEDULER_ENABLED` 作为「调度所有者」开关，并规定**同一时间只能有一个进程为 `true`**。
但两侧的调度器是**两套独立实现**，且**任务集合不重合**：

| 任务 | server 调度器 | cron-worker 调度器 |
|---|:---:|:---:|
| 价格同步 | ✅ | ✅ |
| 完整性检查 | ❌ | ✅ |
| 提醒评估 | ✅ | ❌ |
| 汇率同步 | ✅ | ❌ |
| 再平衡 AUTO | ✅ | ❌ |

**因此该约束自相矛盾**：无论把调度权给谁，都必然有任务静默停跑。

- 只让 `cron-worker` 持调度（当时默认）→ 提醒评估 / 汇率同步 / 再平衡 AUTO 不会自动运行；
- 只让 `server` 持调度 → 完整性检查不会自动运行。

运维侧只能用手动触发兜底，属**设计缺陷**而非配置问题。同时，两侧存在大量重复实现
（`models/`、`taskRunner`、`dailySync`、`priceFetch/priceStorage`、`marketTime`、`fetchers`），
任何一处口径变更都需要双向同步，是「事实漂移」的结构性来源。

需要一次架构决策：调度权归属，以及是否借机消除重复实现。

---

## 2. Decision Drivers

- **约束自洽**：唯一所有者与全任务覆盖必须同时成立，不再需要运维在残缺拓扑间取舍。
- **口径唯一**：同一业务能力只允许一份实现，避免历史反复出现的「双份实现 → 文档/行为漂移」。
- **能力不退化**：`server` 的 API 手动触发端点（前端「立即评估」「同步汇率」、再平衡 check/suggestions/execute）必须继续可用。
- **可回滚**：切换过程应能一键退回。
- **不恶化既有债务**：不允许以「再复制一份」的方式实现，否则 `models/services` 副本数会从 2 涨到 3。

---

## 3. Constraints

- 三端均为独立安装的 Node 包；仓库此前**没有根 `package.json`，也没有 workspaces**，跨包共享代码无现成机制。
- 三端均为 CommonJS（`client` 为 ESM，但它是浏览器产物，不消费后端共享代码）。
- **数据兼容**：`taskruns` 中既有 `taskName`（`daily-price-sync`、`price-integrity-check`、`alert-evaluate`、`fx-rate-sync`、`rebalance-suggestions:<pid>`）必须保持稳定，不得历史断代。
- 业务规则、API 契约、数据模型字段**不得改动**。
- 现有测试必须继续通过。

---

## 4. Considered Options

### Option A — 抽取共享内核 `shared/`（选中）

把 `models`、业务引擎（alert / fx / valuation / portfolio / rebalance / marketData）、行情适配器、
交易日历与工具收敛到唯一的 `@portomind/shared` 包；`server` 与 `cron-worker` 都从该包引用；
调度触发权只留在 `cron-worker`。

- 优点：业务实现收敛为 **1 份**；同时清偿 `taskRunner` / `dailySync` / `models` 等双份实现债务；无新增运行时耦合。
- 缺点 / 风险：改动面最大（≈2800 行搬迁 + 路径重构 + 引入 workspaces），漏改会产生 `MODULE_NOT_FOUND`。

### Option B — cron-worker 通过 HTTP 触发 server 的既有端点

worker 新增 3 个调度器，调用 `server` 的 `/api/alerts/evaluate`、`/api/family/fx/sync`，并为再平衡新增内部端点。

- 优点：改动最小、最易回滚。
- 缺点：调度与 API 进程**运行时耦合**（server 宕机则 3 类任务不跑）；**不偿还**任何既有重复；仍需新增内部端点。
- 风险：TaskRun 归属语义被拆到两个进程，观测性下降。

### Option C — 把 server 的 services/models 复制进 worker

- 优点：worker 自包含。
- 缺点：`models` / `services` 副本从 2 份涨到 **3 份**，与本 ADR 要解决的问题同向恶化。

---

## 5. Decision

采用 **Option A**，并附加四项人工裁决：

1. **引入根 `package.json` + npm workspaces**（`shared` / `server` / `cron-worker` / `client`），
   以 `@portomind/shared` 作为唯一共享内核；各包内 `node_modules` 收敛为根目录一份，优先移除嵌套 lockfile。
2. **`SCHEDULER_ENABLED` 只保留在 `cron-worker`**；`server` 完全移除该变量与全部 `*_CRON` 表达式。
3. **`calendar.service` + `config/markets` 一并迁入 `shared`**（原为 worker 独有），使 `server` 侧也具备交易日历能力。
4. **再平衡调度改为「单日分发」**（见 §9），而非原「按组合注册 cron」。

终态：

- `cron-worker` 是 PortoMind **唯一的调度所有者**，单进程注册全部 5 类定时任务；
- `server` 不注册任何 cron，只提供 API（含手动触发入口）；
- 两侧共用 `@portomind/shared` 中的**一份**业务实现。

---

## 6. Rationale

本问题的根本动因是「同一能力被两处实现导致口径漂移」。方案 B 虽改动最小，但**不触及根因**，
长期仍需再补一次 A；方案 C 直接让债务恶化。只有 A 能同时做到「统一调度」与「偿还重复债务」，
且不引入新的运行时耦合（B 会让 worker 依赖 server 在线）。

方案 A 的成本（路径重构面广）通过一个关键约束被显著降低：**在 `shared/` 内保留原有相对目录结构**，
使被搬迁文件内部的 `require('./x')` 全部无需修改，只需适配跨界引用（`@portomind/shared/...`）。

---

## 7. Consequences

### Positive Consequences

- 「唯一所有者」与「全任务覆盖」自洽：不再有二选一拓扑，也不会有任务静默停跑。
- 业务实现收敛为一份：`models`、`taskRunner`、`dailySync`、`priceFetch/priceStorage`、`marketTime`、`fetchers`、`alertEngine`、`fxRate`、`rebalance` 等均只有一处实现。
- `server` 侧顺带补齐交易日历能力（原无）；`yahoo` 抓取统一为 axios 直连实现（带 host 回退、可注入、可测试），退役了对 `yahoo-finance2` 的依赖。
- `server` 依赖瘦身：移除 `node-cron`、`yahoo-finance2`、`axios`、`dayjs`、`minimist`、`winston`、`winston-daily-rotate-file`；`cron-worker` 移除 `axios`、`winston`。

### Negative Consequences

- 引入 workspaces 后，安装入口从「三端各自 `npm ci`」变为「根目录一次 `npm install`」；嵌套 lockfile 被移除。
- 再平衡的任务编排从「每组合一个 cron」变为「每日一次分发」，多了一层按日期的到期判断。
- `server` 与 `cron-worker` 需共用同一 `MONGO_URI` 与同一 `logs/` 目录，否则 `GET /api/logs/tasks` 读不到 worker 的任务日志。

### Trade-offs

- 用「一次较大的结构重构」换取「约束自洽 + 口径唯一」；回滚以阶段为单位（见 §11）。
- 代价是 `logs/` 目录由两进程共用（文件名不同，互不覆盖），换取日志查看接口对 worker 任务日志的可见性。

---

## 8. Architectural Impact

Affected areas:

- 新增包 `@portomind/shared`（models / services / fetchers / utils / config / constants / tasks）。
- 根目录 workspace 与安装方式。
- `cron-worker` 的调度器集合（2 → 5）与其任务实现来源。
- `server` 的模块边界（业务实现外移）与启动路径（移除调度）。
- 部署拓扑与环境变量归属。
- 文档：`CRON_WORKER.md` §3、`DEPLOYMENT.md` §1–§3、`DEPLOYMENT.md`、`functions.md`、两份 `.env.example`。

Unaffected areas:

- API 契约与端点集合（含全部手动触发入口）。
- 数据模型字段与索引（无 schema 变更）。
- 业务规则与计算口径（移动平均成本、超卖校验、目标 100%、A 股整手、跨币种不合计等）。
- 前端代码。

---

## 9. Implementation Notes

- **`shared/` 内保留原相对目录结构**，使搬迁文件的内部引用零改动；跨界引用统一为 `@portomind/shared/...`。
- **任务与调度的边界**：`shared/tasks/dailySync.js` 是纯模块（不加载 `.env`、不建连）；各包的 `tasks/*.js` 只是 CLI 薄壳（加载本包 `.env` → 建连 → 调用共享任务）。`dailySync` 的调度路径由 `cron-worker` 的 priceScheduler 直接调用共享实现，**不经过**薄壳。
- **`historySync` 与 `integrityCheck` 留在 `cron-worker`**：它们只有 worker 使用（`server` 侧那份是死代码，已删），迁入 `shared` 无收益。
- **调度触发权 ≠ 业务能力**：`alertEngine` / `fxRate` / `rebalance` 引擎留在 `shared` 并被两个进程共享；`server` 的手动端点因此与定时调度结果口径一致。
- **再平衡的单日分发**：`cron-worker/src/schedulers/rebalanceScheduler.js` 每日 00:00 读取未归档组合，按 `rebalanceSchedule` 判断到期（`daily`=每日 / `weekly`=周一 / `monthly`=1 日）。原因：调度迁出 API 进程后无法跨进程动态注册；分发器让组合新增/改动/归档在下一周期自动生效，且 `taskName`/`runKey` 语义与迁移前一致。
- **不变量**：AUTO 再平衡只生成建议 + 提醒，**永不自动交易**。
- **日志**：`shared/config/logger.js` 为唯一实现；`LOG_DIR` 默认取仓库根 `logs/`（以 `__dirname` 推导的绝对路径），两进程共用目录、文件名互不冲突。

---

## 10. Validation

判定为成功实现当满足：

- `cron-worker` 单进程启动日志出现 `SCHEDULERS_STARTED {"owner":"cron-worker","count":5}`；
- `server` 启动后日志**不出现** `SCHEDULERS_STARTED`，且全仓仅 `cron-worker` 引用 `node-cron`；
- 单调度器注册 5 类任务的断言通过（`cron-worker/test/scheduler.test.js`）；
- 再平衡分发器的到期规则、归档跳过与逐组合故障隔离断言通过（`cron-worker/test/rebalanceScheduler.test.js`）；
- `server` 与 `cron-worker` 既有测试全绿，且全仓 `require` 均可解析。

实测结果（2026-10-15）：

| 项 | 结果 |
|---|---|
| `npm run test --workspace server` | **152 / 152 通过** |
| `npm run test --workspace cron-worker` | **77 / 77 通过** |
| 相对 `require` 可解析性 | 184 / 184 |
| `@portomind/shared/...` 引用可解析性 | 49 / 49 |
| 调度代码引用点 | 仅 `cron-worker`（`server` 为 0） |

---

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| 路径重构漏改导致运行时 `MODULE_NOT_FOUND` | 高 | 分阶段提交；全仓 `require` 解析性校验；两套测试套件全绿 |
| 误删 `server` 的业务能力（把引擎当调度一起删） | 高 | 明确只删 `*Scheduler.js` / `scheduler.js` / `scheduleManager`；引擎迁 `shared` 并保留全部手动端点；测试覆盖手动路径 |
| `taskName` / `runKey` 改名导致 `taskruns` 历史断代 | 中 | 沿用既有名称；分发器保持 `runKey = <schedule>:<当日日期>` |
| workspaces 改变安装流程 | 中 | 根 `package.json` 提供 `test:server` / `test:worker` 等脚本；文档同步更新 |
| 再平衡由「按组合 cron」改为「分发」引入语义偏差 | 中 | 到期规则与原 cron 表达式一一等价并单测覆盖；上线后核对首个周期的 `taskruns` |
| 两进程共用 `logs/` | 低 | 文件名不重合（`app-*` / `task-*` / `exceptions-*` / `rejections-*`）；已验证两套测试可同时写 |

---

## 12. Follow-up Actions

- [x] 更新 `functions.md` §2 / §4.10 / §9
- [x] 更新 `CRON_WORKER.md` §3、`DEPLOYMENT.md` §1–§3、`DEPLOYMENT.md`
- [x] 更新两份 `.env.example`
- [x] 更新 `README.md` 与 `docs/readme.md` 索引
- [x] 新增/迁移调度相关测试
- [x] 创建本 ADR
- [ ] （后续，不在本任务范围）`ASSET_*` 常量仍有一份前端副本；若要彻底收敛需为 `client` 设计 ESM 可消费的共享方式

---

## 13. References

Related documentation:

- `docs/exec-plans/complete/TASK-005-unify-scheduler.md` — 实施计划与分阶段方案
- `docs/exec-plans/complete/DOCS-DEDUP-2026-10-15.md` §3 — Q10 缺口发现过程
- `docs/manual/CRON_WORKER_OPS.md` — 调度与数据质量运维
- `docs/manual/DEPLOYMENT.md` §2 / §3 — 进程拓扑与环境变量
- [`docs/product/lines/`](../../product/lines/) — 功能全景与能力边界（原 `docs/architecture/functions.md`，已归档于 [`docs/archive/functions.md`](../../archive/functions.md)）
- `docs/standards/DOCS.md` — 文档结构与「单一归属」规则

---

## 14. Decision History

### 2026-10-15

ADR created（随 TASK-005 实施完成）。方案 A 与三项附加裁决由 Human Owner 明确选定：

- D1 实现方案 = **A 抽共享内核**（否决 B、C）
- D2 引入根 `package.json` + npm workspaces = **是**
- D3 `SCHEDULER_ENABLED` 终态 = **仅 worker 保留，server 移除**
- D4（仅方案 B 需要的内部端点鉴权）= **不适用**，随方案 A 自动失效
- D5 `calendar.service` + `markets` 迁入 `shared` = **是**

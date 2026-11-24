# ADR-004 — 运维中心手动任务：共享任务内核、TaskRun 异步执行与跨进程锁

## Status

`Accepted`

Date:

`2026-11-24`

Decision Owner:

`Human Owner（异步契约 / 历史口径 / 锁与索引 / 文档范围均由人工批准）`

Related Task:

`TASK-070`

Related Spec:

`Spec #66 — 运维中心数据治理`

Related ADR:

`ADR-002（不 supersede；本 ADR 是其“单一调度所有者”下的执行机制补充）`、`ADR-003（symbol 存储契约）`

Supersedes:

`None`

Superseded By:

`None`

---

## 1. Context

运维中心在 TASK-068 / TASK-069 已落地资产总表与服务端筛选，但历史完整度仍是
`history.status = 'unavailable'` 占位。TASK-070 需要把真实检查结果回读到资产总表，并允许 admin 在界面上手动刷新。

约束来自现有架构：

- 全部定时任务只在 `cron-worker` 注册（ADR-002）。`server` 不能注册 cron 作为刷新入口。
- 业务规则只能有一份实现。完整性检查原先只存在于 `cron-worker`，直接让 `server` 再实现一份会制造第二份算法。
- 刷新是长任务，HTTP 请求不能同步等待；同时需要防重复、可观测进度、可回读结果。
- 历史完整度是“检测到的价格缺口”，当前数据模型无法区分停牌、上游采集失败和供应商异常；不能把缺口臆测成确认的采集失败。
- 既有 `TaskRun` 的 `(taskName, runKey)` 唯一键只能防同键重复，不能阻止手动与定时使用不同 `runKey` 并发执行同一任务。

## 2. Decision Drivers

- **单一业务内核**：完整性计算、历史口径、结果形状只实现一次。
- **单一调度所有者**：`cron-worker` 继续拥有定时触发权；`server` 只提供手动协议入口。
- **不引入新基础设施**：不新增消息队列、RPC 或第二个 worker。
- **异步可观测**：手动触发立即返回 `runId`，客户端轮询状态/进度，终态后刷新资产总表。
- **跨进程互斥**：同一互斥任务不能因不同进程、不同 `runKey` 并发执行；终态任务不能永久占锁。
- **契约稳定**：不改 `taskName` / `runKey` / 四态枚举；旧 TaskRun 记录保持可读。
- **缺数不猜**：历史未知显示 unknown / null，不补 0%；GAP 不推断为停牌或上游失败。
- **可控变更**：本 ADR 不授权生产库迁移；索引由模型定义并在隔离库验证，生产部署/索引创建需单独批准。

## 3. Considered Options

### Option A — `server` 同步执行完整性检查

`POST /api/ops-center/integrity-check` 直接调用一份 server 侧实现，等待完成后返回结果。

- 优点：最简单，无轮询。
- 缺点：HTTP 超时风险高；业务实现会与 worker 分裂成两份，违反单一内核；无法复用手动/定时同一任务锁；进度不可见。
- 结论：否决。

### Option B — 引入队列 / worker RPC

server 把任务投递到队列或调用 worker 内部接口，由 worker 执行并回写结果。

- 优点：异步天然；执行仍在 worker。
- 缺点：新增运行时基础设施与部署面；worker 不在线时任务不可用；与当前“TaskRun 即任务状态”的轻量模型不匹配。
- 结论：否决。后续若任务规模显著增长可另立 ADR。

### Option C — 业务抽入 shared，server 启动 TaskRun，cron-worker 保留定时触发（选中）

- `shared/tasks/priceIntegrityCheck.js` 承载完整性检查业务与 TaskRun 包装；
- `cron-worker/src/tasks/integrityCheck.js` 退化为加载 `.env` / 建连 / CLI 参数 / 注入 `historySync` 的薄壳；
- `server` 的手动端点调用同一 shared 任务，立即返回 `202 + runId`；
- `TaskRun` 增加 `lockKey` 部分唯一索引与 `progress`，提供跨进程互斥和轮询进度；
- 客户端轮询 `GET /api/ops-center/task-runs/:id`，终态后失效资产总表缓存。

- 优点：业务一份、调度归属不变、无新增基础设施、异步可观测、锁可跨进程。
- 缺点：TaskRun 模型增加字段与部分索引；需要明确 stale 只读判定与“下次触发才恢复”的语义。
- 结论：选中。

## 4. Decision

### 4.1 模块边界

| 层 | 职责 |
|---|---|
| `shared/tasks/priceIntegrityCheck.js` | 资产遍历、目标市场日窗口、理论/实际交易日计数、缺口区间、`result` 构造、TaskRun 生命周期与进度 |
| `shared/services/priceCoverage.service.js` | 价格覆盖计算：目标日、理论交易日、落库日匹配、缺口区间与修复窗口裁剪 |
| `shared/services/taskRuns.service.js` | TaskRun 只读投影、最近可用运行、资产级历史索引 |
| `cron-worker/src/tasks/integrityCheck.js` | 加载 worker `.env`、Mongo 连接、CLI 参数、`historySync` 修复注入；不复制业务算法 |
| `server/controllers/opsTask.controller.js` | 空 Body 校验、`202/409` 协议映射、TaskRun 详情读取；不含业务规则 |
| `client` | 展示三态历史、admin 刷新入口、轮询与终态刷新；不自算完整度 |

`historySync` 仍留在 `cron-worker`，因为它依赖 worker 的历史抓取路径。TASK-070 只抽取可复用的完整性业务；
CLI 参数、输出与退出码保持原行为。

### 4.2 手动触发契约

- `POST /api/ops-center/integrity-check` 只接受空对象 Body；任何非空字段（包括 `repair`）返回 `400`。
- 成功返回 `202` 与 `{runId,taskName,runKey,status:'RUNNING',startedAt}`，执行在后台继续。
- 已有活跃运行时返回 `409`，顶层 `code = TASK_ALREADY_RUNNING`，`details.activeRun` 提供 `runId/status/progress`。
- 手动刷新固定 `repair: false`，即只检查、不补采；定时任务仍按 `INTEGRITY_AUTO_REPAIR` 决定是否修复。
- `GET /api/ops-center/task-runs/:id` 返回状态、`stale`、进度、计数、失败与 `result`；不返回 `lockKey`。
- 端点只要求登录，不新增 admin 安全边界；admin 才显示刷新按钮属于 UI 约定。

### 4.3 跨进程互斥与进度

`TaskRun` 新增：

```js
lockKey: { type: String, trim: true, default: undefined },
progress: { completed: Number, total: Number, updatedAt: Date }
```

部分唯一索引：

```js
{ lockKey: 1 }, {
  unique: true,
  name: 'taskrun_active_lock_unique',
  partialFilterExpression: { status: 'RUNNING', lockKey: { $type: 'string' } }
}
```

规则：

- `price-integrity-check` 使用固定 `ops:price-integrity-check`，`daily-price-sync` 使用固定 `ops:daily-price-sync`；手动与定时共享同一把锁。
- 只有活跃运行参与唯一约束；终态更新 `$unset lockKey`，旧记录无该字段仍合法。
- 活跃任务默认每 1 秒最多写一次 `progress`（`OPS_PROGRESS_THROTTLE_MS`），终态写最终进度。
- `stale` 是读侧派生值：`RUNNING` 且心跳（`progress.updatedAt`，缺失回退 `startedAt`）超过阈值
  （完整性默认 30 分钟，`OPS_INTEGRITY_STALE_MS`）。`stale=true` 不自动改状态、不自动重试。
- 下一次真实触发发现过期锁时，条件更新旧运行为 `FAILED`、`runKey = interrupted:<id>`、释放锁，再创建新运行。
- `daily-price-sync` 的 US/CA 与 CN 定时批次仍按既有顺序执行；全局锁使手动同步与任一定时批次不能并发。
- 锁冲突写 `taskskips`；手动契约映射为 `409`。

不改 `status` 枚举、不改 `(taskName, runKey)` 唯一键、不把锁编码进 `runKey`。

### 4.4 历史完整度口径

`GET /api/ops-center/assets` 的 `history` 为三态：

| status | 条件 | 字段 |
|---|---|---|
| `unavailable` | 没有可用的 `price-integrity-check` 运行（`SUCCEEDED`/`PARTIAL`、已结束且 `result.assets` 为数组） | `checkedAt/expected/actual/missing/ratio` 全为 `null` |
| `checked` | 最近可用运行中资产为 `OK`/`GAP`，且 `expected >= 3`、计数与比例完整 | `checkedAt` = 运行 `endedAt`；`expected` = 理论交易日；`actual` = 匹配理论日的实际有价日；`missing` = 差额；`ratio = actual / expected` |
| `unknown` | 运行中无该资产条目，或条目为 `SKIPPED_NO_LAUNCH_DATE` / `INSUFFICIENT_SAMPLE` / `ERROR`，或关键字段缺失、`expected < 3` | 除 `checkedAt` 外计数为 `null` |

- `actual` 只计与理论交易日匹配的落库日期，不把周末/节假日落库算作覆盖。
- 历史条目按 `assetId` 关联，不按 `symbol` 字符串 join；`symbol` 只用于展示，避免 ADR-003 迁移期错配。
- `GAP` 只表示检测到缺失交易日，**不推断**停牌、上游采集失败或供应商异常。
- 客户端不得把 `unknown` 渲染成 `0%`，也不得把 `unavailable` 当作缺口。
- `TaskRun.result` 保存有界资产摘要（计数、比例、最多 20 段缺口区间），不保存原始价格序列。

## 5. Consequences

### Positive

- 手动与定时使用同一份完整性算法与同一把锁，结果口径一致。
- `server` 不注册 cron，ADR-002 的调度归属不变。
- 长任务通过 `202 + runId` 解耦 HTTP 生命周期，并可在界面看到进度。
- 历史未知与缺口明确区分，避免把“不知道”显示成“0%”或“确认采集失败”。
- 旧 TaskRun 无需迁移；索引只新增一个部分唯一索引。

### Negative / Trade-offs

- TaskRun 增加两个可选字段与一个索引；索引创建需要数据库权限，生产变更需单独批准。
- 客户端需要轮询，增加少量请求；仅 `RUNNING` 时轮询，终态停止。
- `stale` 只提示、不自动恢复，运维仍需依赖下一次触发或人工处理。
- `result.assets` 会随资产数量增长，但每资产缺口区间有上限，且不存原始价格序列。

## 6. Validation

本 ADR 的落地验证：

- `priceCoverage`：周末/节假日、上市日、无价、`expected < 3`、缺口区间上限、修复窗口裁剪。
- `integrityCheck`：共享任务兼容 cron-worker 依赖注入、`repair:false`、`TaskRun` 包装与 `result` 形状。
- `opsTask.api`：`401`、`202 + runId`、`409 + activeRun`、空 Body、详情 `200/400/404`、member 可读。
- `taskrun.lock`：启动即返回、进度写入、锁冲突、过期恢复、终态释放、旧 `runTrackedTask` 语义不变。
- 隔离 MongoDB 脚本验证：旧 TaskRun 兼容、部分唯一索引生效、终态不占锁、过期恢复、临时库清理。
- 客户端 fixture：三态展示、admin 刷新、进度轮询、`409` 错误、member 只读。

## 7. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| 部分唯一索引与旧数据冲突 | 中 | 索引只约束 `RUNNING + lockKey`；旧记录无 `lockKey`。隔离库验证后再申请生产变更 |
| 进程崩溃留下 `RUNNING` 锁 | 中 | 读侧 `stale` + 下一次触发条件恢复；不自动重试，避免重复执行 |
| 慢但存活的任务被误判 stale | 中 | 阈值可调；任务每处理一个资产写心跳；恢复只在下一次明确触发时发生，旧运行记 `FAILED`/`interrupted:<id>` 保留审计 |
| 手动刷新触发补采 | 高 | 端点拒绝非空 Body，服务端固定 `repair:false`；定时任务才读 `INTEGRITY_AUTO_REPAIR` |
| `result.assets` 过大 | 中 | 每资产只存计数与最多 20 段区间；不存原始价格与补采错误详情 |
| 把 GAP 误读为采集失败 | 高 | API/文档明确 GAP 只表示检测到缺口；不生成新交易状态或质量信号 |
| 两进程 stale 阈值不一致 | 低 | 阈值集中在 `shared/config/opsTasks.js`，由环境变量覆盖 |

## 8. Follow-up Actions

- [x] TASK-070：共享完整性任务、`202` 手动端点、`GET task-runs/:id`、历史三态、锁与进度、测试与文档。
- [ ] 生产 MongoDB 索引创建：合并/部署前需单独批准；本任务不连接生产库。若生产禁用 Mongoose `autoIndex`，需按模型定义手工创建；否则首次连接并加载 `TaskRun` 模型时由 Mongoose 创建。
- [x] TASK-071：价格同步接入全局锁 `ops:daily-price-sync`（阈值 60 分钟）、统一 `progress` 与逐资产 `result.assets`。
- [ ] TASK-072：单资产回填使用 `ops:asset-backfill:<assetId>` 前缀锁（计划阈值 30 分钟）；同步返回 `200 + summary`，冲突 `409`。
- [ ] 若后续需要区分停牌/采集失败/供应商异常，另立需求与 ADR，不在现有 GAP 上叠加推断。

## 9. Decision History

### 2026-11-24

Human Owner 批准 TASK-070 方案：

- 历史状态使用 `unavailable | checked | unknown`，`unknown` 不显示 0%；
- `expected < 3` 记 unknown；
- 批准 `lockKey` 部分唯一索引与 `progress`，要求隔离库验证、保留旧记录、终态不占锁；
- 进度节流 1 秒；完整性 stale 30 分钟；价格同步/回填阈值在后续任务接入；
- 手动刷新 `repair:false`；
- 新增 ADR-004，并在 ADR-002 保留原文、补充演进引用。

## 10. References

- [Spec #66 — 运维中心数据治理](https://github.com/tongweizj/portomind/issues/66)
- [TASK-070](https://github.com/tongweizj/portomind/issues/70)
- [ADR-002 — 单一调度器](./ADR-002-single-scheduler.md)
- [ADR-003 — symbol 后缀契约](./ADR-003-symbol-suffix-contract.md)
- [API 契约](../../handbook/technical/API_CONTRACT.md)
- [数据模型](../../handbook/technical/DATA_MODEL.md)
- [cron-worker 开发文档](../../handbook/technical/CRON_WORKER_DEV.md)
- [隔离库验证脚本](../../../server/scripts/verify-taskrun-lock.cjs)

# TASK-057 — `taskruns` 数据契约增强（`result` / `SKIPPED` / 再平衡父任务）（FS **C-05**）

## Metadata

**所属 Story：** [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)

**覆盖的验收条件：** US-001/AC-05～08（写侧支撑）

**规划核对：** [Planner 回交说明](./US-001-02-planner-return.md)；新增关联不改变本卡 AC、原状态、既有批准或结案结论。

**Status:**  
`Planning`（2026-10-30，Orchestrator 已接收规划并提交 Human 审阅；Draft 未批准，未获业务代码实施授权）。

**Priority:**  
`High`（P0 Must Have。它是 `TASK-054`（C-02）数据态、`C-07`（详情页）三列能否成立的**前提**；也是「全绿误导」这条已知缺陷的总闸）

**Owner:**  
`待指派`（本轮仅接收规划，未指派实施者或独立 Reviewer）。

**Created:**  
`2026-10-26`

**Updated:**  
`2026-10-30`（Orchestrator接收规划，更新Status及Owner；原创建日期保留）。

**Type:**  
`Feature`（共享内核数据契约 + worker 写库逻辑；属 FS `NG2` 的**例外**，已由 OQ3 裁定放行）

**Related Product Spec:**  
`docs/development/requirements/specs/FS-cron-worker-status-board.md`（R5a/R5b/R5c、R2 父任务部分、§7.2 缺口 D1–D5、OQ3）· `docs/development/requirements/specs/FS-cron-worker-status-board-tasks.md`（§C-05）

**Related ADR:**  
`ADR-002-single-scheduler.md`（不改调度归属，只补落库与父任务包裹）

**Execution Plan:**  
[Draft：TASK-057](./TASK-057-plan.md)（未批准；以本次规划与原卡约束共同核对，不构成实施授权）

**来源：**  
FS 卡片 `C-05`（PM 拆分，2026-10-26）

---

## 1. 问题

看板主张「**数据态为主信号**」（FS §3）：不是"任务有没有抛异常"，而是"该采的数据到底采齐了没有"。但当前 `taskruns` **装不下任何结果**，导致：

1. 完整性检查每天写 `SUCCEEDED`，真实缺口（`missingCount`）在 `runTrackedTask` 里被**静默丢弃**——不是报错，是无声消失。
2. 再平衡**没有父级记录**：未到期的组合和"整批崩溃"都产生**零条** `taskruns`，两者在数据上不可区分 → 「到期 N」这个**分母根本不存在**。
3. 逐组合再平衡任务无论是否生成建议都返回同一组计数 → 「生成结果 / 建议数」两列永远是空的。
4. 跳过（防重命中）只 `return` + 打日志、**不落库** → 看板"灰=跳过"没有数据载体；崩溃遗留的 `RUNNING` 会被当成"正在跑"。

本卡只做一件事：**让 `taskruns` 真的能承载结果**。不改调度时间、不改周期、不改防重语义（NG2）。

---

## 2. 已核实的代码事实（2026-10-26 亲读源码 + 只读查库）

### 2.1 三处硬缺口（FS §7.2 D1/D2/D3 全部成立）

| # | 缺口 | 证据 |
|---|---|---|
| **D1** | `TaskRun` schema **无 `result` 字段**；mongoose `strict` 默认 `true` → 写入被**静默丢弃**（不报错、不告警） | `shared/models/taskRun.js:3-30` |
| **D2** | `normalizeCounts()` 是**白名单**，只保留 `totalCount / successCount / failureCount / failures`；任务 `return {ok,gap,fxCount,skippedCount,...}` 一律被吞 | `shared/services/taskRunner.js:6-13` |
| **D3** | `status` 枚举 `RUNNING \| SUCCEEDED \| PARTIAL \| FAILED`，**无 `SKIPPED`**；两条跳过路径只 `return` + `taskLogger.warn`，**不落库** | `shared/models/taskRun.js:11-15`、`shared/services/taskRunner.js:16-21`（ALREADY_RUNNING）、`:30-36`（DUPLICATE_RUN_KEY） |
| **D4** | 再平衡**无父级 taskrun**：`startRebalanceScheduler` 的 `run: () => runRebalanceCheck()` 直接裸调，无 `runTrackedTask` 包裹；`summary` 只喂给 `taskLogger.info` | `cron-worker/src/schedulers/rebalanceScheduler.js:58-65`（summary）、`:117-122`（仅 log）、`:126-131`（注册） |
| **D5** | 逐组合任务**不区分** `needsRebalance` 真假：未超阈 `return {totalCount:1,successCount:1,failureCount:0}`，生成建议后**也**返回同一组 | `rebalanceScheduler.js:94`、`:106` |

### 2.2 五个任务的真实现状（哪些字段正在被丢弃）

| 任务 | `taskName` | 当前 `execute` 返回 | 被丢弃的字段 | 落点 |
|---|---|---|---|---|
| 价格同步 | `daily-price-sync` | `{totalCount, successCount, **skippedCount**, failureCount, failures[]}` | `skippedCount`（休市跳过数） | `shared/tasks/dailySync.js:26-34`、`:67` |
| 完整性检查 | `price-integrity-check` | 完整 `report`：`{checkedCount, **skippedCount**, assets[], **totals{expectedCount,actualCount,missingCount}**, **completenessRatio**}` | 除 4 个白名单字段外**全部** | `cron-worker/src/tasks/integrityCheck.js:209-233`、`:383`、包裹在 `:392` |
| 提醒评估 | `alert-evaluate` | `{totalCount:1, successCount:1, failureCount:0, **...stats**}`，`stats={evaluated,created,archived,failed}` | `evaluated / created / archived / failed` | `cron-worker/src/schedulers/alertScheduler.js:24` |
| 汇率同步 | `fx-rate-sync` | `{totalCount:1, successCount:1, failureCount:0, **fxCount**}` | `fxCount` | `cron-worker/src/schedulers/fxScheduler.js:25` |
| 再平衡（逐组合） | `rebalance-suggestions:<pid>` | 恒为 `{totalCount:1, successCount:1, failureCount:0}`（D5） | 建议数 / 记录 id / 是否超阈 | `rebalanceScheduler.js:94,106` |
| 再平衡（父） | **不存在** | `summary{totalCount, **dueCount**, **skippedCount**, failureCount, failures[]}` 只打日志 | 整条记录 | `rebalanceScheduler.js:58-65,117` |

> ⚠️ `price-sync` / `health-check` 只是 `createCronScheduler` 的日志 scope，**不产生 `taskruns`**（`priceScheduler.js:12`、`healthScheduler.js:13`）；落库名分别是 `daily-price-sync`、`price-integrity-check`。

### 2.3 实库只读核查（`portomind_dev`，2026-10-26，仅 SELECT）

| 核查项 | 实测值 | 含义 |
|---|---|---|
| `taskruns` 文档总数 | **204** | — |
| 含 `result` 字段的文档 | **0** | D1 在生产数据上确认：**从来没有一条结果被存下来过** |
| `taskName='rebalance-check'` | **0** | D4 确认：父任务记录从未存在 |
| 状态分布 | `SUCCEEDED 125` / `PARTIAL 42` / `FAILED 36` / **`RUNNING 1`** | 下方僵尸实证 |
| **僵尸 `RUNNING`** | `daily-price-sync`，`runKey=manual:2026-08-25T23:07:45.616Z`，`startedAt` 停在 **2026-08-25**，`endedAt` 缺失 | **已僵 62 天**，看板会把它读成"正在运行" → D3 的僵尸问题不是假设 |
| 索引 | `{_id:1}` · **`{taskName:1, runKey:1} unique`** · `{startedAt:-1, taskName:1}` | **唯一索引真实存在** → 与「SKIPPED 落库」直接冲突（§2.4-C1） |
| `taskName` 分布 | `daily-price-sync 47` · `rebalance-suggestions:<pid> 36×4` · `price-integrity-check 7` · `fx-rate-sync 3` · `alert-evaluate 3` | 合计 204 ✓；完整性检查历史明显短于价格同步 |
| 未归档组合 | **4 个**（`A股-长钱` / `A股-稳钱` / `CA-RRSP` / `CA-家庭RESP`），`rebalanceSchedule` 全为 `daily` | AC4 的 `perPortfolio.length` 期望值取 **4**（实库口径，不是"3 个组合"的记忆值） |

### 2.4 ⚠️ FS 未覆盖的四处冲突（本卡新增，直接影响实现形态）

| # | 冲突 | 事实 | 影响 |
|---|---|---|---|
| **C1** | **「SKIPPED 落库」与唯一索引 `(taskName, runKey)` 直接冲突** | `FS R5c` 要求"两条路径都要落库"，但：① `DUPLICATE_RUN_KEY` 的成因**正是**该 key 已存在，插第二条必然再撞 11000；② `ALREADY_RUNNING` 若用同 key `upsert` 改 `status=SKIPPED`，会**覆盖正在跑的那条记录**，把 RUNNING 改成 SKIPPED（语义摧毁） | 必须先在 §7 **OQ-1** 定方案，否则实现必然在"改索引 / 改语义 / 放弃落库"三者间被迫偷懒 |
| **C2** | **父任务 `result` 包不住 `dueCount`** | `runRebalanceCheck` 已经算出 `dueCount / skippedCount`，但 `normalizeCounts` 只认 4 个计数 → 若不做显式 `result` 透传，父任务记录里 `dueCount` **照样消失**（D2 原样复发） | AC4 必须要求"查库能读到 `result.dueCount`"，**不能**只断言函数返回值 |
| **C3** | **父任务包裹位置会打断 3 个既有测试** | `runRebalanceCheck` 的返回被 `cron-worker/test/rebalanceScheduler.test.js:65-68,85-86,111-112` 直接断言 `summary.totalCount/dueCount/skippedCount/failureCount`。若把 `runTrackedTask` 包在**函数内部**，返回值变成 taskrun summary → 断 3 处；若包在 **注册层 `run:`**，测试零改动，但手动调用 `runRebalanceCheck()` 不落库（当前**无 CLI** 调它，只有 `:130` 注册与 3 个测试） | §7 **OQ-3** 需裁：内部包 vs 注册层包 |
| **C4** | **汇率的「各币种成功标志」在当前实现下信息量≈0** | `fetchFromProvider` **全或无**：`USD/CAD/HKD` 任一非有限数就 `throw`（`fxRate.service.js:75-77`）。所以正常路径恒"三币种全成功"，异常路径整任务 FAILED —— 「三币全绿」永远成立，看不出汇率方向反了（`TASK-051`） | §7 **OQ-4**：`result` 该记"成功标志"（无用）还是记**实际抓到的 `rateToCny` 数值**（能让 `TASK-051` 的错误肉眼可见） |

---

## 3. Acceptance Criteria

> 期望值取自 §2 的实现语义与实库实测，**不得**从"看起来合理"反推；凡"查库可读到"的断言，**不得**用函数返回值替代。

| # | 验收标准 |
|---|---|
| AC1 | `shared/models/taskRun.js` 新增 `result: Schema.Types.Mixed`。断言方式必须是 **`TaskRun.findById()` 回读 `result` 非空**（不是看 `runTrackedTask` 的返回值）。**先红后绿**：改 schema 前先写该用例并确认失败（当前 schema 无该字段，strict 静默丢弃 → 回读必为 `undefined`）。 |
| AC2 | `normalizeCounts()` 改为「保留 `totalCount/successCount/failureCount/failures` + **仅透传调用方显式声明的 `result`**」。**负向对照**：任务返回 `{ ok:1, gap:2 }`（顶层裸字段，未包进 `result`）时，落库文档**仍不得**出现 `ok`/`gap` —— 白名单没有被偷偷改成"全量透传"。 |
| AC3 | 5 个任务回归，逐个**查库**确认：① 完整性检查 `result` 含 `totals{expectedCount,actualCount,missingCount}`、`checkedCount`、`skippedCount`、`completenessRatio`；② 提醒评估 `result` 含 `evaluated/created/archived/failed`；③ 汇率 `result` 含币种维度信息（形态由 OQ-4 定）；④ 价格同步 `result` 含 `skippedCount`（休市跳过数）；⑤ 再平衡父任务见 AC4。 |
| AC4 | 存在 `taskName='rebalance-check'` 的落库记录，且 `result.perPortfolio` **长度 = 未归档组合数**（dev 库实测 `4`，见 §2.3）；每项含 `{portfolioId, due, needsRebalance, suggestionsCount, recordId, status}`。**关键区分能力**：某组合 `needsRebalance=false` → `suggestionsCount === 0` **且** `recordId === null`；生成过建议 → `recordId` 非空且 `suggestionsCount > 0`。两者必须可区分（D5 的正面验收）。 |
| AC5 | 跳过落库按 **OQ-1 裁定方案**实现，且**两条路径**（`ALREADY_RUNNING` / `DUPLICATE_RUN_KEY`）都有可查询的观测载体。无论选哪个方案，必须满足：① 不得破坏唯一索引的防重能力；② 不得把**正在运行的**那条记录改成 `SKIPPED`（负向对照：并发首跑进行中触发第二次 → 事后首条记录 `status` 仍为 `SUCCEEDED`）。 |
| AC6 | **防重不退化**：同 `(taskName, runKey)` 二次触发不得产生两条记录；`TaskRun.collection.indexes()` 断言 `{taskName:1,runKey:1}` 的 `unique===true` 仍在。 |
| AC7 | **状态判定不变**：`failureCount>0 → PARTIAL`、否则 `SUCCEEDED`、未捕获异常 → `FAILED`（`taskRunner.js:50` 的语义零改动）。**负向对照**：任务返回合法 `result` 但 `failureCount=0` → 仍为 `SUCCEEDED`（新增字段不得改变状态机）。 |
| AC8 | **历史数据兼容**：现存 204 条无 `result` 的文档在读取侧不报错；`result == null` 必须被视为「契约未就绪」，**不得**当成空对象 `{}` 后渲染成"0 缺口"。 |
| AC9 | **不改调度语义（NG2）**：cron 表达式、`runKey` 形态（含逐组合 `<schedule>:<periodKey>`）、`SCHEDULE_DUE_RULES`、两层防重逻辑**零改动**；`server/` 仍不注册 cron（ADR-002）。 |
| AC10 | **测试**：新增单测覆盖 AC2/AC4/AC5/AC6/AC7；全量回归 **229 条全绿**（`test:server` **152** + `test:worker` **77**，2026-10-26 在 `main` 实测，两个 workspace 均 exit 0）。既有 `rebalanceScheduler.test.js:65-68` 等 3 处断言按 OQ-3 裁定处理（改测试须在 ExecPlan 里写明理由，不得为过测而弱化断言）。 |
| AC11 | **文档同步**：`docs/handbook/technical/CRON_WORKER_DEV.md §5` 补 `result` 字段、`SKIPPED` 落库口径、父任务 `rebalance-check` 的 `taskName`（§5.1 现只有 5 类，**不含父任务**）；`docs/handbook/ops/CRON_WORKER_OPS.md` 若涉及状态表（`:168` 现写 "`SKIPPED` 状态 = 正常防重"）需与新落库口径一致。 |
| AC12 | 独立 Reviewer 复核通过；Implementer **不得**自判。 |

---

## 4. Scope

**In Scope**

- `shared/models/taskRun.js`：`result: Mixed`；`status` 枚举补 `SKIPPED`（若 OQ-1 选"不改枚举"则须写明替代载体）
- `shared/services/taskRunner.js`：`normalizeCounts` 放开显式 `result` 透传；两条跳过路径的落库处理
- 5 个任务的 `execute` 返回值补 `result`（`shared/tasks/dailySync.js`、`cron-worker/src/tasks/integrityCheck.js`、`cron-worker/src/schedulers/{alertScheduler,fxScheduler,rebalanceScheduler}.js`）
- `cron-worker/src/schedulers/rebalanceScheduler.js`：补父任务 `rebalance-check` 包裹 + `result.perPortfolio[]`
- 测试与 `CRON_WORKER_DEV.md §5` 文档

**Out of Scope**

- **不改** `server/` 任何路由（`GET /api/cron/status` 属 `TASK-054`）
- **不改** 任何前端代码（`TASK-053`/`TASK-055`/`C-07`）
- **不改** cron 表达式 / 周期 / 时区 / 防重键 / 再平衡到期规则（NG2）
- **不重算**价格、汇率、再平衡（NG3）
- **不回填历史僵尸** `RUNNING`（§2.3 那条 62 天记录）：读时标记归 `TASK-054 AC7`，写侧回填会让 stale 判定失去意义；是否人工清理由 Human 定
- **不做** `taskruns` 的 TTL / 归档 / 分区策略（容量议题另立卡）
- **不做** 汇率方向修正（`TASK-051`）

---

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | **唯一索引与 SKIPPED 冲突被实现者自行"绕过"**：最省事的做法是删掉唯一索引或改成非唯一，防重当场失效 | AC6 强制断言 `unique===true`；OQ-1 必须先裁，ExecPlan 需写明索引变更（若有）的迁移与回滚 |
| R-2 | **`result` 体量失控**：完整性检查报告含 `assets[]`（逐资产 `missingRanges[]`），当前 44 资产，全量塞进 `result` 会让单文档膨胀、并随资产数线性增长（`taskruns` 已 204 条且按日只增不减） | §7 **OQ-2** 定裁剪口径；ExecPlan 须给出"实测单条文档大小 + 上限"数字 |
| R-3 | **父任务 state 语义误读**：`failureCount>0 → PARTIAL`，4 个组合全失败时父任务显示 `PARTIAL` 而非 `FAILED`，看板可能读成"部分成功" | ExecPlan 写明父任务状态口径；若需区分 `dueCount===failureCount` → 必须在卡外另裁，**不得**在本卡偷改状态机（AC7 已锁） |
| R-4 | **包裹位置选错打断既有测试**（C3），导致实现者顺手改弱断言 | AC10 明确"改测试须写明理由"；倾向 OQ-3 方案 B（注册层包裹，测试零改动） |
| R-5 | **两处 stale 判定打架**：本卡"定义僵尸阈值"，`TASK-054 AC7` 又要求接口判 `stale` | 职责切分写死在 §8：**本卡只定常量与枚举，判定在 `TASK-054` 读时完成**；本卡不得在写侧改历史记录 |
| R-6 | **静默丢弃复发**：把 `...result` 直接摊平到 `$set` 顶层，未知键仍被 strict 吞掉且不报错（与 D1 同型） | AC2 的负向对照 + AC1 的回读断言；`result` 必须是**嵌套字段**，不是摊平 |
| R-7 | **历史空窗被读成正常**：204 条历史全部无 `result`，上线首日看板若把 `result==null` 当 `{}`，会显示"缺口 0 / 全部正常"——正是本任务要消灭的"全绿误导" | AC8 + `TASK-054` 的 `contractReady=false` 降级路径必须同时成立；本卡上线后需**至少跑满一个周期**（5 个任务各一次）才算数据就绪 |
| R-8 | **汇率结果形态选错导致白做**（C4）：记"三币种成功标志"恒为全绿，等于没记 | OQ-4 需与 `TASK-051` 联动裁决；倾向记 `result.rates={USD,CAD,HKD}` 的**数值** + `result.providerBase`，让方向错误在看板上肉眼可见 |
| R-9 | **生产已有脏数据**：那条 62 天僵尸 `RUNNING` 若被本卡的"跳过落库"逻辑误当成活跃运行而永久阻止同日重跑（`activeTasks` 是进程内 Map，重启即清，风险有限但不为零） | ExecPlan 需说明"僵尸不参与防重"（跨进程防重靠 DB 唯一键，而僵尸的 `runKey` 是 `manual:<ISO>`，不会撞当日 key） |

---

## 6. Blocking Dependencies

| 编号 | 依赖 | 状态 |
|---|---|---|
| **B1** | Human 批准本卡，并裁决 §7 的 **OQ-1**（SKIPPED 载体）与 **OQ-3**（父任务包裹位置） | ⏳ 待排期（**OQ-1 未决不得开工**：它决定 schema 与索引，返工代价最高） |
| **B2** | Planner 产出 ExecPlan 并经 Human Plan Review（须冻结 `result` 的字段名与裁剪口径） | ⏳ 阻塞 |
| **B3** | 独立 Reviewer 复核 | ⏳ 交付时 |
| **B4** | 实库核查（`portomind_dev`）确认"上线首日无 `result`"已被读侧正确降级 | ⏳ 交付时（`TASK-054` 的 `contractReady` 路径） |

> **下游（本卡是被依赖方，不阻塞本卡）**：`TASK-054`（AC5/AC6 的 `contractReady` 自动转 `true`）、`C-07` 详情页（「到期 / 生成结果 / 建议数」三列）。两者均已按"缺失即降级"设计，**不得**因等本卡而拖延；但**不得**在本卡落地前宣称数据态完成。

---

## 7. Open Questions（需 Human / PM 裁决）

### OQ-1：`SKIPPED` 用什么载体落库？（**最关键**，决定 schema 与索引）

| 方案 | 做法 | 优点 | 代价 |
|---|---|---|---|
| **A（倾向）** | 唯一索引改 **partial unique index**：`{taskName,runKey,unique:true, partialFilterExpression:{status:{$ne:'SKIPPED'}}}` | 语义最干净：跳过记录不参与防重键 | 需在生产 **drop + 重建索引**（有数据、有停机窗口），`syncIndexes()` 行为需实测；两条同 key 的 SKIPPED 会并存（可接受） |
| B | 跳过记录用**合成 runKey**（如 `<runKey>#skip:<ISO>`） | 零索引变更、零迁移 | 污染 `runKey` 语义（`runKey` 是§5.2 稳定契约，历史 `grep`/巡检会多出噪声） |
| C | 只落 `ALREADY_RUNNING`（进程内锁，无 DB 冲突）；`DUPLICATE_RUN_KEY` 视为"已存在即已记录"，仅计数 | 改动最小、零迁移 | 与 FS R5c「两条路径都要落库」字面不符，需回写 FS |
| D | 另开 `taskSkips` 集合 | 完全不动 `taskruns` 契约 | 新增集合 + 新增查询路径，看板要 union 两处，复杂度最高 |

### OQ-2：`result` 的裁剪口径（尤其完整性检查）

① 全量 `report`（含 `assets[]` 逐资产 `missingRanges[]`）；② 摘要 + `gapAssets[]`（只留 `symbol/missingCount`）；③ 摘要 + `topN` 缺口。PM 倾向 ②：看板只需要数字 + 缺口清单，`assets[]` 全量会随资产数线性膨胀（R-2）。

### OQ-3：父任务 `rebalance-check` 的包裹位置

| 方案 | 做法 | 影响 |
|---|---|---|
| A | 包在 `runRebalanceCheck` **内部** | 任何调用都落库，但 `rebalanceScheduler.test.js` 3 处断言必须改（C3） |
| **B（倾向）** | 包在 `startRebalanceScheduler` 的 `run:` 里 | 测试零改动；但手动 `runRebalanceCheck()` 不落库（**当前无 CLI 入口**，影响≈0） |

同时需定 `runKey` 形态：建议 `marketDate()`（与"单日分发"一致，唯一索引天然一日一条），而非 `daily:<date>`。

### OQ-4：汇率 `result` 记什么？

① `{currencies:{USD:'ok'|'missing'}}` 成功标志（C4：**恒全绿，信息量≈0**）；② **实际 `rateToCny` 数值**（`{USD:7.13,CAD:5.21,HKD:0.92}`）——能立刻暴露 `TASK-051` 的方向错误（USD 若显示 `0.14` 即反了）；③ 两者都记。PM 倾向 ②（或 ③）。

### OQ-5：僵尸阈值定在哪一层？

FS 建议"2 × 周期"，但 5 个任务周期不同、再平衡按组合计划。本卡定常量（如 `STALE_FACTOR=2` 或按任务表），`TASK-054 AC7` 消费。是否允许每任务单独阈值？（`TASK-054` 的 OQ-3 与本条是同一问题，需一次裁完，避免两卡各写一套。）

---

## 8. Coordination Notes

- **与 `TASK-054`（C-02）**：054 已按"`result` 缺失 → `null` + `contractReady=false`"实现，**不阻塞**；本卡落地后同一接口自动填满。**字段名必须由本卡冻结、054 消费**，不得各自命名（否则前端要写两套兼容）。
- **与 `TASK-055`（C-03）/ `TASK-053`（C-01）**：本卡不碰 `client/`，文件集零重叠，可完全并行。
- **与 `C-07`（未立项）**：详情页「到期 / 生成结果 / 建议数」三列的真前置就是本卡（FS §7.2 结论）；C-07 的降级黄条依赖本卡落地才消失。
- **与 `TASK-051`（汇率方向反了）**：OQ-4 若记实际数值，看板会成为该 bug 最显眼的展示面。建议 `TASK-051` **先于**本卡结案，否则本卡一上线就展示"USD 0.14"这类异常值，容易被误判为本卡缺陷。
- **与 `TASK-052`（docs 治理）**：AC11 落在 `CRON_WORKER_DEV.md §5` 与 `CRON_WORKER_OPS.md`，与该任务的 `docs:check` 校验环可能有交集，实施时错峰。
- **职责边界（写死，避免两卡打架）**：**本卡 = 写侧（schema / 透传 / 父任务 / 跳过落库 / 僵尸阈值常量）；`TASK-054` = 读侧（stale 判定、降级、聚合接口）**。任何一侧都不得同时改另一侧。

## Orchestrator 接收记录

2026-10-30：按 Human 本轮接收 US-001 规划并提交 Draft 审阅的指令、Story 既有 High 优先级及 STATES.md §4，接收本卡规划，将原 BACKLOG 登记为 Planning。原 AC、Scope 与技术待决项不变；旧依赖表中的排期和分支描述为当时记录，当前授权核对见 [Orchestrator 审阅清单](./US-001-02-planner-return.md#7-orchestrator-接收与-human-审阅清单)。此登记只推进规划阶段，不批准计划、不宣布实施开工；Owner 仍待指派。

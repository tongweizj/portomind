# TASK-055 — 价格同步「数据态完成度」展示（FS C-03）

## Metadata

**所属 Story：** [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)

**覆盖的验收条件：** US-001/AC-03、04、07、10

**规划核对：** [Planner 回交说明](./US-001-02-planner-return.md)；新增关联不改变本卡 AC、原状态、既有批准或结案结论。

**Status:**  
`Planning`（2026-11-04，Human 已就 D-04 三项作出裁决并更新 AC6/AC8/AC9；**计划仍为 Draft，未获实施授权**）。

**Priority:**  
`High`（P0 Must Have。它是 FS 核心主张"任务跑绿 ≠ 数据到位"的**唯一可视化落点**）

**Owner:**  
`待指派`（本轮仅接收规划，未指派实施者或独立 Reviewer）。

**Created:**  
`2026-10-26`

**Updated:**  
`2026-11-04`（Human 裁决 D-04：更新 AC6 / AC8 / AC9；原创建日期保留）。

**Type:**  
`Feature`（前端数据态展示，纯客户端）

**Related Product Spec:**  
`docs/development/requirements/specs/FS-cron-worker-status-board.md`（**C-03 基线**：R3、OQ2、G2、US2、§7-A、§7-D）· `docs/development/requirements/specs/FS-cron-worker-status-board-tasks.md`（§C-03）

**Related ADR:**  
`None`

**Execution Plan:**  
[Draft：TASK-055](./TASK-055-plan.md)（**D-04 已裁决，AC 已更新**；计划本身仍待 Human 批准，未构成实施授权）

**来源：**  
FS 卡片 `C-03`（PM 拆分，2026-10-26）

---

## 1. 问题

价格同步是全系统最容易"假绿"的任务：

- 采集在 03:00（ET）跑，写入的是**前一交易日**的收盘价 → 拿"今天"当基准必然算错（FS §7-A）。
- `successCount` 在 `persistPrice()` **之后**才计数 → 任务 `SUCCEEDED` 只证明"没抛异常"，不证明"有新数据写入"（FS §7-D）。
- 单日失败**永久丢失**（无回补），第二天不会自动补。

所以这张卡不能用任何来自 `taskruns.status` 的"完成度"，必须用 **`assets × prices` 派生** 的 `expected / fetched / missing`（算在 `TASK-054` 服务端，本卡只渲染）。

---

## 2. 已核实的代码事实（2026-10-26 亲读）

| 事实 | 落点 |
|---|---|
| 本卡要渲染的卡片位由 `TASK-053` 建立（6 个区域），本卡**只填「数据态进度条 + 关键数字 + 异常入口」三块** | `TASK-053` AC4 |
| 派生指标由 `TASK-054` AC2 提供，**前端不得重算** | `TASK-054` |
| 价格唯一键是 `(symbol, canonicalDayTimestamp)`，日期已归一到 `MARKET_TIMEZONE` 当日 0 点 | `shared/models/price.js:23`、`shared/utils/marketTime.js` |
| 「上一开市日」判定服务端已有现成能力（`isMarketOpenToday(market, date)`） | `shared/services/calendar.service.js:146` |
| 现成格式化工具：`fmtPrice`（`$`/`C$` 单价）、`formatCny`、`formatMoney`、`CURRENCY_META`（含 `householdSymbol`） | `client/src/utils/priceDisplay.js` |
| 设计 token **目前没有**系统状态四色（只有 `up` 涨红 `#DF1B41` / `down` 跌绿 `#0E9F6E` / `warn` `#F5A524` / `danger` `#E0254B`） | `client/src/constants/design-tokens.js:28-32` → 状态色由 `TASK-056` 定义，**本卡只能引用，不得自定义色值** |
| 全仓无图表库用于卡片以外的复杂度；`recharts` 已在依赖中但**本期不需要**（不做趋势，NG4） | `client/package.json` |

---

## 3. Acceptance Criteria

> 期望值取自 FS R3 / G2 的文字与 `TASK-054` AC2 的字段语义，**不得**从实现反推。

| # | 验收标准 |
|---|---|
| AC1 | 价格卡展示 **目标市场日**（形如 `2026-10-23`）+ **应采/已采**（形如 `38 / 40`）+ **完成度百分比** + **进度条**。文案明确写"目标市场日"或"上一开市日"，**不得**写"今天"。 |
| AC2 | 色阶四态（颜色引用 `TASK-056` 定义的 token，不硬编码）：`fetched === expected > 0` → **绿**；`0 < fetched < expected` → **黄**；`fetched === 0 && expected > 0` → **红**；`expected === 0`（节假日/无 active 资产）→ **灰**。 |
| AC3 | `0 < fetched < expected` 时 missing 清单**可展开**，每项至少显示 `symbol` + `name` + `market`；收起时显示条数（如"缺 2 支"）。 |
| AC4 | **数值防御**：`expected === 0` 时百分比显示"—"，进度条宽度 0，**不出现 `NaN` / `Infinity` / `0%`**（`0/0` 的正向断言：构造 `expected=0, fetched=0`，断言 DOM 文本中无 `NaN`、无 `Infinity`）。 |
| AC5 | **进度条不溢出**：`fetched > expected`（异常数据）时宽度钳制在 100%，且**不把卡片顶破**（构造 `fetched=5, expected=3` 断言视觉宽度 ≤ 轨道宽度）。 |
| AC6 | **允许一处纯展示换算，禁止重算业务口径**：前端**可以**由 `fetched / expected` 算出显示百分比并据此画进度条（接口不返回 `percentage`，这是唯一可行方式，**Human 2026-11-04 裁决**）。约束：① 该换算只能有**一处**实现（唯一 helper），检测式 `grep -c "\* 100"` 在该目录内 ≤ 1；② 换算只做**展示**——不得自行判定谁是"应采"、不得改 `expected` / `fetched` / `targetMarketDate` 的取值、不得用 `lastRun` 反推；③ 换算结果必须钳制在 0–100（见 AC5）；④ 业务口径（哪些资产算应采）只由 `TASK-054` 后端派生，前端发现口径错误应回报而非前端补偿。 |
| AC7 | **不信任 `status`**：卡的配色与完成度**不得**读取 `lastRun.status`；`status` 仅用于第二行"运行态徽章"文案（如"已运行 03:00 / 失败"）。负向断言：把接口返回的 `status` 改成 `SUCCEEDED` 但 `fetched=0`，断言卡片仍为**红**。 |
| AC8 | **失败分层，不拖垮全局**（Human 2026-11-04 裁决：`/api/cron/status` 是**单端点返回五卡数据**，无法只让一张卡失败，故按两种失败分别验收）：<br>**① 整体失败**——请求本身失败（网络错误 / 5xx / abort）时，五张卡**统一**降级为"快照获取失败 + 可重试"，**不得**显示任何绿色或伪造的完成度；若存在上次成功快照，明示"数据为 X 时快照，刷新失败"；两个原始日志 tab **不受影响**（它们走独立接口，此条可实测）。<br>**② 单卡数据异常**——请求成功但价格段字段异常（缺 `dataState`、`expected` 非数、字段为 `null`）时，**只有价格卡**显示异常态，其余四卡正常渲染。 |
| AC9 | **空态必须分型，不得一律"暂无记录"**（Human 2026-11-04 裁决：价格卡的 `dataState` 恒为对象、**不会**为 `null`——它由 `assets × prices` 现算，`contractReady` 恒为 `true`；`null` 是完整性卡/再平衡卡的空态，与本卡无关）。价格卡须区分三种无数据情形：<br>**① `expected === 0`**（节假日 / 无 active 资产 / 全部未上市）→ 显示"无应采资产"，灰色，**不出现 0%**；<br>**② `fetched === 0 && expected > 0`**（全缺）→ 显示"疑似整体故障"，红色，**不逐条列 missing**（见 R-2）；<br>**③ 请求失败**（见 AC8 ①）→ 显示"快照获取失败"。<br>三种情形均**不得**渲染成绿色或"全部正常"。 |
| AC10 | 日期与时区口径与后端一致：目标日按 `MARKET_TIMEZONE` 展示，不因浏览器本地时区偏移一天（构造浏览器时区为 `UTC+8` 与 `UTC-7` 两种，断言目标日文本相同）。 |
| AC11 | `npm run build --workspace client` 通过；`cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` **0 error 0 warning**。 |

---

## 4. Scope

**In Scope**

- 价格同步卡的「数据态」区：目标日 / 应采已采 / 百分比 / 进度条 / missing 清单展开
- 该卡的 loading / error / 空态（局部）
- 与该卡相关的组件测试或走查脚本（按 `TASK-053` ExecPlan 约定的验证方式）

**Out of Scope**

- **不做**派生计算（服务端 `TASK-054`）
- **不做**状态色 token 定义与图例（`TASK-056`）
- **不做** tab 骨架与总览条（`TASK-053`）
- **不做**「查看日志」下钻跳转（`C-08`，未立项）
- **不做**历史趋势（`C-09`，P2 / NG4）
- **不做** launchDate 缺位治理入口（`C-10`，P2）
- **不改**行情页（`/prices`）的任何展示口径

---

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | **"上一开市日"被读成"今天"**：用户看到 `2026-10-23` 而当天是 `10-25`（周末），会以为页面过时 | AC1 强制文案写明"目标市场日（上一开市日）"；ExecPlan 需给出 tooltip 文案 |
| R-2 | **missing 全量刷屏**：节假日或数据源整体故障时 missing 可能是几十支 | AC3 展开区默认限高可滚动；顶部先给"缺 N 支"再展开；`fetched=0` 时**不**逐条列（改用一句"疑似整体故障"） |
| R-3 | **颜色语义冲突**：本项目行情"红涨绿跌"，而看板"红=坏/绿=好"。同一页面出现两种红 | 本卡只引用 `TASK-056` 的独立状态 token；若 056 未完成，本卡**不得自行取色**（阻塞项见 §6） |
| R-4 | **`expected` 口径争议**：`active=true` 但 `launchDate` 在未来 / 缺失时，算不算"应采" | 本卡按服务端口径原样展示；口径定义归 `TASK-054` AC2，如发现口径错误应回改 054 而非前端补偿 |
| R-5 | **符号写法不一致导致missing 误报**：`asset.symbol` 与 `price.symbol` 历史上存在 `000191` vs `000191.cn` 差异 | 服务端按 `asset.symbol` 出发查价（`TASK-054` R-2）；本卡若看到"几乎全缺"，先怀疑口径而非渲染 |
| R-6 | **时区偏移一天**：前端用 `new Date().toLocaleDateString()` 会把日期算成浏览器本地日 | AC10 双时区对照测试；日期字符串直接用服务端返回的 `YYYY-MM-DD`，**不做**本地化重算 |

---

## 6. Blocking Dependencies

| 编号 | 依赖 | 状态 |
|---|---|---|
| **B1** | Human 批准本卡 | ⏳ 待排期 |
| **B2** | Planner 产出 ExecPlan 并经 Human Plan Review | ⏳ 阻塞 |
| **B3** | 独立 Reviewer 复核 | ⏳ 交付时 |
| **B4** | `TASK-054`（`GET /api/cron/status`，AC2 提供 `targetMarketDate/expected/fetched/missing[]`） | ✅ **已解除（2026-10-27，`TASK-054` 归档 `complete/`）**——接口已实现（分支 `c7389d1`）；⚠️ **尚未合入 `main`**，开工前需先合并或从该分支切，否则本地 `GET /api/cron/status` 仍 404 |
| **B5** | `TASK-053`（卡片位） | ✅ **已解除（2026-11-04，`TASK-053` 结案并合入 `main`，PR #41 / `ecd9314`）**——看板骨架与六区域卡片位已在 `client/src/components/CronStatus/`，本卡可直接在其上填数据态 |
| B6 | `TASK-056`（状态色 token） | ⚠️ **部分就绪（2026-11-04）**：`statusOk/statusWarn/statusBad/statusIdle` 已实现在 `feature/TASK-056` @ `31b516e` 并通过审查，Task 已 `Completed`；但**尚未合入 `main`**（`Merged` = `Pending`）。从 `main` 拉分支取不到 token → 实施前须先合入 056，或从该分支切出（见 §7 与计划 §10） |

---

## 7. Coordination Notes

- **三卡同批**：`TASK-053`（位置）→ `TASK-054`（数据）→ **本卡（渲染）**；`TASK-056`（颜色）可并行但须先合入。
- **AC 不得重叠**：`TASK-053` 已断言"6 个区域存在"，本卡只断言"数据态区内的 4 种状态与 3 类防御"，避免同一断言被两卡重复计分。
- **与 `TASK-051`（汇率方向反了）**：无直接交集，但两者同属"数字正确性"议题，若同期实施注意不要把汇率卡的口径讨论混进价格卡。
- **与行情页 `client/src/utils/priceDisplay.js`**：本卡**只读**复用其格式化函数；若需新增"百分比"格式化，应加在该文件并同步其自检脚本 `client/scripts/verify-price-display.cjs`（不新开私有实现）。

---

## 8. 本卡未做的事

- 未改动任何代码、未创建 ExecPlan、未指派 Owner。
- 未定义任何色值（属 `TASK-056`）、未定义接口字段（属 `TASK-054`）。

## Orchestrator 接收记录

2026-10-30：按 Human 本轮接收 US-001 规划并提交 Draft 审阅的指令、Story 既有 High 优先级及 STATES.md §4，接收本卡规划，将原 BACKLOG 登记为 Planning。原 AC、Scope 与技术待决项不变；旧依赖表中的排期和分支描述为当时记录，当前授权核对见 [Orchestrator 审阅清单](./US-001-02-planner-return.md#7-orchestrator-接收与-human-审阅清单)。此登记只推进规划阶段，不批准计划、不宣布实施开工；Owner 仍待指派。

## D-04 裁决记录（2026-11-04，Human）

Human 就 [D-04（055 原 AC6/8/9 澄清）](./US-001-02-planner-return.md#d-04055原ac689澄清不改story-ac) 作出裁决，三项全部采纳推荐方案。**只改本卡 AC，不改 Story AC、不改 server/ 代码。**

| 子项 | 原 AC 的问题 | Human 裁决 | 落点 |
|---|---|---|---|
| **AC6** | 原文「只渲染不自算」禁止除法，但接口**不返回 `percentage`**（实测 `cronStatus.service.js` 价格 `dataState` 只有 `expected`/`fetched`），而 AC1 要求显示百分比 → **自相矛盾** | 「验收标准错了，应该允许前端做这样的简单计算」→ **允许一处纯展示换算**，禁止重算业务口径 | AC6 已重写 |
| **AC8** | 原文假设「每张卡各自请求」，但 `/api/cron/status` 是**单端点返回五卡数据**，abort 该请求无法只让一张卡失败 | 采用推荐解法 → **失败分两层**：整体失败（五卡统一降级，原日志不受影响）与单卡数据异常（只影响价格卡） | AC8 已重写 |
| **AC9** | 原文要求「`dataState` 为 `null` 时显示暂无运行记录」，但价格卡 `dataState` **恒为对象**（`contractReady: true`，由 `assets × prices` 现算）；`null` 实为完整性卡/再平衡卡的空态 | 采用推荐解法 → **空态分三型**：无应采资产 / 全缺（疑似整体故障）/ 请求失败 | AC9 已重写 |

**同时保留的约束**（未因裁决放宽）：AC2 仍须引用 `TASK-056` 的 token、不得自建色值；AC7 仍禁止用 `runState` 反推数据态；AC4/AC5 的数值防御不变。

**影响的下游**：`TASK-063`（共享请求层，需按 AC8 ① 实现整体失败）与 `TASK-055-plan.md`（§4 设计、§6 Decisions、§7 验证映射）须同步对齐；本卡已更新，计划的同步状态见其 §6。

**未做的事**：未修改 Story AC；未修改 `server/` `shared/` 任何代码；未批准计划；未指派 Owner。

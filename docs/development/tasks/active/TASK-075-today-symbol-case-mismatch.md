# TASK-075 — 今日行情列表 29 个基金「无数据」：客户端 symbol 未归一化

> **Status：Implementing**（2026-11-17，Human 批准计划后 Orchestrator 登记）。按 [DEV-ORDER-073-078](../DEV-ORDER-073-078.md) 顺序实施。
>
> ✅ **2026-11-17 归一化目标更新（ADR-003 已正式批准）**：[ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md) **提案**建议 symbol 统一契约采用「**按 `market` 派生大写后缀**」（`001180.CN` / `VOO.US` / `600519.SS`）。**ADR-003 已于 2026-11-17 由 Human 正式批准（`Accepted`）**。客户端侧只消费服务端返回的存储格式 symbol，不做任何后缀派生/strip（硬规则 #3）；原先「等待 073 strip→裸码契约」的表述作废。

## Metadata

| 字段 | 内容 |
|---|---|
| Status | **Implementing**（2026-11-17，Human 批准计划后 Orchestrator 登记；按开发顺序实施） |
| 所属 Story | 无（独立维护任务） |
| 覆盖的验收条件 | 本卡 §3 AC（来源：[PRICE-PIPELINE-REVIEW 附录 C / P0-4](../../../os/architecture/PRICE-PIPELINE-REVIEW.md#附录-c2026-11-17-补充--p0-4-今日行情客户端查找端未归一化)） |
| Priority | High（建议；用户可见 P0——29 个基金在列表里"没有价格"，待 Human 确认） |
| Owner | 待指派 |
| Created | 2026-11-17 |
| Type | Bugfix（client，少量契约对齐） |
| 来源 | Human 2026-11-17 观察 + Planner 亲读源码校正（根因见 §2） |
| Execution Plan | 已创建（2026-11-17，Planner 起草，Status `Approved` **已批准**）：[TASK-075 执行计划](./TASK-075-today-symbol-case-mismatch-plan.md)。D-h 已由 Human 选定 = 方案 A（服务端/数据层返回 ADR-003 存储格式 symbol，客户端零改动、零归一化）；因涉及跨端契约与前置依赖闸门，按 [EXECUTION_PLANS §2](../../../os/process/EXECUTION_PLANS.md) 建计划，批准前不得实施 |

## 1. 问题

今日行情列表（`client/src/pages/Prices/Today.jsx`）44 个资产中 **29 个 CN-FUND 显示「近 14 天无数据 · 缺口」**，而它们在库里全都有价格。三页表现不一致：

| 页面 | 表现 | 原因 |
|---|---|---|
| 价格同步卡片 | `44/42`（95%）正常 | 服务端 `getStatus` 查价两端都 uppercase → 29/29 命中 |
| 今日行情列表 | **29 个「无数据」** | 客户端归并/查找两端都用原始 symbol → 0/29 命中 |
| 估值 `getLatestPrices` | 27/29 无价 | 服务端估值链路两端不归一化 → [TASK-073](./TASK-073-price-pipeline-p0-data-correctness.md) 范围内 |

卡片是对的、列表和估值是坏的——同根（无统一归一化层）却各自实现一半。

## 2. 已核实的事实（Planner 2026-11-17 亲读）

| 事实 | 落点 |
|---|---|
| 价格窗口归并：`acc.get(row.symbol)` / `acc.set(row.symbol, …)`，用 API 返回的原始 symbol | `Today.jsx:54` / `:57` |
| 列表查表：`priceWindow.latestBySymbol.get(asset.symbol)`，用资产原始 symbol（小写 `.cn`） | `Today.jsx:117` |
| 库中 `prices.symbol` 为 `001180.CN` / 裸码，`assets.symbol` 为 `001180.cn` → 精确匹配失败 | [PRICE-PIPELINE-REVIEW P0-1](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) 实测 |
| **根因更正**：讨论中曾称"存时 uppercase、查时没 uppercase"；亲读确认**两端都没有 uppercase**。29 个受害资产的现象不变，但根因应写为"两端均未归一化" | 本节 + 审阅附录 C |
| 客户端**不得**直接 `require` shared（硬规则 #3）；统一归一化层属业务规则、只在 `shared/`（硬规则 #1）→ 契约对齐方式须裁决（§6 D-h） | [AGENTS.md](../../../../AGENTS.md) §5 |

证据边界：本轮只读源码，未跑浏览器/未连库；29/44 数字来自 Human 真实列表算法模拟与审阅实测，可在修复时以真实列表复验。

## 3. Acceptance Criteria

| # | 验收标准 | 来源 |
|---|---|---|
| AC1 | **仅验收客户端显示层**（前提：服务端/数据层由 [TASK-073 AC1/AC2](./TASK-073-price-pipeline-p0-data-correctness.md) 归一实现 + [TASK-077 AC5](./TASK-077-symbol-historical-data-migration.md) 历史迁移完成后，本卡才断言显示结果；服务端 27/29 无价另按 [AC3](#3-acceptance-criteria) 独立验收，本卡不与 077 AC5 的"键命中"重复断言）：今日行情列表 44 个资产中 **29 个 CN-FUND 正常显示价格与涨跌幅**（命中 44/44）；「无数据/缺口」只在真实缺价或请求失败时出现 | P0-4 |
| AC2 | symbol 归一口径**只有一处定义**：归并端与查找端消费同一服务端返回的存储格式 symbol（口径见 [ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md)，由服务端 TASK-073 保证）；**客户端零后缀派生/strip 逻辑**——检测式：`Today.jsx` 中不出现 `toUpperCase()` / `replace(/\.CN$/...)` 等内联后缀处理，client 全局无第二份归一化实现（硬规则 #1/#3） | P0-4 / 硬规则 #1/#3 / ADR-003 |
| AC3 | 修复**不掩盖**服务端缺陷：`getLatestPrices` 的 27/29 无价仍按 [TASK-073 AC2](./TASK-073-price-pipeline-p0-data-correctness.md) 独立验收，列表修复不得被视为估值链路已修 | 边界 |
| AC4 | 真实数据/浏览器验证：29 个基金在价格窗口内显示价格；未命中数的统计（`failedCount`/缺口条数）正确；其它页面（估值、价格同步卡片、原日志）零回归；`npm run build --workspace client` + eslint 通过（入口 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)） | — |

## 4. Scope

**In Scope**

- `Today.jsx` 价格归并端与查找端的 symbol 口径对齐（局部止血或按 D-h 契约化）
- 与统一归一化契约的对齐改动（仅 client 侧，按 D-h 裁决范围）

**Out of Scope**

- 服务端 `shared/` 归一化层与数据迁移（[TASK-073](./TASK-073-price-pipeline-p0-data-correctness.md)）
- 观测/熔断/新鲜度（[TASK-074](./TASK-074-price-pipeline-observability-and-robustness.md)）
- 估值/再平衡业务规则；不新建 client→shared 依赖（硬规则 #3）

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | 客户端另起一份归一化逻辑，与服务端口径漂移（后缀派生范围、upper 规则） | [ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md) 已定口径（服务端按 market 派生大写后缀）；client 零业务归一化，只消费存储格式 symbol |
| R-2 | 单行 uppercase 修好了列表，但估值仍坏，被误认为全部修复 | AC3 明示边界；与 TASK-073 分别验收 |
| R-3 | 29 个基金"有价"但涨跌幅按日序列口径错误（大小写归一后两套序列合并问题） | 与 [TASK-077 D-b](./TASK-077-symbol-historical-data-migration.md) 双轨删价口径对齐（历史迁移已拆至 077，非 073）；AC4 检查涨跌幅合理性 |

## 6. Human 裁决记录（D-h）

> ✅ **D-h 已裁决 = 方案 A**（Human 2026-11-17 本轮问答选定）。服务端/数据层按 [ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md) 返回存储格式 symbol，客户端纯消费、零归一化。方案 A 的实质是**客户端零生产代码改动**，依赖 TASK-073 + TASK-077 先落地；按 [TASK-075 执行计划](./TASK-075-today-symbol-case-mismatch-plan.md) 实施（Draft，未批准）。

| 选项 | 做法 | 影响 |
|---|---|---|
| **A（✅ 已裁决）** | 服务端 API 价格记录返回**已归一化的存储格式 symbol**（随 TASK-073 / ADR-003：按 market 派生大写后缀），客户端直接用返回值归并/查找，不再自行归一化 | 一处定义、客户端零业务规则；依赖 073 落地 + 077 迁移完成，需 API_CONTRACT 同步；短期列表仍坏，待上游完成 |
| B（未选） | 客户端建**单一**归一化 helper（与 `shared/` 同口径、文档标注同步检测）；两处消费同一 helper | 可独立快速修复；但存在第二份逻辑，须在硬规则 #1/#3 张力下由 Human 明确接受；口径须与 ADR-003 一致 |
| C（未选） | 仅按 Human 建议做单行修复（`Today.jsx:117` 用 uppercase 查表），止血后随 073 根治 | 最快让用户看到价格；归并端仍用原始 symbol，两套序列合并问题时可能再出错；**注意 ADR-003 下服务端目标格式是带后缀而非裸码，单行 uppercase 仅在新旧键大小写差异场景有效** |

## 7. Coordination Notes

- 与 [TASK-073](./TASK-073-price-pipeline-p0-data-correctness.md) 同根不同端：073 = 服务端归一化代码逻辑；本卡 = 客户端显示。影响本卡 R-3 的决策均已按 2026-11-17 拆分归位：**D-a（归桶）→ [TASK-078](./TASK-078-price-collection-timing-bucketing.md)**、**D-b（冲突口径）与历史数据迁移 → [TASK-077](./TASK-077-symbol-historical-data-migration.md)**，不再指向 073。
- **依赖与验收顺序**：本卡 AC1（44/44 命中）以前置修复为前提——服务端归一化实现（TASK-073 AC1/AC2）与历史数据迁移（TASK-077 AC5）须先完成，本卡仅断言客户端列表**显示**结果（[AC1](#3-acceptance-criteria)）；077 的 D-b 为"删光重采"，迁移期短期可能更缺价，故本卡验收排在 073 + 077 之后，不与 077 AC5 的"键命中"互相顶替。
- 审阅文档 [P0-4 / 附录 C](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) 为本卡发现的唯一事实来源，根因更正以那里为准；**归一化目标格式以 [ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md) 为准**（带大写后缀，非 strip→裸码）。
- 硬规则 #3/#1 的边界是本卡设计约束，不是可选项；D-h 已裁决 = 方案 A（客户端零改动），执行计划批准前不得开工。

## 8. 本卡未做的事

未实施、已创建 ExecPlan（Draft 未批准）、D-h 已裁决 = 方案 A、未改任何 AC/Status（Planner 仅建卡内容）。

## 9. 记录

2026-11-17，Planner：依据 Human 指令「根据这个问题，创建新的 task」建卡；同步把 P0-4 补入审阅文档附录 C（唯一事实来源）。Planner 亲读发现 Human 描述的"存时 uppercase"与代码不符（实为两端均未归一化），已在 §2 与附录 C 如实更正，未改变 29 个资产无价的现象。初始 Status 待 Orchestrator 登记；优先级建议 High，最终以 Human 为准。D-h 裁决前不得开工。

2026-11-17（同日追加）：symbol 统一契约由 [ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md) 正式批准为「按 market 派生大写后缀」（ADR 已于 2026-11-17 由 `Proposed` 转回 `Accepted`）。本卡 AC2 / R-1 / §6 / Coordination 已更新：客户端只消费服务端返回的存储格式 symbol，不做任何后缀派生/strip（硬规则 #3）；D-h 仍待裁决，推荐选项 A。

2026-11-17（Planner 重叠核对修订）：按 Human 指令核对与 073/076/077/078 的重叠后修订三处——① §7 / R-3 的 stale 决策引用归位：D-a → TASK-078、D-b 与历史迁移 → TASK-077（原误指 073）；② §7 补"依赖与验收顺序"：AC1（44/44）以前置 073 AC1/AC2 + 077 AC5 完成为前提，本卡验收排在 073 + 077 之后；③ AC1 补"仅验收客户端显示层"边界语，明确不与 077 AC5 的"键命中"重复断言（服务端 27/29 无价仍由 AC3 / 073 独立验收）。未改 D-h 裁决状态、任何实质 AC 意图或 Task 状态。

2026-11-17（任务卡移入 `active/` + 起草执行计划）：卡片由 `backlog/` 移入 `active/`；修正因移动产生的相对链接（073/074/077/078 现均同目录 `./`）；据 Human 本轮选定的 **D-h = 方案 A** 起草 [TASK-075 执行计划](./TASK-075-today-symbol-case-mismatch-plan.md)（Draft，未批准）。计划核心结论：方案 A 下**客户端零生产代码改动**（`Today.jsx` 用服务端返回的原样 symbol 归并与查找即命中），真实工作 = 前置闸门（073+077 先落地且库已迁移）+ API_CONTRACT 一句语义澄清（链接 ADR-003）+ 真实库浏览器 E2E。§6 D-h 由"待裁决"改为"已裁决 = 方案 A"，Metadata Execution Plan 行、§6、§7、§8 同步。未改任何 AC 实质意图或 Task 状态。

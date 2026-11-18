# TASK-077 — 历史数据 symbol 归一迁移（按 ADR-003 改写全部存量数据）

> **Status：Implementing**（2026-11-17，Human 批准计划后 Orchestrator 登记）。按 [DEV-ORDER-073-078](../DEV-ORDER-073-078.md) 顺序实施。

## Metadata

| 字段 | 内容 |
|---|---|
| Status | **Implementing**（2026-11-17，Human 批准计划后 Orchestrator 登记；按开发顺序实施） |
| 所属 Story | 无（独立维护任务；数据迁移范围原属 [TASK-073](../active/TASK-073-price-pipeline-p0-data-correctness.md)，2026-11-17 由 Human 指令独立成卡） |
| 覆盖的验收条件 | 本卡 §3 AC（契约来源：[ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md) Accepted + [PRICE-PIPELINE-REVIEW P0-1](../../../os/architecture/PRICE-PIPELINE-REVIEW.md)） |
| Priority | High（建议；不改历史数据则 P0-1/P0-4 的显示与估值修复无法闭环，待 Human 确认） |
| Owner | 待指派 |
| Created | 2026-11-17 |
| Type | 数据迁移（不可逆操作，需备份 + 可重复执行脚本） |
| 来源 | Human 2026-11-17 指令「把历史数据更新独立成一个 task，放 active 目录下」 |
| Execution Plan | 已创建：[TASK-077 实施计划](./TASK-077-symbol-historical-data-migration-plan.md)（`Approved`，已批准）。不可逆迁移必写；D-b 裁决后细化 |

## 1. 问题

[ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md) 已 Accepted（存储符号 = **按 `market` 派生的大写后缀**：`001180.CN` / `VOO.US` / `600519.SS`），但**存量数据仍是三套格式并存**：

| 集合 | 现状（审阅实测） | 后果 |
|---|---|---|
| `assets`（44） | 29 个 CN-FUND 存小写 `001180.cn`；US 资产裸码 `VOO` | 与 ADR-003 存储格式不符 |
| `prices`（8 万+） | 双轨序列：`001180`（裸码，停更 7 月）+ `001180.CN`（仍在更新）；重叠 448 天中 **104 天数值不同** | 同一基金两套价格历史，互相污染 |
| `transactions`（50） | symbol 混用大小写/裸码 | 与归一后的 assets/prices 断链风险 |
| `portfolio.targets[]` | 同上 | 目标配置精确匹配失效 |

[TASK-073](../active/TASK-073-price-pipeline-p0-data-correctness.md) 的 AC2/AC3 已包含此迁移，本卡按 Human 指令**将其独立出来**——迁移是可单独排期、单独审批、单独验收的不可逆操作，独立成卡让风险与证据边界更清晰。

## 2. 已核实的事实

| 事实 | 落点 |
|---|---|
| ADR-003 已 Accepted，明确"存量全量迁移 + 双轨合并 + 备份 + 幂等" | [ADR-003 §5/§8](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md) |
| 44/44 资产有 `market`（派生后缀的前提成立） | ADR-003 风险表；审阅实测 |
| `assets`/`prices`/`transactions`/`portfolio.targets` 四集合需全量改写；`prices` 8 万+ 文档 | ADR-003 §5 |
| D-b（104 冲突日合并口径）**仍待 Human 裁决** | [TASK-073 §6 D-b](../active/TASK-073-price-pipeline-p0-data-correctness.md) |
| TASK-073 已把迁移列为 In Scope，本卡独立后须同步从其 Scope/AC 中移除（避免两卡重复实施） | TASK-073 §4 |

证据边界：本轮只读文档，未连库、未执行迁移；所有数字来自审阅与 ADR-003 记录。

## 3. Acceptance Criteria

| # | 验收标准 | 来源 |
|---|---|---|
| AC1 | `assets` 全部 44 条 symbol 按 market 派生为 ADR-003 存储格式（大写后缀），唯一索引无冲突；`market` 缺失资产先盘点补齐（当前实测 0 条缺失） | ADR-003 §5 |
| AC2 | **先全量冲突探测**（只读）：扫描所有 active 资产，找出"同一资产的价格记录**同时存在带后缀与不带后缀两种 symbol 键**"的资产（双键资产），列出资产、两套键、各自行数与日期范围。**对每个双键资产：删除该资产的全部价格记录（两套键都删）**，等待下一次采集按 ADR-003 新键重新写入。⚠️ **Human 2026-11-17 知情裁决**：此操作会丢失该资产 2021～2026 的历史价格（每日采集只恢复最新 1 条；`historySync` 按需另行手工回补），**仅双键资产受影响**，非双键资产的价格不动。删除清单与条数逐资产留痕 | Human D-b 裁决（知情接受数据丢失） |
| AC3 | `transactions.symbol` 与 `portfolio.targets[].symbol` 同步归一到新键，与 `assets` 精确匹配；无悬挂引用 | ADR-003 §5 |
| AC4 | 迁移脚本**幂等**（重复执行结果一致）、有**旧键→新键映射表**与**双键删除清单**；执行前 `npm run sync:db` 备份/还原点已留；任何失败可回滚。**执行顺序必须冻结**：①探测双键资产（只读）→ ②归一 `assets.symbol`/`transactions`/`portfolio.targets` 到新键 → ③删除双键资产的全部 `prices`（旧键+新键）→ ④下一次采集按新键写入。顺序颠倒会导致新价写回旧键 | ADR-003 §8 / D-b |
| AC5 | 迁移后精确匹配恢复：`getLatestPrices` 对全部 active 资产命中（32 持仓缺价 17 → 0），今日行情 44/44 命中（[TASK-075 AC1](../active/TASK-075-today-symbol-case-mismatch.md)），`getStatus` 精确匹配语义保持（[TASK-054 D-20]）。⚠️ **双键资产的价格历史深度按 D-b 裁决主动放弃**，本 AC 只断言"键命中"，不断言历史天数；非双键资产的历史价格完整保留 | ADR-003 §9 / D-b |
| AC6 | 迁移前已有测试全绿、迁移后仍全绿（`test:server`/`test:worker`，入口 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)）；独立 Reviewer 通过 | — |
| AC7 | **其它历史数据问题只读探测 + 生成分类报告**（Human 2026-11-17 裁决）：运行探测脚本（一次性/临时工具，**不注册 cron、不自动运行**），扫描：① `NOT_FOUND` 资产（审阅实测 `VBG.TO`/`VBU.TO`/`VCR` 连续 3 周每天失败）→ 资产/provider/失败天数/币种桶；② 僵尸 `RUNNING`（`daily-price-sync`, `runKey=manual:2026-08-25…`）→ taskName/runKey/startedAt；③ `transactions`/`portfolio.targets` 中**指向不存在资产**的悬挂 symbol → 所在文档与值；④ 双键资产（AC2 探测对象）与 symbol 格式不合规项。输出一份 **Markdown 分类报告**：按错误类型分节，每节以表格罗列具体条目（标识、值、数量、日期范围、建议严重度），并写明探测基线（日期/库/脚本版本）。**只探测、不修改任何数据**——报告供 Human 判断"哪些类型严重到要升级进数据完整性检查（TASK-076）" | 审阅 P2-7 / §2.3 / D-e-data |
| AC8 | **使用手册**：随探测脚本交付一份文档，写清：脚本位置与命令入口（含 `--help`）、前置条件（连哪个库、是否需先 `sync:db`、只读保证）、各探测项含义、参数与输出位置（报告路径）、报告各字段解释、误报排查、以及"报告如何用于升级到数据完整性检查"的说明。脚本不靠口传使用 | D-e-data |

## 4. Scope

**In Scope**

- 迁移脚本（在 `shared/` 或独立 scripts 目录，一次性/可重复执行）：`assets` / `prices` / `transactions` / `portfolio.targets` 四集合 symbol 改写 + 双轨价格序列合并
- 旧键→新键映射表、双键删除清单、备份/回滚说明
- **只读数据质量探测脚本 + Markdown 分类报告 + 使用手册**（AC7/AC8）：NOT_FOUND 资产、僵尸 RUNNING、悬挂 symbol、双键资产、格式不合规项；临时工具，不注册调度
- 迁移前后验证（AC5）与文档（API_CONTRACT / DATA_MODEL 如需）

**Out of Scope**

- 新数据的写入侧归一化（新建资产自动派生后缀 → TASK-073 AC1）
- 采集时刻/归桶修正（TASK-073 D-a）；`launchDate` 与资产信息检查（TASK-076）
- 客户端展示修复（TASK-075）；P1/P2 观测（TASK-074）

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | **不可逆（已知情接受）**：双键资产的历史价格被删除，仅下一次采集恢复 1 条；**Human 2026-11-17 明确选择"坚持删光重采（丢历史）"** | 执行前 `sync:db` 备份（唯一还原点）；删除清单逐资产留痕；若日后需历史，用 `historySync --from` 手工回补（能力未验证，不承诺） |
| R-2 | 探测遗漏导致误删非双键资产的历史 | 探测脚本只读输出清单先经人工确认；删除严格按清单执行，不按模糊匹配 |
| R-3 | US 后缀变化（裸码 → `.US`）致用户/外部引用（URL、手工记录）失配 | 旧键→新键映射表；界面与文档说明 |
| R-4 | `symbol` 全局唯一键冲突（两资产归一后同键） | 迁移前碰撞检测；冲突停下人工处理，不自动覆盖 |
| R-5 | 与 TASK-073 重复实施迁移 | 本卡独立后须同步从 073 Scope/AC2/AC3 移除迁移内容（见 §7） |

## 6. Human 裁决记录

| # | 决定 | 内容 |
|---|---|---|
| **D-b** | ✅ **已裁决（2026-11-17，知情接受数据丢失）** | ① **先跑全量冲突探测**（只读，摸清真实双键资产规模——"104 天"仅是 `001180` 单只样本，全局数字待实测）；② 发现某资产的价格记录**同时包含带后缀与不带后缀两种键** → **删除该资产的全部价格记录**（两套键都删），等待下一次采集按 ADR-003 新键重写。⚠️ **Human 明确选择"删光重采"，知悉每日采集只恢复最新 1 条、2021～2026 历史将丢失**；无损合并方案（保留历史）已被告知并被否决。仅双键资产受影响，非双键资产价格不动。执行顺序与备份要求见 AC4 |
| **D-e-data** | ✅ **已裁决（2026-11-17）** | 探测工具为**临时脚本**：①必须配**使用手册**（命令、前置、只读保证、输出路径、字段解释、升级流程）；②运行后生成**分类数据报告**——按错误类型分节、每节表格罗列具体问题、含基线信息；③**只探测不自动修改**；④报告供 Human 判断哪些类型严重到要升级进"数据完整性检查"（TASK-076）。详见 AC7/AC8 |

其余架构口径已由 ADR-003 冻结（后缀表、HK 前导零、market 不可变），不再重复裁决。

## 7. Coordination Notes

- 与 [TASK-073](../active/TASK-073-price-pipeline-p0-data-correctness.md)：**边界已按 Human 2026-11-17 规则冻结——073 处理代码逻辑（派生函数与消费接线），本卡处理数据库（历史数据）**；073 的 Scope/AC2/AC3 已剥离迁移内容并指向本卡。
- 与 [TASK-078](./TASK-078-price-collection-timing-bucketing.md)：078 改**新采集的归桶规则**，本卡处理**已有历史数据**；排期上建议本卡先迁移（清掉双键/旧桶），078 再切换口径。
- 与 [TASK-075](../active/TASK-075-today-symbol-case-mismatch.md)：075 修客户端显示，本卡提供归一后的数据；075 AC1（44/44 命中）以本卡迁移完成为前提之一。
- 与 [TASK-076](../active/TASK-076-asset-information-completeness-check.md)：076 发现并报告 symbol 不合规（不自动改），本卡执行统一迁移；迁移完成后 076 的 symbol 检查不再报警。
- 硬规则：迁移规则属业务规则，**只在 `shared/`**；不新建第二份后缀派生实现（ADR-003 两张表为唯一来源）。

## 8. 实施与审查证据

计划批准、隔离库执行和返工证据见[实施计划 §11](./TASK-077-symbol-historical-data-migration-plan.md#11-implementation-record)。独立审查结论见[实施计划 §12](./TASK-077-symbol-historical-data-migration-plan.md#12-review-record)。D-b 与 D-e-data 的裁决见本卡 §6。

## 9. 记录

2026-11-17，Planner：依据 Human 指令「把历史数据更新独立成一个 task，放 active 目录下」建卡。迁移方案的唯一契约来源是 [ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md)（Accepted）；从 TASK-073 剥离的范围须由 Orchestrator 在登记时同步（§7）。初始 Status 待 Orchestrator 登记；优先级建议 High，最终以 Human 为准。

2026-11-17（续）：Human 裁决 **D-b**——先全量冲突探测（只读），对双键资产**删除全部价格后等下次采集**，并**明知每日采集只恢复 1 条、历史将丢失仍坚持执行**。Planner 已在提问中明确告知损害范围与三种替代（无损合并 / 删旧键+手工全量回补），Human 明确选择"删光重采"。AC2/AC4/AC5、§5 R-1/R-2、§6 已同步；**执行前 `sync:db` 备份为唯一还原点**，探测清单须人工确认后按单删除。ExecPlan 批准前不得开工。

2026-11-17（续 2）：Human 指令「检查历史数据还存在哪些其他问题，在 077 中一并处理」。审阅文档可确认的数据层问题已加入 AC7：① `NOT_FOUND` 资产（`VBG.TO`/`VBU.TO`/`VCR` 连续 3 周每天失败、CAD 桶恒 null）；② 僵尸 `RUNNING`（62 天）；③ `transactions`/`portfolio.targets` 悬挂 symbol。未纳入未经审阅证实的问题。

2026-11-17（续 3）：Human 裁决 **D-e-data**：因本任务是临时任务，探测工具必须 ① 配**使用手册**（AC8：命令/前置/只读保证/输出/字段/升级流程）、② 运行后生成 **Markdown 分类数据报告**（AC7：按错误类型分节、每节表格罗列具体问题 + 基线信息）、③ 只探测不自动修改。报告供 Human 判断哪些类型严重到要升级进数据完整性检查（TASK-076）。§6 裁决表、§4 Scope、§8 已同步。

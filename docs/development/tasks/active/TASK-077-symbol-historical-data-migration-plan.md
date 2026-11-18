# TASK-077 — 历史数据 symbol 归一迁移 实施计划

## Status

Status：Approved（2026-11-17，Human 批准「073～078 计划」；`Draft → Approved` 归 Human）

Owner：Planner（起草）；Implementer（待指派）

Related Task：[TASK-077-symbol-historical-data-migration](./TASK-077-symbol-historical-data-migration.md)（独立维护任务，无 Story）

Related Spec / ADR：[ADR-003 symbol 统一契约](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md)（Accepted）；[PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) P0-1

Branch / Base：起草时 `main` @ `d6e1413`；实施从最新 `main` 开 `feature/TASK-077-symbol-historical-data-migration`；脚本落 `scripts/` 或 `shared/scripts/`（由 §4 冻结），与任务卡同目录平铺本计划

Approval：**已批准（2026-11-17，Human）**。本计划覆盖任务卡 AC1–AC8 与已裁决 D-b（双键资产删光重采、知情接受历史丢失）、D-e-data（临时探测脚本 + 使用手册 + Markdown 分类报告，只探测不修改）；`Draft → Approved` 须 Human 明确批准当前设计。W0 前置（TASK-073 派生函数落地）未满足不得开工。

## 1. Intent

按 ADR-003 把**存量数据**归一到「按 `market` 派生的大写后缀」键（`001180.CN` / `VOO.US` / `600519.SS`），并交付一份临时数据质量探测工具。

目标（不改需求、不改产品行为）：

1. `assets` / `transactions` / `portfolio.targets` 的 symbol 归一（AC1/AC3）；
2. 双键资产（同一资产同时有带后缀与不带后缀价格）→ **删除该资产全部价格、等下次采集**（AC2，D-b 知情数据丢失）；
3. 临时**只读**探测脚本 + Markdown 分类报告 + 使用手册（AC7/AC8，D-e-data），报告供 Human 判断哪些类型要升级进 TASK-076 数据完整性检查；
4. 备份、幂等、映射表、执行顺序冻结（AC4）。

范围外（任务卡 §4）：新数据写入侧归一（TASK-073）、采集时刻/归桶（TASK-078）、资产信息检查（TASK-076）、客户端（TASK-075）、P1/P2 观测（TASK-074）。

## 2. Context

- **交付规则**：2026-11-17 Human 冻结「073 处理代码逻辑、077 处理数据库、078 处理采集程序」。本卡**只写数据库迁移脚本和临时探测工具**，不改 `shared/` 的业务规则实现。
- **ADR-003 已 Accepted**：后缀派生规则（两张表）由 TASK-073 在 `shared/` 交付；本卡迁移脚本**必须复用** TASK-073 的派生函数，**禁止复制第二份后缀规则**（硬规则 #1/#8）。故执行顺序冻结：**TASK-073 代码先落地 → 本卡迁移 → TASK-078 切换采集口径**（否则新写入仍用旧键，迁移被撤销）。
- **数据来源**：审阅实测（2026-11-15，`npm run sync:db` 镜像后的 `portomind_dev`，只读）——44 资产 / 8 万+ 价格 / 50 交易；"104 冲突日"是 `001180` 单只样本，**真实双键规模待探测实测**。
- 备份入口：`scripts/sync-db.cjs`（mongodump/mongorestore，默认读 `server/.env` 的 `MONGO_URI`；[DEPLOYMENT §4](../../../handbook/ops/DEPLOYMENT.md)）。
- 排期：`scripts/verify-task-057.cjs`、`scripts/verify-task-064.cjs` 是既有验证脚本模式（一次性脚本放根 `scripts/`，不注册调度），本卡探测脚本沿用该模式。

## 3. Repository Findings（2026-11-17 亲读）

| 事实 | 落点 |
|---|---|
| `Asset.symbol`：`unique:true, trim, uppercase, minlength 1, maxlength 32, match /^[A-Z0-9][A-Z0-9._-]*$/`；44/44 有 `market` | `shared/models/asset.js:9-26` |
| `Transaction.symbol`：`required, trim, uppercase`；索引含 `{portfolioId,symbol,date,_id}` | `shared/models/transaction.js:16,33` |
| `Portfolio.targets[]`：`level='asset'` 时 symbol 为资产代码（业务层统一大写）；`level='asset_class'` 时为大类代码（**小写**，不可误改） | `shared/models/portfolio.js:62-68` |
| `Price` 唯一索引 `{symbol:1, timestamp:1}`，日粒度 upsert | `shared/models/price.js:23`、`shared/services/priceStorage.service.js:13-30` |
| `taskruns` 唯一索引 `{taskName,runKey}`；僵尸 `RUNNING` 存在（62 天） | 审阅 §2.3；[ TASK-057 ](../../delivery/completed/US-001/TASK-057.md) 历史记录 |
| 派生函数 `toStorageSymbol`/`STORAGE_SUFFIX` **尚不存在**（TASK-073 待实施） | `grep` 全仓 0 命中（2026-11-17） |
| `scripts/sync-db.cjs` 提供备份/镜像；根目录 `scripts/verify-task-*.cjs` 为既有一次性脚本模式 | `scripts/` 目录 |

未核实/边界：本轮未连库、未运行脚本；NOT_FOUND 资产列表、双键真实清单、悬挂 symbol 数量以探测报告实测为准，不预填审阅样本数。

## 4. Proposed Design（冻结）

### 4.1 两个脚本（一次性/临时，不注册 cron）

| 脚本 | 职责 | 写权限 |
|---|---|---|
| `scripts/probe-symbol-data-quality.cjs`（探测） | 只读扫描 5 类问题，生成 Markdown 分类报告 + 使用手册；供 Human 决策 | **只读**（仅连接读操作，脚本入口显式断言只读） |
| `scripts/migrate-symbol-data.cjs`（迁移） | 按 D-b 执行归一 + 双键删价 + 映射表；**复用 TASK-073 派生函数** | 写（需备份后运行） |

### 4.2 探测脚本（AC7/AC8）

- 命令：`node scripts/probe-symbol-data-quality.cjs [--uri <MONGO_URI>] [--out <报告路径>] [--help]`；默认库取 `server/.env` 的 `MONGO_URI`，默认报告写 `docs/development/tasks/active/TASK-077-data-quality-report.md`（或带日期后缀，Plan Review 定）。
- 只读分类扫描（每类独立函数，失败不影响其它类）：
  1. **双键资产**：按资产 symbol 与其 ADR-003 目标键在 `prices` 上分别 count，同时存在两种键且均有文档的列为双键（含各自条数与日期范围）；
  2. **symbol 格式不合规**：`assets` 中 symbol 不符合正则或与 `market` 派生目标不一致（ lowercase `.cn` / 裸码 / 错后缀）；
  3. **NOT_FOUND 资产**：`taskruns.failures[]` 中 `category='NOT_FOUND'` 的 item，统计连续天数、provider、是否 active、所属币种桶（按 `ASSET_CURRENCIES` + asset.currency 映射）；
  4. **僵尸 RUNNING**：`taskruns` 中 `status='RUNNING'` 且 `startedAt` 早于阈值（用 `STALE_FACTOR` 单一常量，不新造阈值）的记录；
  5. **悬挂引用**：`transactions.symbol` 与 `portfolio.targets[].symbol`（**仅 `level='asset'`**，排除 `asset_class` 小写代码）在 `assets` 中找不到对应 symbol 的条目。
- 报告结构：`# 数据质量探测报告` + 探测基线（日期 / 库名 / 脚本 SHA256 / 常量来源）+ 每类一节（表格：标识 / 值 / 数量 / 日期范围 / 建议严重度 / 升级建议）+ 汇总（总数、最多的一类）+ "如何升级到 TASK-076"说明。空类别也写"（无）"。
- 使用手册 `scripts/PROBE-SYMBOL-DATA-QUALITY.md`（AC8）：命令与 `--help`、前置（库连接、`sync:db` 镜像建议、只读保证）、每类含义与误报排查、输出路径与字段、升级流程；明确"脚本不注册调度、不自动运行"。

### 4.3 迁移脚本（AC1–AC5）

- 命令：`node scripts/migrate-symbol-data.cjs [--uri <URI>] [--dry-run] [--force] [--help]`；默认 **dry-run**（只打印计划，不写库），`--force` 才执行写；启动时校验派生函数来自 TASK-073 的 `shared` 模块（缺失即报错退出）。
- **执行顺序冻结**（AC4）：
  1. `sync:db` 备份/还原点（人工执行并确认，脚本检查备份标记文件存在）；
  2. 调用探测逻辑输出**双键清单**（只读）→ 人工确认清单后按清单执行；
  3. `assets.symbol` 归一（按 `market` 派生），唯一键碰撞检测：两资产归一后同键 → **停下人工处理**，不自动覆盖；
  4. `transactions.symbol` / `portfolio.targets[].symbol`（仅 asset 级）同步归一；
  5. 对双键资产：删除 `prices` 中该资产 symbol 的**全部文档**（裸码键 + 目标键），逐资产记录删除条数；非双键资产价格**不动**；
  6. 生成 `旧键→新键映射表` 与 `双键删除清单`（Markdown/JSON，随脚本输出）；
  7. 下一次采集按新键写入（依赖 TASK-078 分组调度，本卡不触发采集）。
- 幂等：重复执行时若所有键已归一、无双键资产 → 输出"无需变更"；映射表与删除清单追加写不覆盖历史。
- **D-b 数据丢失**：双键资产历史价格被删后仅恢复最新 1 条，知情接受；`historySync` 手工回补为可选项（能力未验证，不在本卡承诺）。

### 4.4 关键取舍

- 探测与迁移**分离**：探测只读、可独立运行多次；迁移需显式 `--force`，防止误删。
- 不复制后缀规则：复用 TASK-073 的 `shared` 派生函数（W0 前置）。
- 不自动处理 NOT_FOUND / 僵尸 / 悬挂：只出报告，升级与否由 Human 定（D-e-data）。
- 同一天多批次覆盖语义由 TASK-078 的 D-a-附带冻结（后写覆盖先写 + 写入日志），本卡不改价格写入逻辑。

## 5. Work Breakdown

- [ ] W0（前置门）：确认 TASK-073 的 `toStorageSymbol` / `STORAGE_SUFFIX` 已在 `main`；未满足即停下（禁止复制第二份规则）。
- [ ] W1：实现探测脚本（只读，5 类扫描）+ Markdown 报告模板 + 使用手册（AC7/AC8）。
- [ ] W2：在隔离开发库（先 `sync:db` 镜像）实跑探测，产出首份报告；人工确认双键清单。
- [ ] W3：实现迁移脚本（dry-run + --force、备份标记检查、碰撞检测、四类集合归一、双键删价、映射表/删除清单）。
- [ ] W4：执行迁移（人工确认后）+ 迁移后验证（AC5）+ 全量测试回归（AC6）。
- [ ] W5：Reviewer 独立审查；报告与脚本交付归档。

## 6. Decisions（全部已冻结，无待决）

| # | 决定 | 依据 |
|---|---|---|
| D-b | 双键资产**删光价格等重采**；知情接受 2021～2026 历史丢失；非双键资产不动 | Human 2026-11-17（明确否决无损合并方案） |
| D-e-data | 临时探测脚本 + 使用手册 + Markdown 分类报告；只探测不修改；报告供升级 TASK-076 判断 | Human 2026-11-17 |
| 顺序 | 073 代码 → 077 数据 → 078 采集口径 | 硬规则 #1 + ADR-003 单一规则；避免迁移被新写入撤销 |
| 写入开关 | 迁移默认 dry-run，`--force` 才写；探测永远只读 | 不可逆操作防护 |

## 7. Verification

| AC | 方法与期望（未运行） |
|---|---|
| AC1 | 迁移后 `assets` 44/44 符合 ADR-003 格式、唯一键无冲突；对照 `market` 派生逐条断言 |
| AC2 | 探测清单先只读产出；删价仅作用于清单内双键资产（负向对照：清单外资产价格条数前后不变）；删除条数与清单一致 |
| AC3 | `transactions` / `portfolio.targets[].symbol`（asset 级）与 `assets` 精确匹配；`asset_class` 级未被误改（负向对照） |
| AC4 | 迁移脚本连跑两次第二次输出"无需变更"（幂等）；备份标记文件存在才允许 `--force`（负向对照：无标记必须拒绝）；碰撞注入必须停下 |
| AC5 | `getLatestPrices` 对 active 资产命中（32 持仓缺价 17→0）、今日行情 44/44；`getStatus` 精确匹配保持；双键资产只断言键命中不断言历史深度 |
| AC6 | `npm test` / `test:server` / `test:worker` 全绿（入口 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)）；Reviewer 通过 |
| AC7 | 报告中 5 类均有一节（含空类别）；每类表格字段完整；基线信息含库名/日期/脚本版本；注入一条脏数据后探测必须报告它（负向对照） |
| AC8 | 按手册从干净环境跑通 `--help` → 探测 → 报告生成，无需口传；手册覆盖所有字段与误报排查 |

## 8. Risks

| # | 触发条件 | 影响 | 应对 |
|---|---|---|---|
| R-1 | 未备份或备份失败即执行 `--force` | 历史不可恢复 | 脚本校验备份标记；执行前人工确认 `sync:db` 成功 |
| R-2 | 双键清单错误/遗漏 | 误删非双键资产历史 | 探测只读清单人工确认；删除严格按清单 symbol 精确匹配 |
| R-3 | 073 派生函数未落地就迁移 | 复制规则/口径漂移（硬规则 #1 违规） | W0 前置门；脚本启动时断言模块存在 |
| R-4 | 归一后唯一键碰撞 | 覆盖他人资产 | 碰撞检测停下人工处理 |
| R-5 | 探测报告误报（如 asset_class 小写被当悬挂） | 升级判断失真 | 报告中说明判定口径；手册列误报排查；负向对照用例 |

## 9. Rollback

- 探测脚本无数据改动，无需回滚。
- 迁移前 `sync:db` 备份是**唯一还原点**；失败时按 `sync-db.cjs` 的 restore 流程恢复到备份库；回滚后需重新确认映射表与删除清单状态（已删价格由备份恢复，代价是双键污染回归，Human 知情）。
- 映射表与删除清单**不随回滚删除**（审计证据）；残留的新键数据按备份对照人工处理。

## 10. Implementer Handoff

- 输入：任务卡 AC1–AC8、本计划 §4、ADR-003（Accepted）、D-b/D-e-data 裁决、073 派生函数模块（W0）。
- 边界：**不改** `shared/` 业务规则（派生函数由 073 提供）、不改 `server/` 路由、不注册 cron、不触发采集；脚本落 `scripts/`，报告与手册随脚本交付。
- 前置：W0 满足 + Human 批准本计划 + 备份确认；三者缺一即停下上报。
- 产出：两个脚本、使用手册、首份探测报告、映射表、删除清单、迁移后验证记录（§11 由 Implementer 填）。
- 停止条件：073 模块缺失、备份标记缺失、碰撞、清单未人工确认、任何范围/AC/设计变化。

## 11. Implementation Record

尚未实施。

## 12. Review Record

尚未独立审查；Planner 自检不等于 Reviewer 判定。

## 13. Completion Record

尚未结案；无 Human 关闭或合入决定。

## 自检

- [x] Task 与批准依据对应（AC1–AC8、D-b、D-e-data 均来自任务卡）
- [x] 步骤可执行、前置明确（W0 派生函数 + 备份 + 清单确认）
- [x] AC 全部有验证方法与负向对照
- [x] 记录只存一处（本计划），相对链接按 `docs/development/tasks/active/` 深度修正

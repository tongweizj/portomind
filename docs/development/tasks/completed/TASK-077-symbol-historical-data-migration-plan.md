# TASK-077 — 历史数据 symbol 归一迁移 实施计划

## Status

Status：Completed（2026-11-18，Human 确认结案；见 §13）

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

### 2026-11-17 · Implementer 交接

- **W0。** 初始工作树干净。重新 fetch 的 `origin/main` 为 `fc1c728e8b9a3abee211b8cf2a09e5b0464d5855`（PR #58）。`65d6ad423faac2b60601c7d29a021fd8f21fdf27` 提供 `toStorageSymbol` 和 `STORAGE_SUFFIX`，模块为 [shared/utils/symbol.js](../../../../shared/utils/symbol.js)，CLI 通过 `@portomind/shared/utils/symbol` 加载。从该 main 创建 `feature/TASK-077-symbol-historical-data-migration`。
- **可审版本。** `f182d7e32ea51a2f3c96d36a074d4740f3fa11c0`。产物包括 [迁移 CLI](../../../../scripts/migrate-symbol-data.cjs)、[只读探测 CLI](../../../../scripts/probe-symbol-data-quality.cjs)、[MongoDB 隔离集成测试](../../../../scripts/symbol-data-migration.test.cjs)、[使用手册](../../../../scripts/PROBE-SYMBOL-DATA-QUALITY.md)、[分类报告](./TASK-077-data-quality-report.md) 和 [冻结清单预览](./TASK-077-migration-dry-run.json)。预览清单属于隔离库采样证据，正式操作时需从实际目标重新生成并由 Human 确认。
- **环境。** Windows，Node.js 24.20.0，MongoDB 原生驱动和 Database Tools，America/Toronto。用 sync:db 将 `portomind_dev` 的五个业务集合镜像到新库 `portomind_task077_probe_dev`；镜像核对了集合、索引、条数和 ID 哈希。隔离镜像实测 44 资产、80,579 价格、50 交易、4 组合、411 个 TaskRun。迁移写入和中断测试用独立的合成库与试还原库；真实行情验证另外使用仅含归一后资产资料的空行情库。
- **执行保障。** 正式执行以实际库名、集合 UUID、冻结清单的文件 SHA256、持久归档 SHA256 和可查询的试还原副本为闸门。首次写前核对四个集合的文档和索引指纹；原清单旁的同步落盘日志记录归一阶段和逐键删价进度。断点恢复按原备份文档 ID、内容及精确键核对。已经完成的原清单只回放审计输出。恢复依赖目标写入者持续停写和本地审计文件保全。

| AC | 实施证据与剩余条件 |
|---|---|
| AC1 | 镜像 44/44 可派生，33 项资产映射，归一后碰撞 0。合成库实际归一通过；注入缺 market 和目标键碰撞均阻断。44 条业务镜像记录尚未执行迁移。 |
| AC2 | 镜像找到 27 个双键资产，批准前候选合计 48,332 条。示例 `001180.cn` 对应精确键 `001180` 1,177 条与 `001180.CN` 662 条。合成库实际按两键删除 2 + 1 条，非双键和停用资产的历史逐文档保留。注入跨市场同裸码后探测报告歧义并阻断删除。 |
| AC3 | 镜像两条交易的旧键悬挂均可由 market 派生解决，合计 23 项交易映射；资产级组合目标需要改写 0 项，无法归属的引用 0 项。合成库验证资产级目标归一、`asset_class` 内容保留、真实孤立引用单独报告并保留。业务镜像的迁移后精确引用仍待核实。 |
| AC4 | 合成库探测和默认 dry-run 前后逐文档相同。缺标记、缺持久归档、试还原内容被篡改、错误目标均拒绝写入。用持久 mongodump 归档试还原并回读；在归一完成后及单键部分删价后分别强制退出，使用原清单恢复。续跑发现新增采集价格时拒绝继续；完成后重跑原清单和再次预览均无额外写入，重采记录保留。 |
| AC5 | 见下面分时点证据。实际 44 资产的迁移后持仓和正式目标日状态仍待验证。 |
| AC6 | 按 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md#7-验证与测试命令) 在迁移工具实施前运行全工作区测试，实施后运行 server 和 worker 回归，均通过；隔离 MongoDB 集成回归与新脚本语法检查通过。client build / lint 退出 0，存在 bundle 体积和既有 Fast Refresh 提示。server validate 因基线上缺少 `server/config` 报 ENOENT，统一 verify 的首步也依赖此入口。独立 Reviewer 结论待安排。 |
| AC7 | 真实隔离镜像探测五类全部成功。报告带日期、库名、SHA256、口径和各类字段。合成库覆盖悬挂交易、连续 NOT_FOUND、超时 RUNNING 和歧义；删除合成库的 taskruns 后，报告标明扫描失败并继续保留其他结果。 |
| AC8 | 验证两个 CLI 的帮助、配置连接、默认和自定义输出。手册覆盖镜像、读权限、字段、误报排查、升级决策和迁移续跑。文档检查器已识别生成报告的命名并保留链接校验；目录索引、文档检查和对应回归均通过。 |

**AC5 · 基线与采集。**

- 镜像迁移前，`getLatestPrices` 按 44 个 active 资产请求命中 38 个。未命中为 `000191`、`000942`、`ARKK`、`CQQQ`、`TLT`、`VCR`。四个组合的 positionTracker 返回 39 行持仓、32 个去重 symbol，去重后 21 个缺价。未命中为 `000191.CN`、`000942.CN`、`001180.CN`、`002982.CN`、`003358.CN`、`009051.CN`、`011309.CN`、`012348.CN`、`014424.CN`、`015532.CN`、`016630.CN`、`100038.CN`、`110003.CN`、`110020.CN`、`110026.CN`、`161017.CN`、`519915.CN`、`ARKK`、`CQQQ`、`TLT`、`VCR`。
- 镜像按 Today 页日窗和精确合并口径核对（2026-11-04 至 11-17），命中 15/44，未命中为报告中的 27 个双键资产的原小写键及 `VBG.TO`、`VBU.TO`。11-17 同日库内价格行 0。按 11-13 运行时点读取 `getStatus`，目标日 11-12 命中 42/44，缺 `VBG.TO`、`VBU.TO`。合成迁移后的真实 MongoDB 验证确认，标准保存入口写出的目标键可以命中；同日仍留裸码的 `SINGLE.US` 继续缺价。
- 11-17 用 TASK-073 的标准 dailySync 在新建的空行情库实际采集 44 个归一资产，成功 42、跳过 0。Yahoo 对 `VBG.TO`、`VBU.TO` 返回 NOT_FOUND；`VCR.US` 和 `001180.CN` 实采成功。批量最近价、Today 的 14 日窗口及 11-17 同日精确键均命中 42/44。该空行情库在当时的 `getStatus` 目标日为 11-16，目标日数据 0/44。本次采集写的是 11-17，按目标日语义不能计入 11-16。采集库没有业务流水；本次没有在实际业务数据上执行迁移后的持仓验收。

**交 Orchestrator。** 六个仅旧键的 active 资产共有 10,815 条价格会保留，归一后这些历史无法按新键精确命中。涉及 `000191`、`000942`、`VCR`、`TLT`、`CQQQ`、`ARKK`，逐键计数和范围见报告。请确认该影响的验收口径并安排独立 Reviewer。执行及关闭 AC5 前，需要 Human 针对实际目标库、可恢复归档、试还原结果和精确删除清单确认，完成迁移，再以实采结果复核今日行情、归一后持仓和 `getStatus` 对应目标日。若 Yahoo 两个标的持续缺失，需取得上游可用结果或由 Human 明确验收口径。双键资产验收范围为键命中。任务状态和审查结论由对应角色登记。

**AC5 · 本轮复测口径。** Human 指示暂缓处理 `VBG.TO` 和 `VBU.TO`。只读核对确认两个标的都在镜像的 32 个去重持仓标的内。本轮复测其余 42 个 active 行情标的及其余 30 个去重持仓标的，报告同时保留全量分母、两个暂缓项及其实际取价情况。`getStatus` 保留应用原始目标日及计数，另外核对其余应采标的的精确键命中。

### 2026-11-17 · Human 确认后的隔离库执行

- **目标与恢复点。** Human 在 TASK-077 对话中确认在 `portomind_task077_probe_dev` 执行原冻结清单。此库独立于 server 和 worker 配置的 `portomind_dev`。执行前重新生成 dry-run，与原清单逐字节一致，清单 SHA256 为 `d56df1f4d607001d73b7839bf6047bf9be7ec43eaeecb1d7b26d42df8d0a4549`。持久归档 `before.archive` 的 SHA256 为 `2301134a20c51faefd254df588c3829326d0fb43b467881fce24dd2bcb639bb0`；从该文件还原至 `portomind_task077_restore_20261117_test`，五个集合的逐文档和索引读回均一致。恢复包与标记、原清单、执行日志、`migration-audit.json`、`post-collection-ac5.json` 保留在执行主机的 `%LOCALAPPDATA%/PortoMind-TASK-077-recovery-20261117`。
- **AC1–AC4 实库结果。** 使用 `f182d7e` 的 CLI 执行，Windows / Node.js 24.20.0。44 个资产均为 market 派生的唯一规范键。50 条交易和 4 个组合的 asset 级引用通过精确核对；草案中的 33 资产、23 交易映射已执行，组合无需改写。按原确认清单对 27 个双键资产的 54 个精确键删除 48,332 条，价格从 80,579 到 32,247 条，非清单价格逐文档核对一致。采集写入后使用同一批准标记重跑，返回无需变更；32,289 条价格的前后 SHA256 一致。
- **AC5 实库结果。** 11-17 23:26 ET 使用标准 dailySync 实际采集，44 个请求中 42 个成功、0 跳过。仅 `VBG.TO`、`VBU.TO` 仍由 Yahoo 返回 NOT_FOUND。按 Today 的 14 日窗口及同日价格精确关联，两种口径均为全量 42/44、本轮 42/42。`getLatestPrices` 读取含历史在内的最近价命中 44/44，两只暂缓标的命中既有历史。持仓 39 行、32 个去重标的均有最近价，本轮 30 个也全部有价；与同库迁移前的去重口径相比，缺价 21→0。
- **AC5 目标日验证。** 采集后即时 `getStatus` 仍指向 11-16，计数 0/44。以 11-18 15:00 ET 作为 `now` 参数只读调用同一服务，让目标日切到实际采集的 11-17，结果 42/44，本轮 42/42，缺失仅为两只暂缓标的。该读回使用已入库的当天真实价格；时间参数只用于走到对应目标日。裸码负向对照由前述隔离集成测试覆盖。
- **交接。** 迁移后全工作区测试通过。AC5 本轮范围的运行证据齐备；两只暂缓标的仍无本次行情，保留为上游缺失。既有 server validate 缺目录问题和独立 Reviewer 流程见前述记录。

### 2026-11-17 · R1 返工记录

- 修复版本 `f452a25e51922a7eb80cb9a11a40eb42efa74704`。迁移归一、目标重复键检查和只读悬挂探测统一采用 Portfolio schema 的 `level` 缺省值。缺省目标归一保留字段缺省形态，`asset_class` 原样保留。
- 合成隔离库回归通过，覆盖显式 asset、缺省 level、asset_class、缺省与显式目标归一后相撞、迁移前后探测及原清单中断续跑。Server 与 Worker 全量测试和文档检查通过。已将任务卡 §8 和独立任务索引中的旧实施描述替换为实施和审查链接。
- 修订版探测实际试还原库和迁移镜像，分别报告 3 和 35 个悬挂组合目标；交易悬挂分别为 2 和 0。保留首轮报告及其版本证据。已迁移镜像的单独修正清单为 `R1-portfolio-targets-preview.json`（本机恢复目录），SHA256 `18b6bdc8b1146568229830db70ea066bb7fb8e73b7589dedb30d1c06074ef979`。清单只含 `portomind_task077_probe_dev` 的 4 个组合、35 个目标 symbol，无歧义或重复。全量重探测另有 6 个价格候选，因此组合修正单独执行。
- R1 修正前的归档 `R1-before.archive` 已试还原到 `portomind_task077_r1_restore_20261117_test`，五个集合逐文档和索引校验一致，归档 SHA256 为 `8a6ecef64ec2aaa05a68fa38e82b4652c6b820d644c9de4c39fb2b6d3788c63e`。目标库组合修正待 Human 确认该清单。R2 等待 Human 确认两只行情暂缓项是否作为本次正式验收例外。

## 12. Review Record

### 2026-11-17 独立审查

**判定：Fail。** 审查对象为 `feature/TASK-077-symbol-historical-data-migration` @ `a2084ba`，迁移实现 `f182d7e`，基线 `fc1c728`。审查开始时工作区干净。W0 已满足，计划中有 Human 批准及隔离库执行的记录。Reviewer 未参与实现、业务测试或交付验证脚本编写。

| AC | 结果 | 证据 |
|---|---|---|
| AC1 | 满足 | 只读查询实际迁移镜像，44/44 资产键符合其 market 派生，审计记录的唯一索引指纹保持一致。 |
| AC2 | 满足 | 独立核对冻结清单、执行日志及审计记录：27 个资产、54 个精确键、逐键条数一致，合计删除 48,332 条；实施记录验证清单外价格逐文档一致。 |
| AC3 | 不满足 | 50 条交易无悬挂。实际 4 个组合的 53 个目标均缺省 `level`，应用按资产级解释；迁移后 35 个目标的原键无法精确匹配资产，见 R1。 |
| AC4 | 满足（已批准的隔离库基线） | 清单与持久归档 SHA256 对上批准标记，结束事件指纹与审计输出一致。复用 §11 的试还原、注入漂移、中断续跑和采集后重跑证据。 |
| AC5 | 原门槛未满足 | 镜像最近价 44/44，32 个去重持仓全部有价；今日行情为 42/44，暂缓项为 `VBG.TO` 和 `VBU.TO`。成功采集当日的看板目标日验证为 42/44，当时应用实际使用前一目标日。复测 42/42 与原 AC 的判定边界见 R2。 |
| AC6 | 不满足 | 复用同版本的迁移前后日志，服务端与 Worker 全量测试均零失败。独立审查未通过。 |
| AC7 | 不满足 | 分类报告五类齐全，脚本和共用模块的哈希均吻合，但缺省 level 的悬挂目标不进入报告，见 R1。 |
| AC8 | 满足 | 实跑两个 CLI 的帮助，检查手册中的连接、只读范围、字段、输出及误报排查说明。探测和报告生成运行证据引用 §11。 |

| 编号 | 严重度 | 现象、证据和处置 |
|---|---|---|
| R1 | BLOCKER | [迁移目标判断](../../../../scripts/migrate-symbol-data.cjs#L120) 与 [悬挂探测](../../../../scripts/probe-symbol-data-quality.cjs#L114) 只认显式 `level: 'asset'`，[Portfolio 模型](../../../../shared/models/portfolio.js#L70) 将缺省值解释为 `asset`。独立用同一旧键夹具执行两段实际逻辑：显式资产目标会归一，缺省目标原样保留且探测不报告，`asset_class` 保留。只读对照试还原库和迁移镜像，均为 53 个缺省 level 目标，悬挂由 3 增到 35。归一、归一后的重复键检查和只读探测应采用同一缺省语义，并补三个分支的回归。已迁移镜像的组合引用修正须另据实际数据预览与确认。 |
| R2 | BLOCKER（AC5 验收） | [任务卡 §3](./TASK-077-symbol-historical-data-migration.md#3-acceptance-criteria) 仍写今日行情 44/44。本机验收 JSON 显示 42/44；§11 只记录 Human 暂缓两项和缩小本轮复测分母，仓库暂无以 42/42 替代正式验收门槛的记录。保留全量实测结果，由 Human 明确是否接受暂缓项作为正式验收例外。 |
| R3 | MINOR | 审查开始时看板和[独立任务索引](../readme.md) 均记计划未批准、D-b 待裁决，任务卡 §8 仍称未实施。看板已登记本轮结论；剩余说明由对应角色按批准和实际隔离执行证据同步。 |

独立实跑只读 MongoDB 对照（试还原库、迁移镜像）、内存探针、清单及归档哈希比对、逐键审计对账、两项 CLI 帮助和文档检查。一次性探针通过 stdin 执行。复用实施者的迁移前后全量测试与实采记录。本轮未执行写迁移、恢复或行情采集。验收证据限于获批隔离库。交 Orchestrator 跟进 R1，R2 的正式验收口径由 Human 决定。

### 2026-11-17 返工复审

**判定：Fail，尚不能结案。** 复审版本为 `591656b`，返工实现为 `f452a25`，对照 `a2084ba`。复审开始时工作区的三处改动可确定为首轮审查记录。Reviewer 未参与返工实现、业务测试或实施验收脚本。

| AC | 结果 | 依据 |
|---|---|---|
| AC1、AC2、AC4 | 满足（原获批隔离执行） | 沿用首轮对实际数据、冻结清单和备份审计的证据；本轮未再次执行原迁移。 |
| AC3 | 实现修复已验证，实际镜像仍未满足 | 本轮实跑只读预览核对 4 个组合、35 个目标映射；镜像现存仍有 35 个悬挂。内存应用预览后为 0，未发生重复，也未补写 level。待批准执行并回读实际镜像。 |
| AC5 | 原门槛仍未满足 | 原实采为 42/44，最近价 44/44，持仓 32/32。仍未见将两只暂缓项列为正式验收例外的 Human 记录。 |
| AC6 | 全量回归通过，独立复审未通过 | 复用返工版服务端和 Worker 的零失败日志。本轮只补验受影响路径。 |
| AC7、AC8 | 满足 | 以修订版探测 CLI 对同一镜像实跑，五类均成功，报告列出 35 个悬挂目标、0 个悬挂交易。手册已补足缺省口径；保留原报告作历史证据。 |

- **R1（BLOCKER）**：归一、重复检测和探测均共享 Portfolio 的默认值，历史目标修正只更新 symbol。独立核实新归档和组合修正预览的 SHA256，预览的 35 条映射与实时 dry-run 的组合映射完全一致。组合修正预览记录零价格写入。普通全量 dry-run 同时列出 6 个价格删除候选，当前修正待 Human 确认的对象是组合专用预览。实施记录仍未见写入批准；本轮只读并在内存演算，镜像仍待修正和读回。
- **R2（BLOCKER）**：沿用既有 AC5 结果。待 Human 明确暂缓的 `VBG.TO`、`VBU.TO` 是否为正式验收例外，或提供达到原 44/44 门槛的证据。
- **R3（MINOR）**：独立任务索引、任务卡 §8 和看板已更新；任务卡 §2 仍称 D-b 待裁决，应与 §6 裁决记录同步。

独立实跑范围为 MongoDB 只读预览、镜像与试还原库的组合文档比对、内存应用预览、更新后的探测 CLI、归档及预览哈希、文档检查。未执行修正写入、恢复、行情采集或重跑全量测试。完成条件为经批准修正 35 个引用并只读回验，加上 AC5 验收口径收敛。

### AC3 · 修正授权与执行前核查

Human 在本会话批准执行 AC3 的组合专用修正清单，范围为 `portomind_task077_probe_dev` 的 4 个组合、35 个目标 symbol。Reviewer 核对清单与归档 SHA256、目标集合 UUID、目标及试还原库四个集合的文档和索引指纹，均与清单基线一致。执行前发现本地开发 API 正在 8080 端口运行，且配置已指向该镜像。写入等待停写条件落实。

### 2026-11-18 · AC5 验收裁决

Human 在本会话明确：Yahoo 无 `VBG.TO` 和 `VBU.TO` 本次行情，两只标的从 TASK-077 的 AC5 验收分母排除。此裁决取代前述 R2 的待确认项。

**AC5 满足，R2 关闭。** 复核 §11 同一获批隔离镜像的实采验收文件。排除两只后，今日行情与同日键命中均为 42/42，`getLatestPrices` 为 42/42，纳入验收的去重持仓为 30/30。对实采对应的 11-17 目标日，`getStatus` 为 42/42。原始结果继续保留完整分母，今日行情和目标日看板为 42/44，最近价和持仓含历史结果分别为 44/44、32/32。两只标的在采集日志中均为 Yahoo `NOT_FOUND`。本轮复用实采证据。

**TASK-077 仍未结案。** AC3 的 35 条修正已获准，开发 API 仍在使用目标镜像，写入及回读等待停写条件落实。AC6 仍待独立复审收敛。

### 2026-11-18 · AC3 执行及验收

按本会话的 Human 授权执行冻结清单，目标为 `portomind_task077_probe_dev`。写入前确认本地开发 API 进程已退出、8080 无监听、Worker 配置指向其他数据库，随后重新核对清单与恢复归档 SHA256、目标集合 UUID、目标及试还原库的四集合内容与索引指纹。一次性执行仅写 `portfolios.targets[].symbol`，每个组合均以原文档作为写入条件。共更新 4 个组合的 35 个目标。

执行后实际回读：53 个目标全部精确匹配资产，悬挂目标 **35 → 0**，50 条交易均可匹配资产。53 个目标仍省略 level；完整组合文档与只替换清单内 symbol 的预期逐文档一致，目标比例与其余字段保留原值。资产、交易、32,289 条价格内容及索引的指纹均和执行前一致。随后另走只读探测入口，五类扫描均成功，「悬挂 symbol 引用」为「（无）」。证据存放在已有私有恢复目录，文件为 `R1-portfolio-targets-execution.jsonl` 与 `R1-probe-after-repair.md`。

**更新后的 TASK-077 审查结论：Pass with issues。** R1 关闭，AC3 和 AC7 满足。R2 已按 Human 裁决关闭，AC5 满足；服务端和 Worker 全量回归沿用返工版本的通过证据，独立代码审查和获批镜像执行证据齐备，AC6 满足。AC1、AC2、AC4、AC8 延用前述证据。剩余 R3 为任务卡旧说明的 MINOR。Reviewer 完成独立代码审查后受 Human 授权执行了隔离镜像写入，并用独立只读入口复核数据结果。TASK-077 状态由有权角色登记，关闭由 Human 决定。

## 13. Completion Record

2026-11-18，Human 在本会话确认 TASK-077 结案。任务卡和执行计划登记为 `Completed`，与隔离库探测报告和冻结迁移清单一同归档。

- **结案依据**：§11 的隔离镜像迁移与恢复证据，以及 §12 的独立审查、AC3 执行后回读和 AC5 Human 验收裁决。AC1–AC8 满足；独立审查为 `Pass with issues`。R3 遗留的 D-b 旧说明已在任务卡 §2 同步至 §6 的裁决。
- **交付与证据**：[工具手册](../../../../scripts/PROBE-SYMBOL-DATA-QUALITY.md)、[迁移前探测报告](./TASK-077-data-quality-report.md)、[冻结迁移清单](./TASK-077-migration-dry-run.json)。备份、试还原与写入日志的私有恢复目录及文件名见 §11 和 §12。实库验收范围为获批隔离镜像。

## 自检

- [x] Task 与批准依据对应（AC1–AC8、D-b、D-e-data 均来自任务卡）
- [x] 步骤可执行、前置明确（W0 派生函数 + 备份 + 清单确认）
- [x] AC 全部有验证方法与负向对照
- [x] 记录只存一处（本计划），相对链接按 `docs/development/tasks/active/` 深度修正

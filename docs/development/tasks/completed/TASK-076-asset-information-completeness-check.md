# TASK-076 — 资产信息完整性检查（launchDate 抓取 / 前台可编辑 / 手动检查 / 看板卡片与详情）

> **Status：Completed**（2026-11-20，原任务卡已登记完成，本次核对证据后归档）。见[结案记录](./TASK-076-asset-information-completeness-check-plan.md#13-completion-record)。

## Metadata

| 字段 | 内容 |
|---|---|
| Status | **Completed** |
| 所属 Story | 无（独立维护任务；与已结案 US-001 的任务运行看板有接口依赖，见 §7） |
| 覆盖的验收条件 | 本卡 §3 AC（来源：Human 2026-11-17 指令 + [PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) P0-2 / D-c） |
| Priority | High（建议；用户可见数据质量 + 监控闸门，待 Human 确认） |
| Owner | 待指派 |
| Created | 2026-11-17 |
| Type | Feature（跨 shared / cron-worker / server / client + 新 API 字段） |
| 来源 | Human 本轮明确指令：①launchDate 网页抓取 + 前台可看可改；②新增资产信息完整性检查（**看板按钮手动触发** + 看板卡片 + 详情页 + 编辑按钮）；③按钮落在「资产信息完整度」卡片**下方位置**；④新增检查策略「最近 3 个市场日价格全为空 → 不完整并报告」（市场日口径见续 6 / D-o） |
| Execution Plan | 已创建（2026-11-17，Planner 起草，Status `Approved` **已批准**）：[TASK-076 执行计划](./TASK-076-asset-information-completeness-check-plan.md)。跨模块/复杂依赖按 [EXECUTION_PLANS §2](../../../os/process/EXECUTION_PLANS.md) 必写；计划 §6 列待 Human 裁决事项，批准前不得实施 |

## 1. 问题

[PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) P0-2 实测：**44/44 资产 `launchDate` 全为空**，导致 `integrityCheck` 全部 `SKIPPED_NO_LAUNCH_DATE`、检查完全空转（`checkedCount=0` 却记 `SUCCEEDED`）。当前系统：

- 没人知道哪些资产信息不完整，`launchDate` 既不能自动获取，也没有界面查看/修正；
- 价格完整性检查因此永远抓不到 P0-1 类缺价问题——**监控失效比数据缺失更危险**。

Human 2026-11-17 决定：把 launchDate 相关工作从 [TASK-073](./TASK-073-price-pipeline-p0-data-correctness.md) 拆出，独立成本卡，并扩展为"资产信息完整性检查"体系（**手动触发**检查 + 看板卡片 + 详情页 + 编辑入口）。**同日修订**：原"每日自动运行"因日志过多被取消，改为日志频道看板按钮手动触发（见 AC3 / D-m）。

## 2. 已核实的事实

| 事实 | 落点 |
|---|---|
| `launchDate` 字段存在于 Asset 模型但全库为空 | `shared/models/asset.js:39`；审阅实测 |
| 客户端**没有任何** launchDate 的展示或编辑入口（仅 `taskDataViews.js:194` 把"跳过（无 launchDate）"作为统计文案） | `client/src/pages/Asset/*`、`client/src/components/CronStatus/taskDataViews.js` |
| 抓取侧无 launchDate 逻辑（`priceFetch`/三 Fetcher 只取价） | `shared/services/priceFetch.service.js` |
| 任务运行看板 `BOARD_SLOTS` **恰好 5 个固定槽位**；TASK-053 AC3/AC4 已验收"恰好 5 灯/5 卡" | `client/src/components/CronStatus/unknownValue.js:24`、`TASK-053 §3` |
| NG6 硬约束：`/logs` 子树**只读排障、永不放执行动作**，失败态只提供"查看原始日志 / 去组合域处理"两条出口 | [FS P0](../../requirements/specs/FS-cron-worker-status-board.md) §NG6 |
| `C-07`（rebalance 详情页）未立项；本卡详情页是**资产信息**详情，不是 C-07 | [PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) |

证据边界：本轮只读源码，未连库、未跑应用。

## 3. Acceptance Criteria

| # | 验收标准 | 来源 |
|---|---|---|
| AC1 | **抓取 launchDate**：检查脚本运行时对每个 active 资产从**天天基金（CN-FUND）/ 雅虎财经（US/CA/HK）网页**抓取成立日/上市日并写入 `assets.launchDate`（D-i 裁决；不再每日自动跑，改由看板按钮手动触发——见 AC3）；外部调用须按硬规则 #7 包 `withMarketDataTimeout` + `fetchWithRetry`；抓取失败 → 明确记录原因（未知/缺失），**不猜、不填假日期**（不变量 2）；人工可编辑兜底见 AC2；抓取来源与覆盖率写入实现记录 | Human ① / D-i / 本轮修订 |
| AC2 | **前台可看可改**：资产详情/列表显示 launchDate（含"未知"态），提供编辑入口，保存走既有鉴权与字段校验；修改后完整性检查结果随之更新；既有资产表单零回归 | Human ① |
| AC3 | **手动触发的资产信息完整性检查**（Human 本轮修订：**取消每日自动运行**）：日志频道看板新增「运行资产信息检查」按钮（D-m，须 NG6 修订留痕），**该按钮必须放在「资产信息完整度」卡片上的下方位置**（Human 2026-11-17 续 5 修订；不放在看板通用操作区或其它卡片），点击后运行检查；按 §3.1 字段标准检查**所有资产的指定字段**，含 D-l 的 5 个元数据字段（`symbol`/`name`/`market`/`currency`/`launchDate`）**与**续 5 新增的价格策略（最近 3 个**市场日**价格全为空 → 不完整并报告，市场日口径见续 6 / D-o，判定标准见 §3.1「价格连续性」行）；输出"完整/不完整"计数 + 逐资产缺失理由；检查本身**只读**（不自动改任何字段）；`launchDate` 抓取写入按 AC1 单独授权；**不注册 cron 每日自动任务** | Human 本轮 / D-l 修订 / D-m / 续 5 修订 |
| AC4 | **看板卡片**：任务运行看板新增一张卡片显示"资产信息完整度"（完整数/总数、launchDate 缺失数、**最近 3 个市场日价格全为空的资产数**），消费统一 API 快照；**「运行资产信息检查」按钮置于该卡片下方**（见 AC3）；**实施前须由 PM/Human 明确修订 TASK-053 AC3/AC4（5→6）或批准等价扩展方式**——本卡不擅自改已验收 AC | Human ②② / 续 5 修订 |
| AC5 | **详情页**：从该卡片可进入详情页，列表显示所有信息不完整的资产、缺失字段与判定理由，每行有编辑按钮；编辑动作落在**组合域**（不在 `/logs` 子树内写），卡片本身只读；路由形态在 Plan Review 冻结（推荐路径见 §6 D-k） | Human ②② |
| AC6 | 回归与验证：既有看板五卡顺序/结构在 AC 修订后重新冻结且不回归；新任务/新 API/新页面测试通过；`test:server`/`test:worker` 全量全绿（入口 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)）；独立 Reviewer 通过 | — |

### 3.1 字段检查标准与自动修正策略（Human 本轮要求：写清判定标准 + 哪些要自动改）

> **检查范围（D-l 最终修订 + 续 5 新增）：本次检查含两类判定——① 元数据 5 字段：`symbol` / `name` / `market` / `currency` / `launchDate`；② 价格连续性：资产最近 3 个**市场日**价格全为空（续 5 新增、续 6 明确市场日口径，见下表「价格连续性」行）。除此之外其它资产字段（`type`/`assetClass`/`tags`/`active`/`watchlist`/`createdAt`）一律不管**（不计入完整度、不出缺失理由、不在详情页列出）。
> symbol 后缀口径以 [ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md) 为准。**总原则：5 个元数据字段中仅 `launchDate` 允许自动写入（D-i），其它 4 个一律人工修正**（避免误改关联键/枚举造成更大破坏）；价格连续性判定**只读**，不自动写价。

| 字段 | 完整判定标准 | 缺失/异常判定 | 自动修正 |
|---|---|---|---|
| `symbol` | 符合 `^[A-Z0-9][A-Z0-9._-]*$`、`trim` + 大写、长度 1–32，**且匹配 ADR-003 `STORAGE_SUFFIX` 按 `market` 派生的存储格式**（如 `001180.CN` / `VOO.US` / `600519.SS`） | 空/非法字符/大小写或空格违规/后缀与 market 派生不符（如 `001180.cn`、裸码） | ❌ **不自动改**（用户点名）——symbol 是 `transactions`/`prices`/`targets` 的跨表关联键，自动改会断链；归 [TASK-073](./TASK-073-price-pipeline-p0-data-correctness.md) 统一迁移；详情页只提示"去处理" |
| `name` | 非空、`trim` 后 ≤120 字符 | 空/纯空格/超长 | ❌ 人工 |
| `market` | 必填、且 ∈ `ASSET_MARKETS` 枚举 | 空/非法枚举值 | ❌ 人工（且与 symbol 后缀派生强相关，必须人确认） |
| `currency` | 必填、且 ∈ `ASSET_CURRENCIES`；且与 `market` 的预期币种一致（如 CN-FUND→CNY、US→USD、CA→CAD、HK→HKD，映射表在 ExecPlan 冻结） | 空/非法枚举/与 market 不一致 | ❌ 人工（币种错会导致估值分桶错） |
| `launchDate` | 合法 `Date`、非未来日期（对基金应早于今天） | 空（当前 44/44 全空）/非法日期/未来日期 | ✅ **元数据中唯一自动写入**：D-i 天天基金/雅虎网页抓取；失败标"未知/待人工"；也可人工编辑 |
| **价格连续性**（续 5 新增，非资产字段而是价格序列判定） | 资产在**最近 3 个市场日每天都有非空价格**。「市场日」= 该资产所属 `market` 的开市日，按**目标市场日口径**判定（与既有价格同步/价格完整性检查同一口径），**不是自然日、不按自然日回溯 3 天**；具体交易日日历来源在 ExecPlan 冻结 | **最近 3 个市场日价格全为空**（逐市场日取值均为 `null`/缺失）→ 判为信息不完整并在报告中单列理由 "最近 3 个市场日价格全为空" | ❌ 只读判定，不自动写价；仅报告，由人去组合域/价格侧处理 |

> 检查脚本只读、只输出上述判定与理由，不执行任何修改（launchDate 抓取写入是独立授权路径，见 AC1）。完整度 = **元数据 5 字段均合格且价格连续性合格**的资产数 / 总资产数；任一轴不达标即计入"不完整"，并给出对应缺失理由。
>
> **边界提示（Planner 记录，非新裁决）**：价格连续性判定与既有「价格完整性」任务（`BOARD_SLOTS` 第 2 槽 `integrity-check`）是**两件正交的事**，不是同一问题的两种报法，无需互相去重：
> - **价格完整性**（`integrity-check`）：回答"**历史价格是否采集完成**"——从 `launchDate` 到今天整段历史缺价则**自动补全历史采集**（`integrityCheck` 的 `INTEGRITY_AUTO_REPAIR` 调 `historySync` 回补）；属 [TASK-073](./TASK-073-price-pipeline-p0-data-correctness.md) AC5/AC6 的语义范围。
> - **价格连续性**（本卡新增）：回答"**最近几次采集是否正常**"——最近 3 个市场日全空则判为信息不完整，**只读报告、人工去处理**，不自动写价。
>
> 二者时间窗（整段历史 vs 最近 3 市场日）与处置动作（自动补历史 vs 人工处理）均不同，应各自独立存在；报告里**分列表述、不混报即可**。二者**共享「目标市场日」口径**（续 6 已裁决，无需再定）。ExecPlan 仍须冻结：价格连续性的交易日日历数据源、完整度分母/分子的具体算法——但**不再有"是否互相去重/重复计数"这一待决项**。

## 4. Scope

**In Scope**

- `shared/`：launchDate 抓取器/服务（单一业务实现）+ 资产信息完整性检查服务与枚举（**只读判定**，字段标准见 §3.1）
- `cron-worker/` / `server/`：检查脚本的**手动触发入口**（看板按钮 → API 端点 → 执行 `shared/` 检查逻辑）；**不注册每日自动 cron**（本轮修订）；不重复实现业务规则
- `server/`：只读 API 字段（资产完整度汇总 + 不完整清单 + 缺失理由）；launchDate 编辑走既有资产更新端点或新增专用端点（由 Plan 定）
- `client/`：资产页 launchDate 展示/编辑；看板新卡（只读）；新详情页（只读列表 + 跳转编辑）
- `docs/`：API_CONTRACT / DATA_MODEL / FS 与 TASK-053 AC 修订（由有权限负责人）

**Out of Scope**

- 价格双轨序列迁移、采集日期错位、归桶时区（[TASK-073](./TASK-073-price-pipeline-p0-data-correctness.md) 剩余范围）
- P1/P2 观测健壮性（[TASK-074](./TASK-074-price-pipeline-observability-and-robustness.md)、[TASK-075](./TASK-075-today-symbol-case-mismatch.md)）
- C-07 再平衡详情页；任务运行看板的其它扩容；定时/cron 自动运行（本卡不注册任何每日自动任务）
- 自动修改资产其它字段（除 AC1 launchDate 抓取写入外）

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | 6 卡破坏 TASK-053 已验收的"恰好 5 灯/5 卡"断言 | AC4 前置：PM/Human 明确修订 053 AC 后重新冻结基线；实施含 053 回归脚本复验 |
| R-2 | 详情页编辑按钮违反 `/logs` 只读 NG6 | AC5 推荐"卡片只读 + 去组合域编辑"；若坚持在 `/logs` 内编辑须 Human 明确修订 NG6 |
| R-3 | 自动抓取来源不可靠（各市场/Provider 支持不一），写入错误成立日反而污染完整性检查 | D-i 裁决来源；无来源=未知不猜；抓取结果带来源标注 |
| R-4 | 看板「运行检查」按钮违反 NG6（手动触发任务禁入 `/logs`） | **D-m 已由 Human 授权**并需按 NG6 修订附录留痕；脚本只读、按钮仅触发检查；与"编辑按钮在资产域"（D-k）的边界在 UI 上明确区分 |
| R-5 | 修改 launchDate 使完整性检查历史结果不可比 | 编辑留痕（可选）+ 文档说明；不回填/篡改历史 TaskRun |

## 6. Human 裁决记录（2026-11-17）

| # | 决定 | 内容 |
|---|---|---|
| **D-i** | ✅ **已裁决** | 抓取来源 = **天天基金（CN-FUND）/ 雅虎财经（US/CA/HK）网页**的上市日期/成立日参数；**人工可编辑**作为兜底与纠错（AC2）。执行层待办：在 ExecPlan 中核实各站实际端点/字段并冻结（本卡不虚构 API 细节） |
| **D-k** | ✅ **已裁决 = 推荐 A** | 详情页在**资产域**（如 `/assets?incomplete=1` 或独立路由）；看板卡片**只读** + "去处理"跳转编辑；不在 `/logs` 子树内放编辑按钮（遵守 NG6 硬约束） |
| **D-l** | ✅ **已裁决 → 本轮修订（元数据范围；续 5 由 D-o 有界扩展）** | 原「每一个字段都必须完整」**修订为：元数据只检查 5 个字段——`symbol`/`name`/`market`/`currency`/`launchDate`；其它字段一律不管**（不计完整度、不出理由、不进详情页）。逐字段判定标准见 §3.1；仅 `launchDate` 自动写入，其余 4 项人工修正。**续 5 D-o 在此之外新增一条价格连续性判定，不属元数据字段，见下行** |
| **D-j** | ✅ **已裁决 = A** | 看板扩为 **6 灯/6 卡**，新增"资产信息完整度"卡；TASK-053 AC3/AC4 的"恰好 5"由 [TASK-053 卡片末「AC 修订附录」](../../delivery/completed/US-001/TASK-053.md) 以日期附录修订（Human 2026-11-17 授权），原 AC 正文与其验收证据保留不动。实施时须按 6 槽位冻结并重跑 053 结构回归 |
| **D-m** | ✅ **已裁决（本轮新增）** | **取消每日自动运行**（日志太多）；改为日志频道看板增加「运行资产信息检查」按钮，点击后手动运行检查脚本。**冲突提示**：[FS P0 NG6](../../requirements/specs/FS-cron-worker-status-board.md) 明文禁止 `/logs` 下"手动触发任务"，本裁决等于对该硬约束的**定向修订**（仅允许这一个只读检查入口，不放其它执行动作）；实施前须由 PM/Human 以日期附录方式修订 NG6 并留痕，否则该按钮不得上线 |
| **D-n** | ✅ **已裁决（续 5 新增）** | 「运行资产信息检查」按钮的位置**固定在「资产信息完整度」卡片上的下方位置**（AC3 / AC4），不放看板通用操作区或其它卡片。属 UI 落位细化，不改 D-m 的 NG6 授权边界（按钮仍只读触发） |
| **D-o** | ✅ **已裁决（续 5 新增、续 6 澄清口径；对 D-l 范围的有界扩展）** | 完整性检查**新增一条价格策略**：资产**最近 3 个市场日价格全为空 → 判为不完整并在报告中单列理由**「最近 3 个市场日价格全为空」（§3.1「价格连续性」行）。**「最近 3 天」（续 5 原话）经续 6 明确 = 最近 3 个市场日（按 `market` 的目标市场日口径），非自然日**（Human 续 6 裁决）。这是对 D-l「只检查 5 个元数据字段」的**有界扩展**：仅新增这一条价格序列判定，**不放开其它资产字段、不自动写价**；与「价格完整性」任务的去重/报告归属及交易日日历来源在 ExecPlan 冻结 |

## 7. Coordination Notes

- 与 [TASK-073](./TASK-073-price-pipeline-p0-data-correctness.md)：本卡已承接其 P0-2 的 launchDate 回填与 D-c；073 保留价格侧修复与"全跳过语义"（D-d）。两卡分别验收，不许互相顶替。
- **D-j 背景（2026-11-17 回复 Human 疑问）**：任务运行看板（`/logs` 的看板 tab）现状**恰好 5 张卡**——价格同步 / 价格完整性 / 提醒评估 / 汇率同步 / 再平衡建议。出处：①已验收 [TASK-053 §3 AC3/AC4](../../delivery/completed/US-001/TASK-053.md)（原文"恰好 **5 个健康灯位**"、"**5 任务卡片网格**"，第 83–84 行）；②代码 [`BOARD_SLOTS`](../../../../client/src/components/CronStatus/unknownValue.js)（五个固定键，第 24–30 行）。Human 要求新增的"资产信息完整度"卡是**第 6 张**，因此必须选 D-j 的落地方式（修订已验收 AC / 替换某卡 / 看板外展示），本卡不擅自改 US-001 已验收 AC。
- 与已结案 US-001 看板：D-j=A 已由 Human 授权修订 AC3/AC4（5→6），修订以 [TASK-053 末「AC 修订附录」](../../delivery/completed/US-001/TASK-053.md) 留痕，原 AC 正文不动；实施以 6 槽位为准。
- 硬规则：抓取/检查属业务规则，**只在 `shared/`**；调度只在 `cron-worker/`（ADR-002）；客户端不 `require` shared、不算业务阈值（AGENTS §5）。
- NG6 是本卡详情页设计的硬边界（D-k 已按推荐 A 遵守）；**D-m 是 Human 对 NG6 的定向修订**（只允许看板「运行资产信息检查」这一个只读入口），须先以日期附录留痕，不得扩大为其它执行动作。

## 8. 本卡未做的事

未实施、ExecPlan **已创建但为 `Draft`（未批准，见计划 §6 待 Human 裁决 D1–D6）**、**D-i/D-j/D-k/D-l/D-m/D-n/D-o 全部裁决完毕**（见 §6，D-o 市场日口径续 6 已裁决）；053 AC 修订仅以附录登记（原 AC 正文不动）；**NG6 定向修订（D-m）待 PM/Human 日期附录留痕**；价格连续性与既有「价格完整性」是两件正交的事（续 8 澄清，见 §3.1 边界提示）——完整性自动补历史、连续性只读人工处理，报告分列不混报、无需去重；ExecPlan 仍须冻结价格连续性的交易日日历数据源与完整度算法（市场日口径本身已定，非自然日）；未改任何 Task 状态（Planner 仅建卡内容）。

## 9. 记录

2026-11-20，Reviewer 复审结论为 **Pass**。AC2 停用场景已修复，AC1–AC6 均通过。见[执行计划 §12](./TASK-076-asset-information-completeness-check-plan.md#12-review-record)。

2026-11-20，独立复审为 **Pass**，AC1–AC6 均通过。见[执行计划 §12](./TASK-076-asset-information-completeness-check-plan.md#12-review-record)。
2026-11-17，Planner：依据 Human 指令「将 launchDate 相关任务独立 + 新增资产信息完整性检查任务」建卡。同步从 TASK-073 剥离 launchDate 回填与 D-c（见该卡 §9）。初始 Status 待 Orchestrator 登记；优先级建议 High，最终以 Human 为准。

2026-11-17（续 3）：Human 修订 **AC3**——**取消每日自动运行**（日志过多），改为日志频道看板「运行资产信息检查」按钮手动触发（D-m）；并要求写清**每个字段的检查标准与自动修正策略**。D-m 与 [FS P0 NG6](../../requirements/specs/FS-cron-worker-status-board.md) 冲突，须 PM/Human 日期附录定向修订后按钮方可上线。

2026-11-17（续 4）：Human 再次修订 **D-l**——**只检查 5 个字段**：`symbol`/`name`/`market`/`currency`/`launchDate`，其它字段（`type`/`assetClass`/`tags`/`active`/`watchlist`/`createdAt`）一律不管。AC3 与 §3.1 已同步收敛为 5 字段表；完整度 = 5 项均合格的资产数 / 总资产数；自动写入仍仅 launchDate，symbol 明确不自动改。

2026-11-17（续 5）：Human 两项修订——① **D-n**：「运行资产信息检查」按钮改放到**「资产信息完整度」卡片上的下方位置**（AC3 / AC4 已同步）；② **D-o**：完整性检查**新增价格策略「最近 3 天价格全为空 → 不完整并报告」**，作为对 D-l 5 字段范围的有界扩展（只加这一条价格序列判定，不放松其它字段、不自动写价），§3.1 增「价格连续性」行、完整度定义与边界提示同步更新；裁决登记见 §6 D-n / D-o。价格目标市场日口径与「价格完整性」任务的分工留待 ExecPlan 冻结，本轮不擅自细化实现。

2026-11-17（续 6）：Human 明确续 5 中「最近 3 天」的口径——**= 最近 3 个市场日**，按资产所属 `market` 的目标市场日（开市日）判定，**非自然日**。已同步 D-o 裁决行、Metadata 来源、AC3/AC4、§3.1 检查范围/价格连续性判定行/边界提示；与「价格完整性」任务的去重、报告归属及交易日日历来源仍留 ExecPlan 冻结（市场日口径本身已裁决，不再待定）。

2026-11-17（续 7）：Planner 起草 [TASK-076 执行计划](./TASK-076-asset-information-completeness-check-plan.md)（Status `Draft`，未批准）。计划冻结了市场日算法、6 项判定规则、currency/market 映射、对外契约（tasks[] 保持 5 + 顶层 `assetCompleteness`）、手动触发端点与 W0–W7 步骤；计划 §6 列 6 项待 Human 裁决（D1 NG6 附录为按钮上线阻塞前置、D2 市场日能力抽取 shared、D3 6 卡不破坏 054 契约、D4 详情数据源、D5 抓取端点实施实测、D6 check 不抓 launchDate）。本卡 Status 仍待 Orchestrator 登记，未改任何状态。

2026-11-17（续 8）：Human 澄清两项检查的正交关系——**价格完整性**回答"历史价格是否采集完成"，缺价则**自动补全历史采集**（属 TASK-073 AC5/AC6 语义）；**价格连续性**（本卡新增）回答"最近几次采集是否正常"，最近 3 个市场日全空则**只读报告、人工处理**。二者时间窗与处置动作不同，不是同一问题的两种报法、无需互相去重。§3.1 边界提示与 §8「本卡未做的事」已按此改写；原"是否互相去重/重复计数"待决项取消。ExecPlan 仍须冻结价格连续性的交易日日历数据源与完整度算法；未改 D-o 裁决、任何 AC 或 Status。

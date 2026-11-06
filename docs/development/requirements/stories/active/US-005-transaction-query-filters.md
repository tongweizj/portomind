# US-005：交易流水查询与筛选——「上个月投了多少」不用逐页翻

## 1. 基本信息

| 字段 | 内容 |
|---|---|
| Story ID | US-005 |
| Status | Backlog |
| 准备情况 | 可启动（需求已完整；建议先确认索引取舍再实施） |
| 产品负责人 | PM；方向、优先级、范围变更与关闭由 Human 决定 |
| 优先级 | Medium（Spec 自标 Backlog；已有 TASK-045 在 Backlog 未排期） |
| 创建日期 | 2026-11-05 |
| 最近更新 | 2026-11-05 |
| 交付目录 | docs/development/delivery/US-005/（启动时建立） |
| 需求来源 | Human 2026-11-05 指示整理 `specs/` 遗留需求；本 Story 承接 [FS-transaction-query-filters](../../specs/FS-transaction-query-filters.md) 的 Q1～Q6，对应既有任务卡 [TASK-045](../../../tasks/active/TASK-045-transaction-query-filters.md) |

> 状态、转换权限与取消处理唯一依据 [STATES.md](../../../../os/process/STATES.md) §2.2–§4；本卡 Status 为权威，目录不决定状态。

## 2. 用户问题与价值

**用户与场景：** 账本使用者。他想知道「2026 年 9 月总共投入了多少」「今年分红合计多少」。

**当前问题：** 交易列表只支持分页与「按组合 / 按标的」过滤，**没有时间维度**。`GET /api/transactions` 只解构 `portfolioId` 与 `symbol`；两个前端列表（`TransactionList.jsx`、`Portfolio/Transactions.jsx`）**都没有任何工具栏**。要核对某个月的总投入，只能在分页列表里逐页翻阅并自行累加。跨组合查账在 UI 上不可完成。

**用户故事：** 作为账本使用者，我希望按时间范围、交易类型和多个组合筛选交易流水，并且筛选条件能写进 URL，以便随时回答「某段时间我做了什么」，并把结果链接发给家人或自己保存。

**交付后的改善：** 账本从「只能顺序浏览」变成「可以按问题检索」。筛选后的总数准确，不再需要手工累加；URL 可分享、可收藏、刷新不回退。

## 3. 本次范围与产品规则

### 本次交付

- `GET /api/transactions` 新增 `from` / `to`（`YYYY-MM-DD`，**闭区间**，`to` 覆盖当日整天）与 `action`（枚举四值），并按 `date` 区间过滤。
- `GET /api/transactions` 支持 `portfolioId` **多值**（跨组合视角），单值场景保持向后兼容。
- `GET /api/portfolios/:pid/transactions` 同步支持 `from` / `to` / `action`（组合内 Tab 与全局页能力对齐）。
- 前端交易列表增加筛选工具栏（时间范围 + 类型 + 组合），条件写入 URL query。
- `pagination.total` 必须为**筛选后**计数，不是全量计数。

### 范围外事项

- 聚合统计（区间总投入 / 总分红 / 已实现盈亏等汇总卡片）——Spec NG1，属后续独立需求。
- CSV / Excel 导出（NG2）。
- 保存的筛选器 / 自定义视图（NG3）。
- 修改交易本身的业务口径与数据结构（NG4）。
- 扩展 `Price` 或其他列表页的筛选（Spec QO5：只覆盖交易流水）。

### 必要规则与约束

- **非法枚举值必须 `400`**，不得静默忽略（否则用户以为筛过了，实际是全量）。
- **区间语义必须是闭区间**：交易 `date` 是 `Date` 类型而非纯日期，`to` 需覆盖当日整天，否则「9 月 30 日」的交易会被漏掉。
- **多值参数形态需在实施时定**：重复参数（`portfolioId=a&portfolioId=b`）更符合 HTTP 语义，但要先确认 `parsePagination` 与既有校验函数是否兼容数组；也可用逗号分隔。二者择一，需在同一份契约里写死。
- **索引缺口是真实性能问题，不是理论风险**：现有两个复合索引前缀均为 `portfolioId`，跨组合按时间范围查询会退化为 collection scan，且 `date DESC` 排序可能落入内存排序（32MB 上限）。按 `action` 筛选无任何索引覆盖。**是否新增索引必须显式记录取舍**，不能默默接受。
- 新增索引属**数据层变更**，需评估对写入性能与数据量的影响。当前家庭 3 组合、交易量小，短期可接受 collection scan，但应在计划中明确记录。

### 相关资料

- Spec：[FS-transaction-query-filters.md](../../specs/FS-transaction-query-filters.md) —— §1 证据、§2 Goals、§3 Non-Goals、§4 Requirements Q1～Q6、§5 索引缺口、§6 Open Questions、§7 拆分理由
- 既有任务卡：[TASK-045](../../../tasks/active/TASK-045-transaction-query-filters.md)（`BACKLOG`，未排期，未创建 ExecPlan）
- 父需求：[FS-transaction-consolidation.md](../../specs/completed/FS-transaction-consolidation.md)（OQ1 由本需求承接）
- 现状落点：`server/controllers/transaction.controller.js`、`shared/services/transaction.service.js`、`client/src/services/transaction.service.js`、`shared/models/transaction.js` 索引定义

## 4. 验收条件

| 编号 | 前提 / 场景 | 用户动作或触发事件 | 可观察的预期结果 |
|---|---|---|---|
| AC-01 | 交易记录跨越多个日期 | 传入 `from` / `to` | 只返回区间内的交易；边界日当天的交易**包含**在内（闭区间，`to` 覆盖当日整天） |
| AC-02 | 传入非法 `action` 值 | 调用接口 | 返回 `400`，**不**静默忽略并返回全量 |
| AC-03 | 传入合法 `action`（buy / sell / div_cash / div_reinvest） | 调用接口 | 只返回该类型的交易 |
| AC-04 | 跨组合视角 | 传入多个 `portfolioId` | 返回这些组合的并集；只传一个 `portfolioId` 时行为与改动前一致（向后兼容） |
| AC-05 | 组合内交易 Tab | 传入 `from` / `to` / `action` | `GET /api/portfolios/:pid/transactions` 的筛选结果与全局页同一条件一致 |
| AC-06 | 任意筛选组合 | 检查 `pagination.total` | total 为**筛选后**的总数，不是全量；翻到最后一页的条数与 total 相符 |
| AC-07 | 前端交易列表 | 使用筛选工具栏（时间范围 + 类型 + 组合） | 列表与计数按条件收敛；条件写进 URL query，刷新后保持，链接可分享 |
| AC-08 | 筛选条件无匹配结果 | 查看列表 | 显示明确空态，不显示空白表格，也不回落到全量 |
| AC-09 | 清除全部筛选条件 | 操作 | 回到未筛选状态，URL 不残留空参数 |
| AC-10 | 跨组合 + 时间范围查询 | 在生产同量级数据上执行 | 响应时间可接受，且实施记录中已明确说明索引取舍（新增索引或显式接受 collection scan），有据可查 |
| AC-11 | 交付完成 | 运行测试 | 服务端测试覆盖 Q1～Q6 的边界（闭区间、非法枚举、多值、total），`npm test` 全绿 |
| AC-12 | 交付完成 | 检查文档 | `API_CONTRACT.md` 的 transactions 端点参数已更新；`handbook/manual/CLIENT.md` 的筛选说明已补 |

## 5. 依赖、假设与待决策事项

| 编号 | 类型 | 内容及影响 | 负责角色 | 解决 / 解除条件 | 当前结论及依据 |
|---|---|---|---|---|---|
| DEP-01 | 依赖 | 本需求由 `FS-transaction-consolidation` 的 OQ1 拆出，TASK-044（信息架构收拢）已完成并合入 `main`（PR #32） | Orchestrator | 已满足 | `TASK-044` 已 `Completed` + `Merged` #32 |
| DEP-02 | 依赖 | 改动 `server/controllers`、`shared/services`，且可能新增数据库索引 | Planner | 实施前须有 `Approved` ExecPlan | 按 [EXECUTION_PLANS.md](../../../../os/process/EXECUTION_PLANS.md) §2，schema / 索引变更通常需要 |
| OQ-01 | 待决策 | `portfolioId` 多值用**重复参数**还是**逗号分隔** | Planner / Human | 实施前定稿并写入契约 | 待确认。Spec QO1 倾向重复参数（更符合 HTTP 语义），但需确认 `parsePagination` 与校验函数兼容数组 |
| OQ-02 | 待决策 | 是否新增索引（`{date:-1,_id:-1}` 与 `{action:1,date:-1,_id:-1}`） | Planner / Human | 评估后给出结论并记录 | 待确认。Spec §5 已给出建议索引与「当前量小可接受 scan」的取舍说明 |
| OQ-03 | 待决策 | 是否保留 `symbol` 参数、是否需要多值 | PM | 确认 | 待确认。Spec QO2 建议保留单值，多值暂不需要 |
| OQ-04 | 待决策 | 是否提供「最近 30 天 / 本月 / 本年」快捷区间 | PM | 确认是否纳入本次 | 待确认。Spec QO4 建议作为可选增强，不阻塞主线 |
| OQ-05 | 假设 | 筛选条件只走 URL query，不持久化到 localStorage | PM | 确认 | Spec QO3 建议只走 URL（可分享、可回退），待确认 |

**当前下一步：** OQ-01 与 OQ-02 影响 API 契约与数据层，须在实施前定稿；本 Story 优先级为 Medium，需 Human 确认是否排在 US-002～US-004 之后。

## 6. 关联 Task 与验收覆盖

已有任务卡 [TASK-045](../../../tasks/active/TASK-045-transaction-query-filters.md)（`BACKLOG`，未排期、未创建 ExecPlan），覆盖范围与本 Story 一致，可直接复用，**不新占编号**。

| Task | 工作摘要 | 覆盖的验收条件 | 必要性 / 关联说明 |
|---|---|---|---|
| [TASK-045](../../../tasks/active/TASK-045-transaction-query-filters.md) | 交易流水查询与筛选（服务端 + `shared` + 客户端） | AC-01～AC-12 | 交付必需；范围已核对与本 Story 一致 |

> 若 Planner 认为需拆分（例如服务端筛选与前端工具栏分两张卡），在立项时按 BOARD 当前最大号顺延；现有 TASK-045 不重号。

## 7. 需求变更记录

| 日期 | 变更内容及原因 | 对范围 / AC / Task 的影响 | 决策人及依据 |
|---|---|---|---|
| 2026-11-05 | 首次建卡，把 `FS-transaction-query-filters` 从 Spec 级提升为 Story 级；复用既有 TASK-045 | 不改变 TASK-045 的状态与范围 | PM 按 [REQUIREMENTS.md](../../../../os/process/REQUIREMENTS.md) 拆 Story |

## 8. 整体验收记录

| 验收项 | 结论 | 证据链接 / 对应版本 | 问题或豁免依据 |
|---|---|---|---|
| AC-01～AC-12 | 未验证 | 尚未进入实现 | 无豁免 |
| 团队完成标准 | 未验证 | [DEFINITION_OF_DONE.md](../../../../os/process/DEFINITION_OF_DONE.md) | 无豁免 |

**验收日期：** 待验收

**验收版本：** 待确认

**验收结论：** 未实施整体验收，未关闭。

**验收责任人：** PM（汇总）→ Human（关闭）

## 9. 关闭与交付记录

| 项目 | 记录 |
|---|---|
| 交付摘要 | 尚未交付 |
| 关闭日期 | 未关闭 |
| 关闭责任人及授权依据 | 待 Human 实际验收与关闭 |
| 相关产品文档同步 | 实施后须更新 `API_CONTRACT.md`、`handbook/manual/CLIENT.md`、`PL-1-ledger.md` 的 TR-01 现状描述 |
| 过程资料归档 | 待 Story 关闭后按 [DOCS.md §1.1](../../../../os/standards/DOCS.md#11-story-交付目录与文档生命周期) 归档 |
| 遗留事项及去向 | 区间聚合统计、导出、保存的筛选器：均在 Spec 落为 Non-Goal，未建 Story |

### 退出 / 恢复记录

| 日期 | 事件（取消 / 恢复） | 原因 | Human 决定引用 | 退出前状态 / 恢复阶段 | 下挂 Task 处置 |
|---|---|---|---|---|---|
| — | 无 | — | — | — | — |

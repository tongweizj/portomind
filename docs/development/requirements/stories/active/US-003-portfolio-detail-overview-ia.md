# US-003：组合详情「总览」——卡片说偏了，点进去看得见

## 1. 基本信息

| 字段 | 内容 |
|---|---|
| Story ID | US-003 |
| Status | Backlog |
| 准备情况 | 可启动（需求来源为已批准 Spec；纯客户端，零服务端改动） |
| 产品负责人 | PM；方向、优先级、范围变更与关闭由 Human 决定 |
| 优先级 | High（组合线 IA 收尾，`FS-portfolio-ia-cleanup` 已 `Approved` 但从未实施） |
| 创建日期 | 2026-11-05 |
| 最近更新 | 2026-11-05 |
| 交付目录 | docs/development/delivery/US-003/（启动时建立） |
| 需求来源 | Human 2026-11-05 指示整理 `specs/` 遗留需求；本 Story 承接 [FS-portfolio-ia-cleanup](../../specs/FS-portfolio-ia-cleanup.md) **交付单元 A**（A1～A17） |

> 状态、转换权限与取消处理唯一依据 [STATES.md](../../../../os/process/STATES.md) §2.2–§4；本卡 Status 为权威，目录不决定状态。

## 2. 用户问题与价值

**用户与场景：** 组合主人。他在组合列表卡片上看到一个「偏离阈值」的琥珀色徽标，点进去想看看到底哪只超了。

**当前问题：** 点进去落到「持仓概览」——4 张 KPI 卡和一张 9 列持仓明细表，**没有目标比例、没有实际比例、没有偏离量、没有偏离原因**。他得再切一次 Tab 才能看到漂移解释，而那个 Tab 里还塞着阈值设置。此外：删除组合的唯一入口在一个零引用页面上（`Basic.jsx`），用户根本点不到；「最近再平衡 · 暂无」和「今日盈亏 · —」两个永久空位看起来像功能坏了；「超过 60 天没动过」这个最典型的再平衡场景在列表页永远不显示。

**用户故事：** 作为组合主人，我希望点开组合的第一屏就能看到目标 vs 实际、偏了多少、为什么判超、距上次再平衡多久，并且能在这里找到删除组合和修改阈值的入口，以便一眼判断「这个组合要不要动」。

**交付后的改善：** 徽标与详情页语义闭合——卡片说偏了，点进去第一屏就解释它。配置（改阈值）与执行（动钱）在界面上分层。删除组合可达但不可误触。两个假空位消失。时间维度的到期在详情页可见。

## 3. 本次范围与产品规则

### 本次交付

- **新增「总览」为详情页首 Tab**（Tab 顺序：总览 / 持仓概览 / 持仓历史 / 再平衡 / 交易记录），默认落点改为 `overview`。
- **总览内容四块**：KPI 4 卡（持仓总市值 / 未实现盈亏 / 持有资产 / 再平衡状态）→ 目标 vs 实际表 → 触发原因行 → 最近一次再平衡 + 「再平衡配置」折叠区。
- **配置与执行分层**：阈值设置从「再平衡」Tab 移入总览配置区；再平衡子 Tab 由 3 个减为 2 个（建议 / 历史），状态改由 URL `?sub=` 驱动。
- **删除组合可达**：详情 Header「更多」菜单提供「归档组合」与「删除组合」，删除需输入组合名二次确认。
- **Header 增加「设置目标」按钮**（跳 `PortfolioForm` 目标区，不在详情页内联编辑）。
- **提醒精确落点**：带 `snapshot.recordId` 的提醒点击后，落到该次再平衡记录并展开只读建议明细。
- **清理**：删除零引用文件 `Basic.jsx`、`TargetAllocation.jsx`；`basic` 路由回落到 `overview`。

### 范围外事项

- Dashboard 组合健康表、`summary` 新增字段（`lastExecutedAt` / `pendingRebalanceCount` / `dueByTime` / `overThresholdCount`）——归 **US-004**。本 Story 纯客户端、零服务端改动。
- `PortfolioCard` 徽标按 `dueByTime` 显示「待再平衡」（规格 P1-1），本 Story 不做。
- 删除确认弹窗显示精确影响面（P1-2，需新端点）。
- 单条记录端点 `GET /:pid/rebalance/records/:rid`（P1-4）。本 Story 用 `pageSize=100` + 失配提示代替。
- 组合再平衡历史行加「查看运行记录」（P1-5）：依赖 US-002 的记录页先落地，本次不做。

### 必要规则与约束

- **偏离判定必须复用服务端**：目标 vs 实际表的数据来自 `POST /api/portfolios/:id/rebalance/check` 的 `details` / `reasons`。**禁止**前端自行实现偏离或阈值判定（`actualRatios` 返回的 `{symbol,currency,ratio}` 不含 target，前端 join 再本地算 = 第二套口径）。
- **`check` 必须保持无写入**：总览用 POST 当读接口。实施时须断言调用前后 `RebalanceRecord.countDocuments()` 不变。
- **两个 N 不可混用**：「N 项超阈」的 N 是**标的数**；「已到期（N 天）」的 N 是**天数**。文案必须带单位词（「项」/「天」）。
- **缺价不得按 0 参与计算**：`absoluteDeviation === null` 的行显示「—」，并说明「N 项缺最新价，未能参与偏离判定」。
- **未设目标必须显示空态**：不得渲染全 0% 的假表格。
- **A10 的依赖**：Header「最近再平衡」Chip 需要 `lastExecutedAt`，该字段由 US-004 的服务端改动（B1）提供。**若本 Story 先实施，该 Chip 先隐藏；若 US-004 先落地，直接显示。**
- **不新增页面、不新增端点、不新增请求**：全部复用既有组件与接口（A16 的 `?record=` 靠既有 `getHistory` 返回的 `suggestions`，零新增请求）。

### 相关资料

- Spec：[FS-portfolio-ia-cleanup.md](../../specs/FS-portfolio-ia-cleanup.md) —— §4.1（IA）、§4.2.1（`?record=`）、§5（US-1～4、US-7）、§6.1（A1～A17）、§7 交付单元 A 的 AC1～AC19 / AC37～AC40、§10（R-1～R-4、R-8）、§11（HD-1/2/5/9/11/12）
- 行为标尺：[portomind-prototype.html](../../../prototypes/2.0/portomind-prototype.html) —— `DETAIL_TABS`、`vPortfolioDetail()`、`vDetailHeader()`、`tabOverview()`、`kpiRow()`、`driftOf()` / `driftChipHTML()`
- 原型整改记录：[TASK-059](../../../tasks/completed/TASK-059-prototype-alignment-portfolio-ia.md)（原型已按本 Spec 改版，**行为比对以原型为准，需求以 Spec 为准**）
- 并行 Story：[US-004](./US-004-dashboard-portfolio-health.md)（B1 字段）

## 4. 验收条件

| 编号 | 前提 / 场景 | 用户动作或触发事件 | 可观察的预期结果 |
|---|---|---|---|
| AC-01 | 访问 `/portfolios/view/:id` 且不带 tab 段 | 打开页面 | 落到 `/portfolios/view/:id/overview`；访问 `/portfolios/view/:id/basic` 同样回落 overview，无白屏 |
| AC-02 | 详情页已打开 | 查看 Tab 栏 | 恰好 5 个 Tab，顺序为 总览 / 持仓概览 / 持仓历史 / 再平衡 / 交易记录 |
| AC-03 | 1440×900 视口 | 打开总览 | 不滚动即可见：4 张 KPI 卡、目标 vs 实际表的表头与至少 3 行、触发原因行 |
| AC-04 | 构造目标 40% / 实际 48.3% | 查看该行「绝对偏离」 | 显示 `+8.3`，与 `POST /:id/rebalance/check` 返回的 `details[i].absoluteDeviation` 逐项一致（容差 1e-6） |
| AC-05 | 某标的仅绝对超阈 / 两项皆超 | 查看「状态」列 | 与 `details[i].triggeredThresholds` 一致：仅绝对 → 只标「绝对」；两者皆超 → 标两项 |
| AC-06 | 构造 `lastExecutedAt` 距今 61 天、`timeInterval` 60 | 查看触发原因行 | 出现时间维度文案（如「距上次再平衡 61 天 > 60 天」），证明时间维度在详情页可见 |
| AC-07 | 组合未设目标 | 打开总览 | 显示空态文案与「去设置」按钮；DOM 中不存在 0.0% 的目标列数据。负向对照：设了目标时该文案不出现 |
| AC-08 | 某持仓缺最新价 | 查看该行 | 「绝对偏离 / 相对偏离」显示「—」，表尾出现「N 项缺最新价，未能参与偏离判定」；市值与偏离不被零价污染 |
| AC-09 | 总览已渲染 | 检查 KPI 区 | 不存在「今日盈亏」文案；`grep -rn "今日盈亏" client/src` 无结果 |
| AC-10 | 组合币种为 CAD / CNY | 查看 KPI 金额 | 符号分别为 `CA$` / `¥`，不出现硬编码 `USD` |
| AC-11 | 打开再平衡 Tab | 检查子 Tab 与 URL | 恰好 2 个子 Tab；`?sub=history` 直接落到历史、刷新后仍在历史；`?sub=xxx` 回落建议 |
| AC-12 | 打开总览 | 查看「再平衡配置」折叠区 | 默认收起；展开后可编辑，保存成功后与 summary 相关的两个 query 均失效刷新；阈值设置**不再**出现在再平衡 Tab |
| AC-13 | 打开 Header「更多」菜单 | 点击「删除组合」 | 确认弹窗在未输入组合名时删除按钮 disabled；输入**错误**名称仍 disabled；输入正确名称后可删除；删除后跳 `/portfolios` 且列表中该组合消失 |
| AC-14 | 删除确认弹窗的文案 | 检查文案 | 同时含「永久删除」「交易记录」「再平衡记录」「不可恢复」四个要素，且不含「不会级联删除」 |
| AC-15 | 删除接口返回非 2xx | 提交删除 | 弹窗保留并显示错误，**不**跳转 |
| AC-16 | 组合有 / 无 `lastExecutedAt` | 查看 Header「最近再平衡」Chip | 有值显示 `YYYY-MM-DD`，无值显示「从未」；DOM 中 `grep` 不到「暂无」 |
| AC-17 | 检查遗留文件引用 | 执行静态检查 | `grep -rn "Basic\b" client/src/router.jsx` 与 `grep -rn "TargetAllocation" client/src` 均无结果，两个文件已删除 |
| AC-18 | 交付完成后 | 检查改动范围 | `git status server shared cron-worker` 空输出（本 Story 零服务端改动） |
| AC-19 | 构建与静态检查 | 执行 | `npm run build --workspace client` exit 0；eslint 0 error |
| AC-20 | 提醒事件带 `snapshot.recordId` | 点击该提醒 | URL 含 `sub=history` 与 `record=<id>`；该行高亮；展开的建议明细行数 = `record.suggestions.length`。负向对照：`snapshot` 为空的事件，跳转 URL 不含 `record=` |
| AC-21 | `?record=` 指向不存在的 id | 打开页面 | 出现「该建议不在最近记录中」提示，历史表正常渲染（不空白、不报错）；`?record=` 缺失时不渲染建议明细展开区 |
| AC-22 | 打开 `?record=` 页面 | 观察 Network | `history` 请求数为 1，且访问前后 `RebalanceRecord.countDocuments()` 不变（证明确实零新增请求、零写入） |
| AC-23 | 详情页 Header | 查看动作按钮 | 恰好 4 个：添加交易 / 编辑 / 设置目标 / 更多（**不得**出现「再平衡」按钮）；点「设置目标」落到 `/portfolios/edit/:id` 且目标配置区可见；详情页内不存在目标编辑弹窗 |
| AC-24 | 交付完成 | 独立复核 | 由独立 Reviewer 复核通过，不由 Implementer 自判 |

## 5. 依赖、假设与待决策事项

| 编号 | 类型 | 内容及影响 | 负责角色 | 解决 / 解除条件 | 当前结论及依据 |
|---|---|---|---|---|---|
| DEP-01 | 依赖 | AC-16 的 `lastExecutedAt` 来自 US-004 的服务端改动（B1）；本 Story 自身零服务端改动 | PM / Planner | 两 Story 的实施顺序确定 | **已确定（2026-11-05 Human 裁决，见 OQ-01）**：US-004 先行 → B1 先落地，本 Story 的 AC-16 Chip 可直接显示，无需「先隐藏后补」 |
| DEP-02 | 依赖 | US-004 的「待办」列跳转目标 `?sub=suggestions` 依赖本 Story 的 AC-11 落地 | PM | 顺序协调 | Spec §9：A 先于 B 更顺，但非硬依赖；US-004 先实施时该链接落到默认子 Tab，行为等价（已被 US-004 OQ-02 采纳） |
| DEP-03 | 依赖 | 主工作区有 `docs/development/delivery/completed/US-001/` 的未提交 Planner 改动，实施前须确认工作区基线 | Orchestrator | 启动前核对 | 待核对 |
| OQ-01 | 已裁决 | 本 Story 与 US-004 的实施顺序：**先 A 后 B**（Spec 建议）还是**先 B 后 A**（可消除 AC-16 的临时隐藏态、少一次返工） | Human | 给出顺序决定 | ✅ 已裁决（2026-11-05 Human，2026-11-05 PM 经 Human 复核确认）：**US-004 先实施，本 Story 随后**。因此 AC-16 的 `lastExecutedAt` Chip 可直接显示，不做「先隐藏后补」 |
| OQ-02 | 假设 | 「1440×900 不滚动」这类结果性标准不锁像素，允许实现调整间距 | PM / Planner | 实施时确认 | 依 Spec §10 R-6 |
| OQ-03 | 待决策 | `?record=` 未命中时的 `pageSize=100` 上限是否可接受（超出 100 条即失配） | Human | 接受现状或批准 P1-4 的单条端点 | 待确认；Spec R-8 已登记该风险并明确本次不做 P1-4 |

**当前下一步：** OQ-01 的顺序已裁决（**US-004 先行**），DEP-01 随之解除，AC-16 可直接按「显示 `YYYY-MM-DD` / 无值显示『从未』」实施，不做临时隐藏。剩余 OQ-03（`?record=` 的 `pageSize=100` 上限）若接受现状，本 Story 即可按 Spec 交 Planner 拆 Task（纯客户端，无需新依赖）。

## 6. 关联 Task 与验收覆盖

待 Planner 拆分。Spec 已给 A1～A17 的逐条落点与文件位置，但**任务编号未定**，立项时按 BOARD 当前最大号顺延。

| Task | 工作摘要 | 覆盖的验收条件 | 必要性 / 关联说明 |
|---|---|---|---|
| 待确认 | 总览 Tab 骨架与 KPI（A1、A2、A5、A6、A11） | AC-01～AC-04、AC-09、AC-10 | 交付必需 |
| 待确认 | 目标 vs 实际表与触发原因（A3、A4、A13～A15） | AC-04～AC-08 | 交付必需 |
| 待确认 | 配置分层与子 Tab URL 化（A7、A8） | AC-11、AC-12 | 交付必需 |
| 待确认 | Header 更多菜单、删除与设置目标（A9、A17） | AC-13～AC-15、AC-23 | 交付必需 |
| 待确认 | 「最近再平衡」Chip 修正（A10） | AC-16 | 依赖 US-004 的 B1 |
| 待确认 | 遗留清理（A12） | AC-17 | 交付必需 |
| 待确认 | `?record=` 精确落点（A16） | AC-20～AC-22 | 依赖 A8 先落地 |

## 7. 需求变更记录

| 日期 | 变更内容及原因 | 对范围 / AC / Task 的影响 | 决策人及依据 |
|---|---|---|---|
| 2026-11-05 | 首次建卡。原 Spec 于 2026-10-26 `Approved` 但从未拆 Task（BOARD 仅登记了原型整改 TASK-059，非功能实现） | — | PM 按 [REQUIREMENTS.md](../../../../os/process/REQUIREMENTS.md) 拆 Story |

## 8. 整体验收记录

| 验收项 | 结论 | 证据链接 / 对应版本 | 问题或豁免依据 |
|---|---|---|---|
| AC-01～AC-24 | 未验证 | 尚未进入实现 | 无豁免 |
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
| 相关产品文档同步 | 实施后须同步 PL-3 `CM-13` / `CM-12` / `CM-19` 判定与 `handbook/manual/CLIENT.md` |
| 过程资料归档 | 待 Story 关闭后按 [DOCS.md §1.1](../../../../os/standards/DOCS.md#11-story-交付目录与文档生命周期) 归档 |
| 遗留事项及去向 | P1-1 徽标改 `dueByTime`、P1-2 删除影响面预览、P1-4 单条记录端点、P1-5 反向缝合入口：均未建 Story |

### 退出 / 恢复记录

| 日期 | 事件（取消 / 恢复） | 原因 | Human 决定引用 | 退出前状态 / 恢复阶段 | 下挂 Task 处置 |
|---|---|---|---|---|---|
| — | 无 | — | — | — | — |

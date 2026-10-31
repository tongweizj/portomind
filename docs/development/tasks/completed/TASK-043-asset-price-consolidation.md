# TASK-043 — 标的频道合并（资产管理 + 价格）

## Metadata

**Status:**  
`COMPLETED` — **2026-10-19 由 Human 指令结案**（提交 `891d0f7`，2026-10-18）。四轮独立审查完毕、第四轮无硬阻塞；§11 记录验收结果与三项已知限制的去向。

**Priority:**  
`High`

**Owner:**  
`Human`（最终验收，2026-10-19）→ 已关闭

**Created:**  
`2026-10-18`

**Updated:**  
`2026-10-19`（`REVIEWING` → `COMPLETED`，见 §11）

**Related Product Spec:**  
`docs/development/requirements/specs/completed/FS-asset-price-consolidation.md`

**Related ADR:**  
`None`

**Execution Plan:**  
`docs/development/exec-plans/completed/TASK-043-asset-price-consolidation.md`（**✅ Completed 2026-10-19**）

---

## 1. Goal

将客户端两个割裂的顶层频道「资产管理」与「价格」重组为以「标的」实体为中心的信息架构：顶层「今日行情」（监控面）富化并承载标的列表入口；新增「标的详情页」；「资产管理」移出顶层导航。纯客户端改动，零服务端/内核改动。

## 2. Why

- 单标的的「它是什么」与「它每天表现如何」被拆成两个互不相干的导航项，单品认知需跨页拼接。
- 价格频道长期处于「半成品」（仅 symbol/price/timestamp），无名称/涨跌幅/大类/上下文。
- 低频的「资产管理」长期占用高频顶层导航位，导航语义重叠、拥挤。
- 数据缺口（≥3 天未更新）不可见，损害数据可信度。

## 3. Scope

- 导航重命名/层级调整：价格 → 今日行情（带「监控」badge）；删除顶层资产管理项，收敛为今日行情屏内「查看所有标的 →」入口；侧边栏 7 项 +「总览」分组标签。
- 旧路由 `/assets`、`/assets/edit/:id` 重定向到 `/instruments` 对应路径。
- 新增 `/instruments` 标的列表页（从今日行情屏底进入；含状态列/多选框；移除原「价格」动作）。
- 富化 `/prices` 今日行情（名称 + 当日涨跌幅 + 大类 chip + 工具栏搜索/关注·大类过滤 + 屏底列表入口 + 缺口标红）。
- 新增 `/instruments/:id` 标的详情页（标题区属性 + 价格表现全宽面板 + 30 日 sparkline + 历史图复用 + 空态）。
- 数据缺口可见（最近更新 N 天前，≥3 天标红）。

## 4. Out of Scope

- 服务端数据模型 / 采集管线 / cron-worker 调度（NG1）。
- 新增资产类型或行情数据源（NG2）。
- 合并交易记录 / 组合管理 / 家庭视图（NG3）。
- 引入认证 / 登录（NG4）。
- 组合级分析重构（NG5）。
- P2 项：详情页内联编辑（R9）、今日行情并入 Dashboard 标签页（R10）、标的批量分类（R11）——仅预留余地，不在本次实现。

## 5. Constraints

- 仅复用既有客户端服务接口：`getAssets` / `getAssetById` / `deleteAsset` / `getTodayPrices` / `getPricesByDate` / `getPriceHistory`；**不修改任何 `server/`、`shared/`、`cron-worker/` 文件**。
- 标的信息架构遵循「实体层合一、任务层分离」：今日行情独立保留且承载列表入口，不得将配置与监控拼成一页。
- 命名统一为「标的」；涨跌幅按各自币种计算，不做跨币汇总（遵循「宁可少报不可错报」）。
- 缺价时表现区显示空态「暂无价格记录」，不显示 0 价误算（共享内核原则）。

## 6. Acceptance Criteria

- [ ] 侧边栏显示 7 项且无独立「资产管理」顶层项；今日行情带「监控」badge；含「总览」分组标签且 Dashboard·提醒置顶。
- [ ] 旧路由 `/assets`、`/assets/edit/:id` 自动重定向到 `/instruments` 对应路径（书签/历史不失效）。
- [ ] `/instruments` 标的列表页含状态列与多选框；添加/编辑/删除可达；行内无冗余「价格」动作。
- [ ] `/prices` 今日行情含名称 + 当日涨跌幅 + 大类 chip；行可点击进入标的详情；屏底「查看所有标的 →」入口可达列表；搜索与关注/大类过滤生效；缺口 ≥3 天标红。
- [ ] `/instruments/:id` 详情页：标题区呈现基本属性（代码/市场/币种/类型/大类/标签，停用追加「已停用」）+「编辑属性」入口；价格表现面板含今日价 + 当日涨跌幅(按币种) + 30 日 sparkline + 历史图（复用 `getPriceHistory`/现有 History 渲染）+ 空态。
- [ ] 数据缺口可见：今日行情与详情页展示「最近更新：N 天前」，≥3 天标红（呼应 AS-07）。
- [ ] 本方案不修改任何 `server/` / `shared/` / `cron-worker/` 文件。

## 7. Dependencies

### Blocking Dependencies

- 无。**FS 已于 2026-10-18 由 Human 批准**（原「草稿 · 待评审」门槛已解除，Human Intent 生效）。

### Non-Blocking Dependencies

- **OQ2**（今日行情保留独立顶层频道还是并入 Dashboard 标签页，导航 7→6）：FS 已建议本次先定 7 项，可在 Plan Review 确认。
- **OQ5**（旧 `/assets` 路由重定向还是直接替换）：FS 建议重定向保兼容，可在 Plan Review 确认。

## 8. Related Documentation

- Product Spec: `docs/development/requirements/specs/completed/FS-asset-price-consolidation.md`
- 可交互线框稿: `docs/development/requirements/specs/FS-asset-price-consolidation-wireframe.html`
- 产品线 PL-1 投资账本线: `docs/handbook/product/lines/PL-1-ledger.md`
- 产品线 PL-2 行情数据线: `docs/handbook/product/lines/PL-2-market-data.md`
- 执行计划规范: `docs/os/process/EXECUTION_PLANS.md`
- 编码规范: `docs/os/standards/CODING.md` · 测试: `docs/os/standards/TESTING.md`

## 9. Execution Plan Decision

**ExecPlan Required:**  
`Yes`

**Reason:**

跨多客户端模块（Sidebar / router / 三个页面 / 两个服务层），属信息架构变更、多步骤、多文件改动，且存在未决技术决策（涨跌幅派生、缺口时区口径、重定向范围）。符合 `EXECUTION_PLANS.md §2` 中「multiple modules / architectural changes / multiple implementation steps / significant uncertainty」阈值，需 ExecPlan 保证另一 agent 可安全接续。

## 10. Coordination Notes

- 由 Orchestrator 于 2026-10-18 登记并交接给 Planner；Orchestrator 已完成代码事实核对（详见 ExecPlan §3 Repository Findings）。
- **2026-10-18 Human 批准 FS**（B1 解除）→ 状态推进至 `IMPLEMENTING`，按 FS §9 Phase 1（P0，含 R6/R7）实施。
- ⚠️ **流程偏离（已追认）**：ExecPlan §4/§5/§7 补全与代码实现均由 Orchestrator 在同一轮完成，跳过了 Plan Review 与 Implementer 环节，触犯 `ORCHESTRATOR.md §3` 四条禁令。Human 于 2026-10-18 **追认本次例外**（仅限 TASK-043，不构成先例）。完整记录见 ExecPlan §8。已在同轮补全 `docs/os/roles/PLANNER.md`、`IMPLEMENTER.md`（待 Human 审核）。
- **第一轮独立审查 `Fail`**（ExecPlan §9）：原实现以 `getTodayPrices` 为列表底座，导致「≥3 天缺口标红」逻辑不可达、周末整页误报空态。
- **返工**（2026-10-18）：列表底座改为标的全集 + 14 日价格窗口、按查询日归组；移除 `getTodayPrices`；抽出 `client/src/utils/priceDisplay.js` 统一口径；修复 0 值涨跌幅、静默吞错、详情页错误分离等。
- **第二轮独立复审 `Pass with issues`、无 Blocking**（ExecPlan §10）：缺口标红已验证在 3–13 天区间真实可达；`vite build` 2401 modules / exit 0、本地 `eslint v9.39.5` 0 error；`server/`/`shared/`/`cron-worker/` 无 `.js` 改动。
- **第三轮独立复审 `Fail`**（ExecPlan §10.7）：`expectedSyncLagDays` 只按星期几硬编码，缺「时刻/节假日/市场」维度 → 周二 00:00–03:00 与节后周二仍整表误报；同时判定 Orchestrator 的验证脚本为**自证循环**（期望值照抄实现公式）。
- **Human 裁定**：改用**相对基准法**（按 market 分组取基准、只判个别标的落后），并一并修复三个确定性 bug。
- **第四轮独立复审 `Pass with issues`、无硬阻塞**（ExecPlan §10.8）：相对基准法落地正确；三个 bug 已修；验证不再自证循环；打包产物与源码逐字节一致；`expectedSyncLagDays` 全仓 0 引用。复审同时纠正我两处不实陈述——断言实为 33 项（我称 31 项）、`§10.8` 被我引用时并不存在（已补）。
- **可复跑验证**：`node client/scripts/verify-price-display.cjs` —— 18 个场景组 / 42 项断言，当前全通过。
- **待 Human 验收时明示接受的 3 点**（ExecPlan §10.8.5 / §10.8.8）：① 详情页收窄为「不标红 + 90 天全无数据才红」（单标的无法建基准、长假必误报）；② 全市场同时停更不告警（相对基准法固有盲点，依赖服务端完整性检查）；③ FS 的 R6 与验收标准措辞需由 PM/Human 同步为新口径。
  - **2026-10-19 处置**：Human 指令「置 Completed」→ ①② 作为**已知限制随本任务一并接受并关闭**（技术口径不再变更，兜底方式见 ExecPlan §10.8.5）；③ 属**需求文档措辞**，未随代码关闭，转为遗留文档事项（见 §11）。
- 纪律记录：四轮审查全部由独立 Reviewer 子代理执行，Orchestrator 未自审、未自行结案。

## 11. Completion

### Acceptance Result

`Passed`（Human，2026-10-19）

| 项 | 内容 |
|---|---|
| 结案指令 | Human 于 2026-10-19 指出「TASK-043 状态不一致」（已在 `complete/` 目录与 Done 表，卡内仍写 `REVIEWING`），并指令「置 Completed」 |
| 提交 | `891d0f7` — `TASK-043-asset-price-consolidation`（2026-10-18，Human 执行） |
| 审查依据 | 四轮独立审查：`Fail` → `Pass with issues` → `Fail` → **`Pass with issues`、无硬阻塞**（ExecPlan §9 / §10 / §10.7 / §10.8） |
| 可复跑证据 | `node client/scripts/verify-price-display.cjs` → 18 场景组 / 42 断言全通过 |
| 验收人 | Human（`EXECUTION_PLANS.md §7 Ownership`：final acceptance 属 Human） |

### Completed Date

`2026-10-19`

### Final Notes

- **已知限制随本任务接受**（ExecPlan §10.8.5）：全市场同时停更不告警（依赖 `integrityCheck` 兜底，UI 无横幅）；单数据源市场漏报；`loadFailed` 可能过度抑制；工作日数不含节假日；分页硬上限（已用 `pagination.total` 提示）。以上属**口径设计取舍**，不视为缺陷。
- **详情页口径收窄已接受**：单标的无法建基准 → 有数据只中性显示「N 天前」，仅 90 天全无价格才标红。缺口告警职责归列表页。
- **遗留（未随本任务关闭）**：`docs/development/requirements/specs/completed/FS-asset-price-consolidation.md` 的 **R6 与验收标准仍写「≥3 天未更新标红」**，与实现口径（落后同市场 3 个工作日）不一致，且「详情页也标红」已被有意收窄。FS 属 Human Intent，Orchestrator 不擅自改措辞，**待 PM/Human 同步**。
- **流程偏离已追认**：本任务曾由 Orchestrator 代行 Implementer 并跳过 Plan Review（ExecPlan §8），Human 于 2026-10-18 追认（仅限本任务、不构成先例）。该事件直接促成 `docs/os/roles/PLANNER.md` / `IMPLEMENTER.md` 补全与后续「实现与审查分离」纪律。
- 归档位置：任务卡 `docs/development/tasks/completed/TASK-043-asset-price-consolidation.md`；ExecPlan `docs/development/exec-plans/completed/TASK-043-asset-price-consolidation.md`。本卡归档后不再变更。

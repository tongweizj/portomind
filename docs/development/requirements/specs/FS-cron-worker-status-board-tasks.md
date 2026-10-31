# 任务卡片 — cron-worker 运行看板（日志频道增强）

> 关联需求：[FS-cron-worker-status-board.md](./FS-cron-worker-status-board.md)
> 状态：**已拆分（C-02 已交付 2026-10-27，其余待排期/指派执行）**
> 负责人（PM）：产品通 / owner：Max
> 拆分日期：2026-10-26

## 拆分说明

- 本文件是 **PM 视角的交付拆分**，不含任何代码。每张卡片定义「做什么 / 验收标准 / 依赖 / 边界」，工程侧据此配套 ExecPlan（按项目惯例，业务代码改动需 Approved ExecPlan）。
- 卡片分 3 档优先级：**P0（Must）| P1（Should）| P2（Future）**。
- 类型标注：`前端` / `后端` / `数据契约`（数据契约指 cron-worker 侧写库逻辑，属 NG2 例外）。
- **核心约束（来自 PRD §3）**：完成度主信号 = 数据态（数据是否真的到位），不取信 `taskruns.status` 单字段。
- **频道硬约束（OQ6）**：`/logs` 子树**只读排障、永不放执行动作**。本文件所有卡片的 AC 都隐含这一条；C-01 / C-07 额外做可验证化断言。
- **与组合域的边界（OQ7）**：本文件**不承接**「再平衡提醒详情」（建议明细 / 执行 / 撤销），那部分在 `FS-portfolio-ia-cleanup` 的 `A16`。

> **任务卡映射（2026-10-26 立项）**：C-01 → `TASK-053` · C-02 → `TASK-054` · C-03 → `TASK-055` · C-04 → `TASK-056` · **C-05 → `TASK-057`**（索引见 [`BOARD.md`](../../../BOARD.md)）。**P0 批次 C-01~C-05 已全部立项**；C-06~C-10 尚未立项。
>
> **✅ 交付进度（2026-10-27）**：**C-02 → `TASK-054` 已完成并归档**（[`complete/TASK-054`](../../tasks/completed/TASK-054-cron-status-aggregate-api.md) / [ExecPlan](../../exec-plans/completed/TASK-054-cron-status-aggregate-api.md)）：`GET /api/cron/status` 只读聚合已实现，5 条任务固定顺序、有效目标日、`contractReady` 降级、`?detail=rebalance` 全部就位。**⚠️ 代码尚未合入 `main`**（分支 `c7389d1`），前端消费前需先合并。C-01 / C-03 / C-04 / C-05 仍未开工。
>
> ⚠️ C-05 转卡时实库核查（`portomind_dev`，204 条 `taskruns`）发现一处本文件未预见的硬冲突：**`(taskName, runKey)` 唯一索引真实存在**，与「`SKIPPED` 落库」直接矛盾（`DUPLICATE_RUN_KEY` 的成因正是该 key 已存在）。另实测：含 `result` 的文档 **0 条**、父任务 `rebalance-check` 记录 **0 条**、僵尸 `RUNNING` **1 条（已僵 62 天）**。故 `TASK-057` 的 OQ-1 必须先裁再开工。

## 总览

| 卡片 | 标题 | 类型 | 优先级 | 依赖 |
|---|---|---|---|---|
| C-01 | 看板 tab 骨架（/logs 内新 tab） | 前端 | P0 | — |
| C-02 | 后端聚合接口 `GET /api/cron/status` | 后端 | P0 | — |
| C-03 | 价格同步数据态完成度展示 | 前端 | P0 | C-02 |
| C-04 | 状态色语义与图例 | 前端 | P0 | — |
| C-05 | 数据契约增强：`taskruns.result` + 父任务 + SKIPPED | 数据契约 | P0（升级：原 P1） | — |
| C-06 | 滞后 / 停滞判定 | 前端+后端 | P1 | C-02 |
| C-07 | 再平衡分发聚合卡 + 独立详情页 `/logs/rebalance` | 前端 | P1 | C-02 + **C-05** |
| C-08 | 一键下钻到原始日志 | 前端 | P1 | 现有任务日志视图 |
| C-09 | 历史趋势 | 前端 | P2 | C-02（多日扩展） |
| C-10 | launchDate 缺位治理引导 | 前端 | P2 | C-02 |

---

## P0 — Must Have

### C-01 看板 tab 骨架（/logs 内新 tab）
- **类型**：前端
- **优先级**：P0
- **关联需求**：R1、OQ1
- **描述**：在 `/logs` 的 `LogViewer` 内新增置顶标签页「任务运行看板」，含顶部总览条 + 5 任务卡片网格；原「服务器日志」「任务日志」tab 保留可访问。
- **验收标准**：
  - Given 用户打开 `/logs`，When 页面加载，Then 默认显示「任务运行看板」tab 且排在最前（OQ1：不动导航栏）。
  - Given 看板可见，When 查看，Then 顶部总览条含 5 个健康灯 + 整体健康徽章。
  - Given 用户点击「服务器日志」「任务日志」，When 切换，Then 原原始日志视图正常显示（G4：不丢原始视图）。
  - **Given 遍历 `/logs` 路由子树的所有组件，Then 不存在 `useMutation` / 写服务方法 / 执行类按钮**（NG6 只读硬约束；`grep` 为证）。tab 状态优先落 URL（如 `?tab=board`），以便 C-07 详情页「返回」不丢状态。
- **依赖**：无（渲染数据由 C-02 提供；接口未就绪时显示加载/空态，不阻塞骨架合入）。
- **边界**：仅前端信息架构与骨架；数据由 C-02 提供。

### C-02 后端聚合接口 `GET /api/cron/status`
> **✅ 已交付（2026-10-27，`TASK-054` 归档 `complete/`）**：实现已按「有效目标日 / `created` 而非 `alertsFired` / `contractReady` 降级」落地；本卡下方 AC 中 `{ok,gap,skippedNoLaunchDate}`、`alertsFired`、`各币种成功标志` 三处**旧字段名与实现不一致**，实际对外字段见 [`API_CONTRACT.md`](../../../handbook/technical/API_CONTRACT.md) 与 TASK-054 ExecPlan §4.3（FS 回改由 PM 处理）。

- **类型**：后端
- **优先级**：P0
- **关联需求**：R2
- **描述**：新建接口，读取 `taskruns` 集合并联合 `assets`/`prices` 派生 5 任务数据态指标；前端据此渲染，不依赖前端重算。
- **验收标准**：
  - Given 调用该接口，Then 返回 5 任务各自最近 `taskrun` + 派生数据态：价格 `expected/fetched/missing[]`；完整性 `{ok,gap,skippedNoLaunchDate}`；提醒 `alertsFired`；汇率各币种成功标志；再平衡按组合 `到期/生成/失败`。
  - Given 价格同步，Then `expected` 基于「上一开市日 + active 资产 + 市场开市判定」计算，`missing[]` 列出缺价资产（OQ2：上一开市日，非今天）。
  - **Given 再平衡，Then `到期` 必须来自父任务 `rebalance-check` 的 `result.perPortfolio[].due`，不得由「是否存在逐组合 taskrun」反推**（未到期与整批崩溃都零记录，见 FS §7.2-D4）。父任务 `result` 缺失时，该字段返回 `null` 并由前端降级，**不得**填 `false`。
  - **Given 某 taskrun `status=RUNNING` 且 `startedAt` 早于「2 × 任务周期」，Then 标记为 `STALE`（僵尸），不得当作"正在运行"**（D3）。阈值作配置常量。
  - Given 传入 `?detail=rebalance&date=&portfolioId=`，Then 返回逐组合明细（同名 `perPortfolio` 结构 + `failures[]` 原因），复用同一端点。
  - Given 无 `taskrun` 记录，Then 返回 `null` / 空数组的明确空态，不报错、**不返回伪造的成功态**。
- **依赖**：无硬依赖（可先合入返回运行态），但**完整数据态依赖 C-05**（父任务 `result` + `SKIPPED` 枚举 + `result` 字段）；C-05 未落地时再平衡相关字段返回 `null` 并降级，不得伪造。
- **边界**：仅读聚合；不改 cron 调度（NG2）；不重算价格/汇率/再平衡（NG3）。

### C-03 价格同步数据态完成度展示
- **类型**：前端（依赖 C-02）
- **优先级**：P0
- **关联需求**：R3、OQ2
- **描述**：价格卡展示「目标市场日（上一开市日）+ 应采/已采 + 进度条 + missing 清单」，主信号为数据态。
- **验收标准**：
  - Given 某 active 资产缺目标市场日价，When 看板渲染，Then 该卡标黄且可展开 missing 列表。
  - Given 全部齐，Then 标绿。
  - Given `fetched=0`，Then 标红。
- **依赖**：C-02（完成度算法在后端，前端仅展示）。
- **边界**：不信任 `taskruns.status` / `successCount`（PRD §7-D）。

### C-04 状态色语义与图例
- **类型**：前端
- **优先级**：P0
- **关联需求**：R4
- **描述**：看板统一使用系统状态色（绿=好 / 黄=关注 / 红=坏 / 灰=跳过），与价格「红涨绿跌」明确区分，提供图例。
- **验收标准**：
  - Given 看板渲染，Then 含状态色图例，说明此处「红=坏、绿=好」。
  - Given 任意状态色，Then 不出现「红=涨」误用（与行情页红色语义隔离）。
- **依赖**：无。
- **边界**：仅视觉语义；不改行情页配色。

---

### C-05 数据契约增强：`taskruns.result` + 父任务 + SKIPPED
- **类型**：数据契约（`shared` 层 + cron-worker 侧代码）
- **优先级**：**P0**（2026-10-26 由 P1 升级 —— 实码核查证明它不是"增强"，而是看板与详情页能否成立的前提，见 FS §7.2）
- **关联需求**：R5（R5a/R5b/R5c）、R2 的父任务部分、OQ3
- **描述**：让 `taskruns` 真正能承载任务结果。**三处硬缺口，缺一不可**：
  1. **C-05a schema**：`shared/models/taskRun.js` 新增 `result: Schema.Types.Mixed`。当前**没有该字段**，mongoose strict 默认为真 → 写入被**静默丢弃**（不报错）。
  2. **C-05b 透传**：`shared/services/taskRunner.js` 的 `normalizeCounts()` 是**白名单**（只留 `totalCount/successCount/failureCount/failures`），任务 `return {ok,gap,...}` 同样被吞。需改为「保留四个计数 + 透传调用方显式返回的 `result`」。
  3. **C-05c 状态**：`status` 枚举补 `SKIPPED`（当前跳过只返回值 + 打日志、不落库，`TASK_SKIPPED_ALREADY_RUNNING` / `TASK_SKIPPED_DUPLICATE_RUN_KEY` 两条路径都要落库），并对崩溃遗留的 `RUNNING` 定义僵尸阈值。
  4. **C-05d 父任务**：`runRebalanceCheck` 外层补一条 `taskName='rebalance-check'` 的 `runTrackedTask`，`result` 写 `{totalPortfolios, dueCount, skippedCount, failureCount, perPortfolio[{portfolioId, due, needsRebalance, suggestionsCount, recordId, status}]}`。**不改 cron 表达式、不改逐组合 `runKey`**（NG2）。
- **验收标准**：
  - Given 完整性检查运行完，Then `taskruns.result` 含 `{ok,gap,skippedNoLaunchDate}`（且**确实持久化**：重新查询数据库能读到，不是仅在返回值里）。
  - Given 汇率同步完，Then `result` 含各币种成功标志。
  - Given 再平衡分发完，Then存在一条 `taskName='rebalance-check'` 的记录，`result.perPortfolio` 长度 = 未归档组合数，且每项含 `due / needsRebalance / suggestionsCount`。
  - Given 某组合 `needsRebalance=false`，Then `perPortfolio[].suggestionsCount === 0` 且 `recordId === null`（与"生成了建议"**可区分**，D5）。
  - Given 任务因 `ALREADY_RUNNING` / `DUPLICATE_RUN_KEY` 被跳过，Then 存在一条 `status='SKIPPED'` 的持久化记录（D3）。
  - Given 5 个既有任务全部回归：`result` 的新增字段为**可选**，未返回时不得导致 `status` 判定异常（`normalizeCounts` 改动的回归面）。
- **依赖**：无。**必须先于 C-02 与 C-07**。
- **边界**：属 NG2 例外（改 worker 写库逻辑与新增父任务包裹），不改调度时间/周期/防重语义。**共享内核改动（`shared/models` + `shared/services`）影响 API 与 worker 两侧，需独立 ExecPlan 并回归全部 5 个任务。** PM 仅定义契约与验收。
- **备注**：OQ3 原为 PM 默认"必须做"；2026-10-26 实码核查后**该默认仍然成立且更紧迫** —— 不改这四步，C-02 只能返回运行态、C-07 详情页三列永远空白。

---

## P1 — Should Have

### C-06 滞后 / 停滞判定
- **类型**：前端 + 后端
- **优先级**：P1
- **关联需求**：R6、PRD §4.4
- **描述**：任一任务 `now - 上次成功运行 > 周期 + 缓冲（建议 26h）`，即使非 FAILED 也标「⚠ 可能停滞」灰黄提示，兜住「进程挂了但不报错」。
- **验收标准**：
  - Given 某任务超期未成功运行，When 渲染，Then 显示「⚠ 可能停滞」提示（灰黄）。
  - Given 正常运行，Then 不显示该提示。
- **依赖**：C-02（需 `lastSuccess` 时间）。
- **边界**：缓冲阈值 26h 作配置常量。

### C-07 再平衡分发聚合卡 + 独立详情页 `/logs/rebalance`（形态 B）
- **类型**：前端（路由 + 页面 + 卡内摘要）
- **优先级**：P1
- **关联需求**：R10、R11、OQ4、OQ8、R2（再平衡部分）；FS §4.5
- **描述**：5 卡中再平衡为 1 张聚合卡（内含逐组合摘要）；卡上「查看详情」进入**独立子路由 `/logs/rebalance`**，页面正式名称 **「再平衡分发记录」**（禁止叫「再平衡详情」——会与组合域的业务再平衡撞名，见 FS §4.5.3）。
  - 页面内容：顶部汇总（应检 / 到期 / 生成成功 / 失败 + 快照时间 + 刷新）、四维筛选（日期 / 组合 / 状态 / 频率）、逐组合表格（组合 / 计划 / 到期 / 运行态 / 生成结果 / 建议数 / 失败原因 / 操作）。
  - 支持深链参数 `?date= / ?portfolio= / ?status= / ?schedule=`，刷新保持。
- **验收标准**：
  - Given 看板渲染，Then 再平衡为单张卡，内含逐组合 到期/生成/失败 摘要。
  - Given 点击「查看详情」，Then 路由变为 `/logs/rebalance`，面包屑为「日志 / 任务运行看板 / 再平衡分发记录」，「返回」回到看板 tab 且不丢选择状态。
  - Given `?portfolio=<pid>` 直接打开，Then 组合筛选预置为该组合且刷新后保持；非法 pid 回落「全部」并提示。
  - Given 某组合 `status=FAILED`，Then 该行标红并展示 `failures[].category + message`（D6，此路径无数据契约阻塞）。
  - **Given C-05 未落地（父任务 `result` 缺失），Then 页面顶部显示黄条「数据契约未就绪」，并隐藏「到期 / 生成结果 / 建议数」三列；不得用「无记录」推断「未到期」**（D4）。
  - **Given 该日无任何分发记录，Then 显示「该日无再平衡分发记录」+ 两种可能说明 + 「查看任务日志」，不得渲染为绿色「全部正常」**（FS §4.5.5）。
  - **Given 本页渲染完成，Then DOM 与代码中不存在执行 / 撤销 / 重做 / 重跑 控件**（NG6；`grep` 无 mutation hook 引用）。
  - Given 点击行尾「去组合」，Then 跳 `/portfolios/view/<pid>/rebalance?sub=history&record=<recordId>`；`recordId` 缺失时退 `?sub=suggestions`（R11）。
- **依赖**：**C-02 + C-05**（C-05 未落地时按上文降级，可先合入但不可宣称完成）。
- **边界**：只读下钻，不做调度控制（NG1），不含建议明细与执行（NG6/NG7）。**「提醒点击带 `?record=`」的反向入口不在本卡**，见 `FS-portfolio-ia-cleanup` 的 `A16`。
- **命名与容量约束**：本频道**最多只允许这一条子路由**；将来新增第二个详情页前，须重新评估是否独立成「系统健康」导航项。

### C-08 一键下钻到原始日志
- **类型**：前端
- **优先级**：P1
- **关联需求**：R7、US3
- **描述**：卡片「查看日志」跳转到对应任务「任务日志」tab，并带日期/筛选。
- **验收标准**：
  - Given 某任务标黄/红，When 点击「查看日志」，Then 跳转到任务日志 tab 并自动带上该任务最近运行日期与筛选。
- **依赖**：现有任务日志视图（已存在）。
- **边界**：仅导航与参数传递；不新增日志内容。

---

## P2 — Future

### C-09 历史趋势
- **类型**：前端
- **优先级**：P2
- **关联需求**：R8、NG4
- **描述**：多日成功率 / 完成度趋势小图。
- **验收标准**：Given 看板开启历史趋势，Then 展示近 N 日完成度趋势。
- **依赖**：C-02（需多日数据，可能扩展接口）。
- **边界**：v1 不做（NG4）；本卡为 Future。

### C-10 launchDate 缺位治理引导
- **类型**：前端
- **优先级**：P2
- **关联需求**：R9
- **描述**：对 `skippedNoLaunchDate` 资产，提供「去补成立日」引导链接（呼应手册 §3.4）。
- **验收标准**：Given 存在 `skippedNoLaunchDate` 资产，When 看板提示，Then 提供跳转补成立日的引导链接。
- **依赖**：C-02（返回 `skippedNoLaunchDate` 列表）。
- **边界**：仅引导，不在此页编辑（编辑走标的管理）。

---

## 推荐排期顺序（PM 建议，非强制）

1. **批次 1（数据底座 + 骨架）**：**C-05（`TASK-057`）** → C-02（`TASK-054`）→ C-01（`TASK-053`）→ C-03（`TASK-055`）→ C-04（`TASK-056`）。C-05 先行，否则 C-02 只能返回运行态、C-07 三列永远空白。
2. **批次 2（深化）**：C-06 → C-07 → C-08
3. **批次 3（Future）**：C-09 → C-10

> C-05 已由 P1 升级为 **P0**（2026-10-26 实码核查）：`TaskRun` 无 `result` 字段、`normalizeCounts` 白名单、无父级 taskrun、`SKIPPED` 不落库——这四条不解决，看板与详情页都会退化为"运行态展示"，等同把 §3 批判的「全绿误导」换个位置重演。
>
> **并行建议**：C-05 与 `FS-portfolio-ia-cleanup` 的 `A16`（提醒点击带 `?record=`）分属不同文件域（`shared`/`cron-worker` vs `client`），可并行；但 C-07 的「去组合」链接依赖 A16 定义的路由参数，需在 C-07 ExecPlan 中引用 A16 的参数契约。

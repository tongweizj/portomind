# TASK-053 — 日志频道「任务运行看板」tab 骨架（FS C-01）

## Metadata

**所属 Story：** [US-001](../../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)

**覆盖的验收条件：** US-001/AC-01、02、07、10、11（骨架）

**规划核对：** [Planner 回交说明](./US-001-02-planner-return.md)；新增关联不改变本卡 AC、原状态、既有批准或结案结论。

**Status:**  
`Completed`（2026-11-04，Human 确认完成；已通过 PR #41 合入 `main`）。

**Priority:**  
`High`（P0 Must Have。看板是本需求唯一的用户入口：C-03 / C-06 / C-07 全部挂载在它上面，没有骨架其余卡片无处落地）

**Owner:**  
`—`（已结案：Implementer 交付、Reviewer 复检 `Pass with issues`、Human 关闭）。

**Created:**  
`2026-10-26`

**Updated:**  
`2026-11-04`（Human 确认完成并合入 `main`，登记 Completed 与 Merged；原创建日期保留）。

**Type:**  
`Feature`（前端信息架构 / 新 tab 骨架，纯客户端）

**Related Product Spec:**  
`docs/development/requirements/specs/FS-cron-worker-status-board.md`（**C-01 基线**：R1、OQ1、G1、G4、NG6）· `docs/development/requirements/specs/FS-cron-worker-status-board-tasks.md`（§C-01）

**Related ADR:**  
`None`

**Execution Plan:**  
[Completed：TASK-053](./TASK-053-plan.md)（Human 仅批准本卡当前设计；实施、验证与结案记录见计划 §11～§13）

**来源：**  
FS 卡片 `C-01`（PM 拆分，2026-10-26）

---

## 1. 问题

`/logs` 现在是一个**单页原始日志表格**：左侧只有「服务器日志 / 任务日志」两种数据源，用户在几百行 JSON 里人肉翻找线索，才知道"今天价格抓全了没有、汇率更新了没有、有没有组合该再平衡了"。

本卡只做**骨架**：把 `/logs` 从"单页"变成"带置顶看板 tab 的轻量子应用"，让 5 大任务有地方挂载。**不做**任何数据态计算（那是 `TASK-054` / C-02），**不做**状态色定义（`TASK-056` / C-04），**不做**价格完成度展示（`TASK-055` / C-03）。

关键约束（OQ1 + NG6，已在 FS 定稿，本卡不得推翻）：

| 约束 | 内容 |
|---|---|
| OQ1 | 看板作为 `/logs` 内**置顶 tab**，**不动侧栏导航**（延续"不向导航加低频项"原则） |
| G4 | 原「服务器日志」「任务日志」两个原始视图**必须保留可访问**，看板是入口而非替代 |
| NG6 | `/logs` 子树**只读排障，永不放执行动作**（执行 / 撤销 / 重做 / 手动触发 / 编辑阈值一律不出现） |
| OQ5 | 不做自动轮询；打开时拉取一次 + 手动刷新按钮 |

---

## 2. 已核实的代码事实（2026-10-26 亲读）

| 事实 | 落点 |
|---|---|
| 日志页是单文件组件，共 134 行 | `client/src/pages/LogViewer.jsx` |
| tab 现状用局部 state，**不读 URL** | `LogViewer.jsx:6` `const [logType, setLogType] = useState('server')`（取值 `'server'` / `'task'`） |
| 现有筛选条件同样只在内存里 | `:11` `levelFilter`、`:12` `dateFilter`（默认今天，`toLocaleDateString('en-CA')`）、`:8` `page`、`:9` `pageSize=20` |
| 数据来源只有两个原始日志接口 | `:3` `getLogs, getTaskLogs` ← `client/src/services/log.service.js` |
| 路由是**平铺单条**，不是嵌套路由 | `client/src/router.jsx:74` `<Route path="/logs" element={<LogViewer />} />` → 将来加 `/logs/rebalance`（C-07）必须**新增兄弟 Route**，不能靠子路由自动继承 |
| 侧栏「日志」为第 5 项（TASK-050 后共 5 项），本卡**不动** | `client/src/components/layout/Sidebar.jsx` |
| `useMutation` **全仓存在**，但不在本频道 | `grep -rn "useMutation" client/src` → 仅 `hooks/useAlerts.js`（6 行）与 `hooks/useFamily.js`（3 行）；`LogViewer.jsx` 与 `services/log.service.js` 均为 **0 行** → NG6 的检测式**必须限定 `/logs` 子树**，对全仓 `grep` 会误报 |
| 响应封装统一走 `success/failure/pagination` | `server/utils/apiResponse.js`（与本卡无直接关系，但 C-02 需沿用） |

---

## 3. Acceptance Criteria

> 每条都必须**能失败**；期望值取自 FS R1 / C-01 的文字，不从实现反推。

| # | 验收标准 |
|---|---|
| AC1 | 打开 `/logs` → **默认落在「任务运行看板」tab**，且该 tab 在 tab 列表**第一位**；「服务器日志」「任务日志」依次为第二、第三。 |
| AC2 | tab 选择**落 URL**：`?tab=board` / `?tab=server` / `?tab=task` 可直接进入对应 tab；无参数时等价 `?tab=board`。浏览器后退/前进在 tab 间切换正确，刷新保持当前 tab。 |
| AC3 | 顶部总览条**DOM 结构就位**：恰好 **5 个健康灯位**（对应 5 大任务）+ **1 个整体健康徽章** + 1 行数据快照时间文案；数据未接入时 5 灯统一显示「灰 / 未知」态，**不得**默认渲染成绿色。 |
| AC4 | 5 任务卡片网格就位（每张卡有 `任务名 / 上次运行时间 / 运行态徽章 / 数据态进度条位 / 关键数字位 / 异常入口位` 六个区域），数据未接入时各区域显示空态占位文案，**不出现 `undefined` / `NaN` / `Invalid Date`**。 |
| AC5 | **原始视图零回归**：切到「服务器日志」「任务日志」后，分页（上一页/下一页）、级别筛选、日期筛选的行为与本卡改动前**完全一致**（同一组回归断言，改动前后各跑一次对照）。 |
| AC6 | **只读硬约束可验证**：`grep -rn "useMutation" client/src/pages/LogViewer.jsx` 与 `/logs` 子树内所有组件均为 **0 行**；页面 DOM 中不存在「执行再平衡 / 撤销 / 重做 / 手动触发 / 编辑阈值 / 运行一次」这类按钮或链接（负向断言：先塞一个假按钮确认断言能失败）。 |
| AC7 | 接口未就绪（C-02 未合入 / 请求失败）时，看板显示**局部**占位或错误态，**不整页白屏**、不影响两个原始日志 tab 的使用。 |
| AC8 | `npm run build --workspace client` 通过；`cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` **0 error 0 warning**。 |

---

## 4. Scope

**In Scope**

- `client/src/pages/LogViewer.jsx`：tab 结构改造（3 tab，看板置顶）、tab 状态与 URL 双向同步、看板外壳（总览条 + 5 卡网格）布局
- 新增看板相关的前端组件文件（目录与命名由 Planner 在 ExecPlan 中定，建议 `client/src/components/CronStatus/`）
- 保留并包裹现有两个原始日志视图（尽量不改其内部逻辑）

**Out of Scope**

- **不做**任何数据态计算（完成度算法在 `TASK-054` 后端）
- **不做**状态色语义与图例（`TASK-056`）
- **不做**价格 missing 清单展开（`TASK-055`）
- **不走** `/logs/rebalance` 子路由与详情页（`C-07`，未立项）
- **不加**自动轮询（OQ5）
- **不改**侧栏导航项、不改 `/api/logs`、`/api/logs/tasks` 两个既有接口
- **不改** `server/` `shared/` `cron-worker/`（本卡纯客户端）

---

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | **空灯被当成绿灯**：骨架阶段数据未接入，若默认渲染绿色，用户会误以为"全部正常"——这正是 FS §3 批判的"全绿误导" | AC3 强制默认灰/未知；实现在无数据时**不得**给出任何"成功"语义 |
| R-2 | **URL 化 tab 打乱既有深链**：若既有书签指向 `/logs` 并依赖默认 server 视图，默认 tab 改看板会让老习惯失效 | FS OQ1 已明确默认看板为设计意图；在本卡执行计划里登记"默认 tab 变更"为**显式行为变更**，结案说明写出 |
| R-3 | **`/logs/rebalance` 需要第二条 Route**，而 C-01 若把 tab 逻辑写死成"唯一页面"，C-07 会返工 | AC2 用 URL 承载 tab；ExecPlan 中预留"未来兄弟路由"说明，禁止把看板状态塞进全局 store |
| R-4 | **134 行单文件被撑成大文件**：直接往里塞 5 卡网格 + 总览条，会让 `LogViewer.jsx` 变成难以维护的巨型组件 | 拆分到独立组件目录；`LogViewer.jsx` 只保留 tab 编排 |
| R-5 | **只读约束靠人自觉**：`grep` 只能查 `useMutation`，写服务方法（如 `api.post`）同样能破坏只读 | AC6 增加"不得出现 `api.post/put/patch/delete`"的检测式，并在 Review 时人工核 |

---

## 6. Blocking Dependencies

| 编号 | 依赖 | 状态 |
|---|---|---|
| **B1** | Human 批准本卡（范围与优先级） | ✅ 2026-10-30，Human明确批准本卡当前设计，沿用US-001既有范围与High优先级；不含其他任务或D-01～D-04 |
| **B2** | Planner 产出 ExecPlan 并经 Human Plan Review | ✅ 当前计划已由Human批准，Orchestrator代登记Approved；工作区启动条件另见计划§10 |
| **B3** | 独立 Reviewer 复核（Reviewer ≠ Implementer） | ✅ 2026-10-31 首轮 `Fail`（F-01/F-02）→ 修复后复检 `Pass with issues`（计划 §12.9） |
| B4 | `TASK-054`（`GET /api/cron/status`） | ✅ **不阻塞本卡**：骨架以空态/占位渲染，接口合入后填色即可（AC7 卡住"不能白屏"）。**2026-10-27 更新**：接口已在 `TASK-054` 实现完成（分支 `c7389d1`，**未合入 `main`**），本卡仍可按空态开发 |

> **2026-11-04 更新**：以上依赖已全部解除，本卡已结案。原「缺独立 feature 实施工作区」的注记已过时——实施在 `feature/TASK-053` 分支完成，并已通过 PR #41 合入 `main`（`ecd9314`）。B4 的分支叙述为 2026-10-27 历史记录，不改 054 的既有完成与合入登记。

---

## 7. Coordination Notes

- **同批顺序（PM 建议）**：`C-05`（数据契约，**尚未立项**）→ `TASK-054`（C-02 接口）→ **本卡（C-01）** → `TASK-055`（C-03）→ `TASK-056`（C-04）。但本卡与 `TASK-056` 均可**先行**（无数据依赖），适合在接口未就绪时并行推进。
- **与 `TASK-055` / `TASK-056` 的边界**：本卡只交付"六个区域的位置"；颜色由 056 定义、完成度数值由 055 填。三卡的 AC 不得互相覆盖同一断言。
- **与 `C-07`（未立项）的接口**：本卡产出的 tab URL 参数名（`tab`）会被 C-07 的「返回看板」复用，ExecPlan 中需**显式冻结参数名**，避免 C-07 返工。
- 本卡**不登记**任何服务端字段契约；接口形状属 `TASK-054`。

---

## 8. 本卡未做的事

以下为2026-10-26建卡时的历史快照，不是本轮状态或角色权限；当前计划、Owner与启动核对以Metadata及计划§10为准。

- 未改动任何代码、未创建 ExecPlan（属 Planner）、未指派 Owner（属 Human）。
- 未把 FS 的 5 个任务名/字段名当作实现事实——已与源码对账，结论见 `TASK-054` §2（其中 3 处 FS 与实现口径不一致）。

## Orchestrator 接收记录

2026-10-30：按 Human 本轮接收 US-001 规划并提交 Draft 审阅的指令、Story 既有 High 优先级及 STATES.md §4，接收本卡规划，将原 BACKLOG 登记为 Planning。原 AC、Scope 与技术待决项不变；旧依赖表中的排期和分支描述为当时记录，当前授权核对见 [Orchestrator 审阅清单](./US-001-02-planner-return.md#7-orchestrator-接收与-human-审阅清单)。此登记只推进规划阶段，不批准计划、不宣布实施开工；Owner 仍待指派。

## Orchestrator 启动核对记录

2026-10-30，随后 Human 明确批准 TASK-053 当前 Draft，且限定不含其他任务或D-01～D-04。Orchestrator依据该决定将计划登记为Approved，已核对真实源码、基线、范围、依赖与验证入口；本轮没有修改设计、AC、Scope或业务代码。当前尚缺独立的feature/TASK-053实施工作区，按Human本轮要求保持Planning及Owner待指派，不登记Implementing、不宣布交接已派发。完整事实与剩余动作唯一记录在 [计划 §10](./TASK-053-plan.md#10-implementer-handoff)。

## Reviewer 结论

**2026-10-31（首轮）· Fail**：AC5 不满足（F-02 MAJOR：筛选条件跨视图切换被重置），且存在交付阻断（F-01 BLOCKER：`client/src/components/Logs/RawLogView.jsx` 被 `client/.gitignore` 的 `logs` 规则忽略、无法入库）。详见 [计划 §12 审查记录](./TASK-053-plan.md#12-review-record)。本结论不改 AC / Scope / Status，交 Orchestrator 处理返工。

**2026-10-31（复检）· Pass with issues**：F-01（BLOCKER）与 F-02（MAJOR）均已修复并独立复验通过（见 [计划 §12.9 复检记录](./TASK-053-plan.md#12-review-record)）。残余 MINOR：F-03（计划 §10.4 文档缺口，待 Orchestrator 决策）、F-04（验收脚本未纳入 `npm test`，check:ignored 已接入）、F-05（真实数据脚本自污染，已加头部说明）；新增工作树卫生项 F-06（残留 `nul` 文件）、F-07（越界未提交改动：TASK-056 / BOARD）、F-08（根配置改动：package.json / .gitignore）。本结论不改 AC / Scope / Status / 合入状态。

## Orchestrator 正式实施交接

2026-10-30继续启动：已从main基线准备独立feature/TASK-053工作区，离线安装依赖并核对工具入口与干净状态。此前工作区缺口已解除，沿用原Human批准，登记Task为Implementing，Owner为Implementer；正式输入、绝对路径、边界与回交要求唯一见 [计划 §10](./TASK-053-plan.md#10-implementer-handoff)。未修改AC或Scope，未开始业务代码或应用验证；计划仍Approved，待Implementer实际开始后按权限推进。

> **2026-11-04 更正**：上段原引用「计划 §10.4 工作区就绪与正式实施交接」，但该节**从未存在**（计划仅有 §10.1–§10.3）。此处改为指向实际存在的 [§10 Implementer Handoff](./TASK-053-plan.md#10-implementer-handoff)。F-03 关闭。

## Orchestrator 状态登记记录（2026-10-31）

依据 [STATES.md §4](../../../../os/process/STATES.md#4-谁可以改变状态)：「Task → Reviewing：Implementer 提供改动清单、自测证据、可审对象和已知妥协」。上述三项均已具备，故登记 `Implementing` → `Reviewing`。

**登记依据（本轮只读核对，不重跑验证）**

| 项 | 事实 |
|---|---|
| 分支 / 基线 | `feature/TASK-053` @ `6e013d7`（= 本地 `main`）；分支已存在，工作区即实施目录 |
| 交付清单 | 修改 2（`LogViewer.jsx`、`.gitignore`）+ 新增 10（`logTabs.js`、`CronStatus/` 4 文件、`RawLog/RawLogView.jsx`、4 个验收脚本、`scripts/check-ignored-sources.cjs`） |
| 自测证据 | 计划 §11.3 / §11.8：`e2e-task-053-verify.cjs` **33/33 PASS**；`e2e-task-053-f02.cjs` **7/7 PASS**；build exit 0；eslint 0-0（97 文件）；`check:ignored` PASS |
| 审查结论 | 首轮 §12.7 `Fail`（F-01 BLOCKER / F-02 MAJOR）→ 修复后 §12.9 复检 **`Pass with issues`**，无未整改 BLOCKER/MAJOR |
| 已知妥协 | 计划 §11.6 / §12.6：生产包未跑浏览器 E2E、移动端窄屏与跨时区未验、验收脚本未纳入 `npm test` |

**本轮未做的事（边界）**

- 未重跑 build / lint / 浏览器 / 测试——同基线同一交付已有独立复验证据，按「复用有效证据」原则引用，不因登记状态重复执行。
- 未修改 AC、Scope、业务代码或任何设计。
- 未 `git add` / `commit` / `push`；**交付仍是工作区未提交改动**（`git log main..HEAD` 为空），本卡不代为提交。
- 未登记 `Completed`，未关闭 Task 或 Story；**未填写 `Merged`**（仅 Human 可判）。

### 提交记录（2026-10-31，Human 指示）

Human 指示「053 已经完成，请帮提交」。本轮执行 `git add -A` + `git commit`：

| 项 | 事实 |
|---|---|
| 提交 | `c858521` `feat(logs): add task-run board tab skeleton (TASK-053)` |
| 分支 / 基线 | `feature/TASK-053`，父提交 `6e013d7`（= `main`） |
| 改动规模 | **17 文件**，+2035 / −129（新增 11、修改 6） |
| 范围核对 | 无 `server/` `shared/` `cron-worker/` 改动；无 TASK-056 文件；无 `nul` / 临时树 |
| 工作区 | 提交后 `git status --porcelain` **空** |

**提交后复验**（此前交付仅为工作区改动，F-01 的实质风险是「提交后是否还能构建」——被 gitignore 的文件本地存在但不会入库）：

| 验证 | 结果 |
|---|---|
| `git ls-tree -r HEAD \| grep RawLog/RawLogView.jsx` | 命中 **1** → F-01 关闭 |
| `npm run build --workspace client` | **exit 0 / 2429 modules**（2.83s） |
| `eslint "src/**/*.{js,jsx}"` | **0 error / 0 warning** |
| `npm run check:ignored` | **PASS** |

**未做**：未 `git push`、未合入 `main`、未填 `Merged`、未登记 `Completed`、未关闭 Task / Story。这些仍归 Human。

**遗留待决策（不阻塞本次登记）**

- **F-03**：卡片 §Metadata「Execution Plan」与「Orchestrator 正式实施交接」共 3 处引用「计划 §10.4」，但计划只有 §10.1–§10.3，从未存在 §10.4。属文档记录缺口，待 Orchestrator 决定补写或修正引用（本轮未动，避免与 053 交付混在一起）。
- **F-06**：工作树残留 `nul` —— 本轮核对已不存在，视为已清理。
- **F-07**：TASK-056 与 BOARD 的改动曾出现在同一工作树；**本轮核对：这些改动已不在工作区**（详见下方报告）。
- **F-08**：根 `package.json` 加 `check:ignored`、`.gitignore` 登记 `client/.tmp-053-before/`，属 F-01 修复的配套防复发，记录为良性偏差。
- **F-04 / F-05**：验收脚本依赖本机 Chrome 与 `playwright-core`；真实数据对照脚本会自污染。均记录为残余风险。

## 完成记录（2026-11-04）

Human 确认「053 任务已经完成了」，指示更新各文档状态。核对后登记结案。

| 项 | 事实 |
|---|---|
| 结案日期 | 2026-11-04 |
| 合入 | **PR #41**，merge commit `ecd9314`（`feature/TASK-053` → `main`） |
| 实现提交 | `c858521`（17 文件，+2035/−129）+ `1fd699a`（文档同步） |
| 合入核对 | `git merge-base --is-ancestor c858521 main` = **是**；`main` 上 `CronStatus/` 与 `RawLog/` 共 5 个文件在位 |
| 审查 | 首轮 `Fail`（F-01 BLOCKER / F-02 MAJOR）→ 修复后复检 `Pass with issues`，无未整改 BLOCKER/MAJOR |
| DoD | T-1 实现完成 ✅ / T-2 验证完成 ✅ / T-3 AC 逐条满足 ✅ / T-4 审查收敛 ✅ / T-5 文档同步 ✅ / T-6 已知妥协已记录 ✅（见计划 §11.6、§12.6） |
| Status | `Reviewing` → **`Completed`** |
| Merged | **`Merged` #41** |

**已同步的文档**

- 本卡：Status / Owner / Updated / Execution Plan 指针 / §6 依赖表
- [TASK-053-plan.md](./TASK-053-plan.md)：Status → `Completed`，§13 Completion Record 填入结案依据
- [BOARD.md](../../../../BOARD.md)：下挂 Task 表、当前 Story 行、历史完成 Task 表、进度汇总
- [US-001 故事卡](../../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)：053 行的状态与「当前下一步」
- [TASK-055](./TASK-055.md) B5：硬前置已解除
- [handbook/manual/CLIENT.md](../../../../handbook/manual/CLIENT.md) §3.7：日志章节补看板说明

**遗留（不阻塞结案，已记录）**

- **F-03**：计划 §10.4 引用缺口。**本次已顺带修正卡片 2 处失效引用**（改为指向实际存在的 §10.3 / §12.9）；计划文件内仍保留对该缺口的说明文字，属历史记录，不再修改。
- **F-04 / F-05 / F-08**：验收脚本依赖本机 Chrome、真实数据脚本自污染、根配置配套改动，均为残余 MINOR，已记录在案。
- 生产构建产物未跑浏览器 E2E、移动端窄屏与跨时区未验——已在计划 §11.6 如实登记，不因结案而消失。

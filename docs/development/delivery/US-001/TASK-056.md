# TASK-056 — 看板系统状态色语义与图例（FS C-04）

## Metadata

**所属 Story：** [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)

**覆盖的验收条件：** US-001/AC-02、09

**规划核对：** [Planner 回交说明](./US-001-02-planner-return.md)；新增关联不改变本卡 AC、原状态、既有批准或结案结论。

**Status:**  
`Planning`（2026-10-30，Orchestrator 已接收规划并提交 Human 审阅；Draft 未批准，未获业务代码实施授权）。

**Priority:**  
`High`（P0 Must Have。它是看板"能不能被正确读懂"的前提：本项目行情页是**红涨绿跌**，看板是**红坏绿好**，两套语义在同一产品里并存，没有显式隔离必然误读）

**Owner:**  
`待指派`（本轮仅接收规划，未指派实施者或独立 Reviewer）。

**Created:**  
`2026-10-26`

**Updated:**  
`2026-10-30`（Orchestrator接收规划，更新Status及Owner；原创建日期保留）。

**Type:**  
`Feature`（前端视觉语义 / design token）

**Related Product Spec:**  
`docs/development/requirements/specs/FS-cron-worker-status-board.md`（**C-04 基线**：R4、§3 颜色语义表、NG6）· `docs/development/requirements/specs/FS-cron-worker-status-board-tasks.md`（§C-04）

**Related ADR:**  
`None`

**Execution Plan:**  
[Draft：TASK-056](./TASK-056-plan.md)（未批准；以本次规划与原卡约束共同核对，不构成实施授权）

**来源：**  
FS 卡片 `C-04`（PM 拆分，2026-10-26）

---

## 1. 问题

FS §3 给看板定义了 4 种系统状态色：**绿 = 成功/完成/数据齐、黄 = 部分/需关注、红 = 失败/缺数据、灰 = 跳过/未跑/无数据**，并明确警告：

> ⚠️ 与本项目价格"红涨绿跌"惯例**严格区分**：此处红=坏、绿=好，是系统状态通用语义。

当前 `design-tokens.js` **没有**系统状态四色，只有：

| 现有 token | 值 | 语义 |
|---|---|---|
| `up` | `#DF1B41` | A 股**涨红**（好） |
| `down` | `#0E9F6E` | A 股**跌绿**（坏） |
| `warn` | `#F5A524` | 警告黄 |
| `danger` | `#E0254B` | 危险红 |

也就是说：**同一个红色，在行情页表示"涨了是好事"，在看板表示"坏了"；同一个绿色则完全相反。** 若不新建独立 token 而直接复用 `up`/`down`，代码里会出现 `color={colors.down}` 表示"健康"这种读起来自相矛盾的写法，日后维护必然出错。

---

## 2. 已核实的代码事实（2026-10-26 亲读）

| 事实 | 落点 |
|---|---|
| token 文件只有颜色/圆角/字体/布局四组导出 | `client/src/constants/design-tokens.js`（`colors` / `radii` / `fontStack` / `layout`） |
| 状态色只有 `warn` / `danger`，**没有**"成功绿"与"跳过灰" | `design-tokens.js:29-31` |
| `up` / `down` 的注释明确写"A 股 涨红 / 跌绿"，是**行情语义** | `design-tokens.js:27-28` |
| `up` / `down` 的消费方：`Asset/AssetDetail.jsx:38,60`、`Asset/AssetList.jsx:20`、`Portfolio/KpiCards.jsx:69-71`、`Portfolio/PositionOverview.jsx:249`、`utils/priceDisplay.js:156,171,189` | `grep -rn "colors.up\|colors.down" client/src` |
| ⚠️ **红色在行情页已被复用为两种语义**：`fmtChange()` 里 `colors.up` 表示"涨"（好），而 `fmtPriceGap()` 里同一个 `colors.up` 表示"缺口"（坏） | `client/src/utils/priceDisplay.js:156,171`（缺口标红）vs `:189`（涨标红）→ 这正是必须新建独立状态 token 的直接证据 |
| 项目当前只有浅色主题（无 dark mode 开关） | `client/src/index.css` / `AppLayout`（无 theme 切换实现） |
| Tailwind v4 会把颜色编译为 `oklch()`，**断言不能硬编码 hex 或 rgb 串** | 既有审查经验（TASK-048 §13）：须注入参照片取 `getComputedStyle` |
| 主色与浅紫：`brand #635BFF` / `brandSurface #EEEDFF`；边框 `#E3E8EE`（线框与设计稿对齐口径） | `design-tokens.js:20-25`、FS §4.6 |

---

## 3. Acceptance Criteria

> 期望值取自 FS §3 的颜色语义表与 R4 的验收文字，**不得**从"好看"反推。

| # | 验收标准 |
|---|---|
| AC1 | `design-tokens.js` 新增 **4 个系统状态 token**，命名体现"系统状态"而非"涨跌"（如 `statusOk / statusWarn / statusBad / statusIdle`，最终名由 ExecPlan 冻结）；**不得**新增或复用 `up` / `down` 表达系统状态。 |
| AC2 | 语义映射可验证：**绿 = 达标**、**黄 = 部分/需关注**、**红 = 失败/缺数据**、**灰 = 跳过/未跑/无数据**。构造 4 个样本各渲染一次，断言取到的计算色分别等于 4 个 token（用页面内参照片取 `getComputedStyle`，**不硬编码 hex / rgb / oklch 串**）。 |
| AC3 | 看板子树**零引用**行情语义 token：`grep -rn "colors\.up\|colors\.down\|text-red-500\|text-emerald-500" client/src/components/CronStatus/`（目录以 ExecPlan 为准）→ **0 行**；负向对照：故意塞一行 `colors.down` 确认断言能失败。 |
| AC4 | 看板含**状态色图例**，且文案显式说明"此处**红=坏、绿=好**，与行情页红涨绿跌无关"；图例在首屏可见（不需要滚动才看到）。 |
| AC5 | **不只靠颜色**：4 种状态各自还带**文字**或**图标**区分（色盲可辨）。断言：把页面截图转灰度后仍能区分 4 类（以"每条状态都含非颜色标识符"的 DOM 断言替代截图，如文本含"正常/需关注/失败/未运行"之一）。 |
| AC6 | **灰 ≠ 正常**：`idle` 态不得出现在"数据齐全"的语义位置；构造"无 taskrun"场景，断言卡片为灰且文案为"暂无记录/未运行"，**不出现**"正常/全部良好"。 |
| AC7 | 对比度：4 个 token 作为**文字色**在 `bgCard #FFFFFF` 上的对比度 ≥ **4.5:1**（若某色只能做背景/徽章底，则在 AC 中注明其搭配的前景色并给出实测对比度值）；实测值写进 ExecPlan，不用"看起来够深"。 |
| AC8 | 不破坏既有页面：`grep -rn "colors.up\|colors.down" client/src` 的**消费方集合**在本卡前后**完全相同**（行情页配色零改动）。 |
| AC9 | `npm run build --workspace client` 通过；`cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` **0 error 0 warning**。 |

---

## 4. Scope

**In Scope**

- `client/src/constants/design-tokens.js`：新增 4 个系统状态 token（只加不改，`up` / `down` / `warn` / `danger` 保持原语义）
- 看板的状态色使用规范与图例组件（位置由 `TASK-053` 的骨架决定）
- 一份可复用的"状态 → token"映射（如 `STATUS_TONE` 常量），供 `TASK-055` 与后续卡片统一引用

**Out of Scope**

- **不改**行情页 / 持仓页 / KPI 卡的任何配色
- **不做**暗色主题
- **不做**看板的数据与布局（`TASK-053` / `TASK-054` / `TASK-055`）
- **不做**动画 / 过渡特效
- 不引入新的 CSS 框架或图表库

---

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | **复用 `down` 绿做"健康"**：色值恰好都是绿，最省事的写法就是直接用，但代码语义会长期误导 | AC1 + AC3 双重卡住；允许**色值相同**，但命名必须独立 |
| R-2 | **图例被当成装饰**：图例塞在页面底部，用户永远看不到 | AC4 要求首屏可见；ExecPlan 需给具体位置（建议总览条右侧或卡片网格上方一行） |
| R-3 | **颜色断言写死色值**：Tailwind v4 输出 `oklch()`，硬编码 `rgb()` 会全红（TASK-048 已踩过） | AC2 明确用"页面内参照片 + `getComputedStyle`"的取色方式 |
| R-4 | **黄与橙难区分**：`warn #F5A524` 偏橙，与 `danger #E0254B` 在小面积圆点上区分度低 | AC6 的"非颜色标识"是主要兜底；ExecPlan 需给出圆点最小尺寸 |
| R-5 | **状态色被后续任务扩散使用**：一旦进了 token，其他页面可能拿它表示别的东西（如"库存不足"） | 在图例组件与 token 注释里写死"仅用于系统健康状态"，Review 时检查新增消费方 |
| R-6 | **`idle` 灰与禁用态混淆**：灰色按钮/禁用文本已存在 | AC6 限定灰只用于"跳过/未跑/无数据"；ExecPlan 可要求灰配虚线边框或"未运行"文案 |

---

## 6. Blocking Dependencies

| 编号 | 依赖 | 状态 |
|---|---|---|
| **B1** | Human 批准本卡 | ⏳ 待排期 |
| **B2** | Planner 产出 ExecPlan（**须先冻结 token 命名**，因 `TASK-055` AC2 要引用） | ⏳ 阻塞 |
| **B3** | 独立 Reviewer 复核 | ⏳ 交付时 |
| B4 | `TASK-053`（看板骨架） | ⚠️ 弱依赖：token 与图例组件可先做，但**合入验收**需要骨架存在才能断言"首屏可见" |

---

## 7. Coordination Notes

- **本卡是全批次的"命名源头"**：`TASK-055` AC2 与本卡 AC1 直接耦合 → 建议**本卡与 `TASK-053` 先行**（两者都无数据依赖），把 token 名冻结后，`TASK-054`/`TASK-055` 再跟进。
- **与 `TASK-050`（已结案）的分红配色**：那里用的是 `bg-red-50` / `bg-emerald-50`（买/卖语义），与本卡无关，**不得**顺手统一——那会改动已验收的页面。
- **与 `TASK-048`（已结案）的单一来源教训**：token 与映射只允许一处定义（本卡），后续卡片**只能引用**；检测式可加 `grep -rn "#0E9F6E\|#DF1B41" client/src/components/CronStatus/` → 0 行。

---

## 8. 本卡未做的事

- 未改动任何代码、未创建 ExecPlan、未指派 Owner。
- 未确定具体色值——只确定**语义与约束**；色值由 Planner 在 ExecPlan 中给出候选并在 Plan Review 时由 Human 拍板（可复用现有 `warn` / `danger` 的色值，但必须新命名）。

## Orchestrator 接收记录

2026-10-30：按 Human 本轮接收 US-001 规划并提交 Draft 审阅的指令、Story 既有 High 优先级及 STATES.md §4，接收本卡规划，将原 BACKLOG 登记为 Planning。原 AC、Scope 与技术待决项不变；旧依赖表中的排期和分支描述为当时记录，当前授权核对见 [Orchestrator 审阅清单](./US-001-02-planner-return.md#7-orchestrator-接收与-human-审阅清单)。此登记只推进规划阶段，不批准计划、不宣布实施开工；Owner 仍待指派。

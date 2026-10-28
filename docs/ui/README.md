# docs/ui — PortoMind Web 设计稿本地存档

Ardot 设计文件《PortoMind 投资组合管理工具 Web 设计稿》的本地快照，供评审、比对与离线查看。

- **设计源**：Ardot 画布 `https://ardot.tencent.com/file/718734137758145`（MCP server `ardot-remote`）
- **画板规格**：1440×900 逻辑像素；PNG 按 2× 导出
- **导出时间**：2026-10-26（本轮投资组合改版后）
- **需求依据**：[FS-portfolio-ia-cleanup](../product/specs/FS-portfolio-ia-cleanup.md)（交付单元 A + B）、[PL-3](../product/lines/PL-3-portfolio.md) `CM-12`

---

## 1. 文件清单

### 1.1 屏（`screens/`）

| 文件 | 画板名 | Ardot 节点 | 对应路由 | 本轮状态 |
|---|---|---|---|---|
| `01-dashboard.png` | `Screen/Dashboard` | `29:237` | `/` | **新建**（家庭总览） |
| `02-dashboard-welcome.png` | `Screen/Dashboard-Welcome` | `3:179` | — | 原稿，改名保留 |
| `03-portfolio-list.png` | `Screen/PortfolioList` | `3:252` | `/portfolios` | **改造** |
| `04-portfolio-overview.png` | `Screen/PortfolioOverview` | `29:1` | `/portfolios/view/:id/overview` | **新建** |
| `05-portfolio-detail.png` | `Screen/PortfolioDetail` | `3:396` | `/portfolios/view/:id/positions` | **改造** |
| `06-rebalance.png` | `Screen/Rebalance` | `3:532` | `/portfolios/view/:id/rebalance` | **改造** |
| `07-transactions.png` | `Screen/Transactions` | `3:713` | `/transactions` | 原稿未改 |
| `08-asset-management.png` | `Screen-资产管理` | `3:823` | `/assets` | 原稿未改 |
| `09-price-history.png` | `Screen-价格历史` | `3:963` | `/prices` | 原稿未改 |

> `02-dashboard-welcome.png` 是改造前的原始首页（欢迎横幅 + 核心能力 4 卡 + 推荐流程 5 步）。改为家庭总览时**保留了它**，用于对比与回退，不是重复屏。

### 1.2 组件（`components/`）

| 文件 | 画板名 | 节点 |
|---|---|---|
| `sidebar.png` | `Component/Sidebar` | `3:142` |
| `topbar.png` | `Component/Topbar` | `3:171` |

### 1.3 合集

| 文件 | 说明 |
|---|---|
| `PortoMind-设计稿全屏.pdf` | 全部 9 屏合并 PDF（9 页）。Ardot 导出顺序为「自上而下、自左而右」，两个新建屏（`29:1`、`29:237`）位于画布下方，故排在 PDF 末两页 |

---

## 2. 本轮改动

### 2.1 交付单元 A — 组合详情 IA 收尾

| FS 条目 | 设计稿落点 |
|---|---|
| A1 五 Tab | `05` / `04` 的 Tab 行为 **总览 / 持仓概览 / 持仓历史 / 再平衡 / 交易记录** |
| A2 新增总览 | `04-portfolio-overview.png`：KPI 4 卡 → 目标 vs 实际表 → 触发原因行 → 最近一次再平衡 → 再平衡配置折叠区 |
| A5 KPI 四卡 | **持仓总市值 / 未实现盈亏 / 持有资产 / 再平衡状态**；「今日盈亏」固定空位已删除（四态文案示例：`4 项超阈` + `已到期 · 60 天未调仓`） |
| A7 配置折叠 | 总览底部「▸ 再平衡配置」只读摘要 + 「编辑」 |
| A8 子 Tab 3→2 | `06` 顶部 Segmented Control：**再平衡建议 / 再平衡历史**；`settings` 子 Tab 取消 |
| A9 删除入口 | `05` / `04` 的 Header「⋯」按钮（下一步展开菜单 → 「删除组合」→ 输入组合名二次确认） |
| A8 阈值移出 | `06` 的「触发阈值」卡改为**只读摘要 + 「编辑配置 →」**，开关已移除（编辑落在总览配置区） |

### 2.2 交付单元 B — Dashboard 组合健康表

| FS 条目 | 设计稿落点 |
|---|---|
| B6 分币种小计 | `01` 总资产卡内 `CNY ¥862,300 · US$18,400 · CAD $52,100 · HKD —` |
| B7 组合健康表 | `01` 5 列 3 行：组合 / 市值 / 偏离 / 待办 / 上次再平衡；按「有事的在上」排序 |
| B14 待处理提醒 | `01` 保留事件列表（3 条示例） |

### 2.3 组合列表卡片（PL-3 `CM-12`）

`03` 每张卡新增漂移徽标（偏离超阈 / 配置正常 / 未设目标），元信息四格改为 **总市值 / 持仓资产 / 待办 / 上次再平衡**；顺带修掉了原稿「新建卡与内容卡不等高」。

### 2.4 全稿一致性修正

- `01` 的 Sidebar 原在**右侧**（与其余 6 屏相反），已移到左侧。
- `05` 的持仓表原本超出 900 画板（分页被裁），已压缩间距使其完整可见。

---

## 3. 设计 token

以 `client/src/constants/design-tokens.js` 为准，设计稿与实现同源：

| 组 | 值 |
|---|---|
| 主色 / 浅色面 | `#635BFF` / `#EEEDFF` |
| 边框 | `#E3E8EE`（表头分隔）、`#F1F3F7`（行分隔） |
| 文本 | 主 `#0A2540` / 次 `#5E6B7E` / 弱 `#8A95A5` |
| 涨跌（A 股口径） | 涨 `#DF1B41` / 跌 `#0E9F6E` |
| 警示 | 琥珀 `#F5A524`（数字）/ `#B26A00`（文字）/ 底 `#FEF6E7` |
| 货币符号 | `¥` / `US$` / `CA$`（与 `utils/priceDisplay.js` 的 `formatMoney` 一致） |

---

## 4. 设计稿 ≠ 现状：使用前必读

设计稿表达的是 **FS 批准后的目标态**，不是当前实现。以下几处与今天代码不一致，评审时不要当成缺陷：

| 项 | 设计稿 | 今天代码 |
|---|---|---|
| 组合名 | 长期投资组合 / 稳健理财 / 活钱管理 | CN-稳钱 / CN-长钱 / CA-长钱（**示例名全稿统一，落地时替换**） |
| 「最近再平衡」Chip | 显示 `2026-08-12` | `portfolio.lastRebalanceAt` 字段不存在，Chip 恒「暂无」；需 B1 回传 `lastExecutedAt` 后才生效（FS `A10`：B1 前该 Chip 应隐藏） |
| 总览「目标 vs 实际」 | 有数据 | 需一次 `POST /:id/rebalance/check`；`actualRatios` 不含 target，前端禁止自算 |
| 健康表「待办 / 上次再平衡」 | 有数据 | 依赖 `summary` 新增 `pendingRebalanceCount` / `lastExecutedAt`（B1–B3） |
| 详情 KPI 货币符号 | 随组合币种 | `KpiCards.jsx` 现硬编码 `USD`（A6 待改） |
| 组合列表家庭汇总 | 未画 | TASK-050 已有 4 块家庭汇总；FS 明确 `/portfolios` 已到容量上限，**本轮不补**，后续应迁出而非新增 |

---

## 5. 重新导出

设计稿改动后，按下述方式刷新本目录（`<nodeId>` 见 §1.1）：

```
export_nodes(fileUrl: https://ardot.tencent.com/file/718734137758145,
             nodeIds: [<nodeId>, ...], format: "png", scale: 2)
export_nodes(..., format: "pdf", nodeIds: [全部 9 个 Frame])
```

单次 PNG 批量建议 ≤5 个节点；PDF 只取 Frame 节点，可用 `pdf` 一次合并全稿。

---

## 6. 2.0 交互原型（可走通）

> `1.0/` 是 **Ardot 视觉稿**（静态、管视觉）；`2.0/` 是 **HTML 交互原型**（管行为）。两者冲突时以需求为准，并回改原型。

| 文件 | 角色 | 说明 |
|---|---|---|
| `2.0/portomind-prototype.html` | **唯一可走通原型** | 全量产品（PL-1~PL-6 前端）+ 账号与访问控制三屏 + `/logs` 任务运行看板，单文件、零依赖、hash 路由、内存 mock。侧栏 5 项，账户唯一入口 = 顶栏头像下拉 |
| `2.0/portomind-auth-prototype.html` | **已退役**（2026-10-27） | 曾独立承载登录 / 账户 / 系统设置三屏，现整体并入上一行；本文件退为跳转壳，仅保留路径兼容（TASK-060、`FS-authentication` §13 曾引用） |
| `2.0/_audit.cjs` | 断言脚本（**48 条**） | TASK-059 组合 IA 整改（二轮扩至 48 条：新增 V-1a/V-1b/V-2/V-4/V-5/VI-1/VI-2/VI-3/VI-6/VI-23/N-2，全部断言**渲染结果**）；`node _audit.cjs`，有 FAIL 则退出码 1 |
| `2.0/_audit-auth.cjs` | 断言脚本（**59 条**） | TASK-060 用户模块整改；合并后只对准主原型 |
| `2.0/_audit-cron-board.cjs` | 断言脚本（**44 条**） | TASK-061 `/logs` 任务运行看板（AC1~AC11 + OQ8 深链 + 只读负向对照） |
| `2.0/_audit-cron-f13.cjs` | 断言脚本（**23 条**） | TASK-061 的 F1~F3 专项修复（核心是「从 FAILED 行点进原始日志仍是 FAILED」的回归钉死） |
| `2.0/_audit/`·`2.0/_audit-auth/`·`2.0/_audit-cron/` | 截图基线 + `assertions.json` | 每次跑脚本刷新 |

**演示登录态**：主原型 `S.session` 默认带一个 admin 演示会话——否则打开文件即被拦到登录页，全产品走查与 TASK-059 的断言会全部失效。守卫逻辑本身是完整的（退出登录后深链会真实重定向），**落地实现时不得保留这个默认会话**。

**data-demo**：登录页演示注记、预填账号、`USERS` 明文口令等节点均带 `data-demo="1"`，落地时按标记**全量剔除**（不是条件渲染），剔除后应 0 处残留。


# TASK-061 — 2.0 原型「日志」频道实现 cron 运行看板（对齐 FS-cron-worker-status-board）

## Metadata

**Status:**  
`COMPLETED`（2026-10-27）
`FIXES APPLIED`（F1~F3 已修，15:12）→ **按 §11.4 预授权结案**：F1~F3 由执行方修复并写专项脚本 `_audit-cron-f13.cjs`（23/23），Reviewer 脚本 `_audit-cron-board.cjs` 原样重跑 **44/44**，回归 `_audit.cjs` 48/48 + `_audit-auth.cjs` 59/59 —— 三项独立证据齐备，未再开一轮复核。`F4`（Human 裁决「更彻底」）已落实；`F5`（资产基数三处）与 `F6`（卡内行号漂移）为记录项，不阻断。完成记录见 §13。

**Priority:**  
`High`（P0 Must Have 的可视化落地；是 `FS-cron-worker-status-board` 在原型层的唯一入口，下游 C-03/C-06/C-07 行为均挂载其上）

**Owner:**  
`UI Agent`（待指派；Human 派单后由 UI agent 落实，独立 Reviewer 复核）

**Created:**  
`2026-10-27`

**Type:**  
`UI / Prototype`（只改 `docs/development/prototypes/2.0/portomind-prototype.html`，不碰 `client/ server/ shared/ cron-worker/`）

**Related Product Spec:**  
`docs/development/requirements/specs/FS-cron-worker-status-board.md`（本卡的设计权威来源；本卡 §2 为其浓缩版"设计意图"）· `docs/development/requirements/specs/FS-cron-worker-status-board-tasks.md`（C-01~C-10 卡片）

**Related Engineering Cards（真实 client 实现，行为须与之一致）：**  
`TASK-053`（看板 tab 骨架 / C-01）· `TASK-055`（价格数据态 / C-03）· `TASK-056`（状态色语义 / C-04）· `TASK-057`（数据契约 / C-05）· `TASK-054`（后端聚合接口 / C-02，已完成，分支未合 main）

**来源：**  
PM 对 `docs/development/prototypes/2.0/portomind-prototype.html` 的「日志」栏目（`vLogs`，约 L1948–1981）做的合规核对，结论"不符合设计"，本卡即整改清单。

---

## 1. 一句话目标

把 2.0 原型 `/logs` 频道从"两个原始日志 tab"升级为**带「任务运行看板」置顶 tab 的监控视图**：一眼看 cron-worker 5 大定时任务的**数据态完成度**（不是只看 `status` 绿灯）。其余两个原始视图改名保留。

> 这是**设计原型（HTML mockup）**层面的落地；真实 `client/src` 的实现由 `TASK-053/054/055/056/057` 跟踪。本卡与那些卡**行为必须一致**，但落点在原型文件。

---

## 2. 设计意图（浓缩自 FS，UI agent 必读"为什么"）

### 2.1 灵魂铁律：运行态 ≠ 数据态
系统已知缺陷：**任务 `status=SUCCEEDED` 不代表数据真的到位**（如价格同步 03:00 写的是前一交易日价、单日失败即永久丢失；完整性检查每天 SUCCEEDED 但 ok=0/44）。  
→ **看板完成度的主信号必须是"数据态"派生指标，绝不取信 `status` 单字段。** `status` 只作"运行态"辅助解释"为什么数据态没达标"。

### 2.2 已裁决的 8 个 OQ（直接约束本卡）
| OQ | 裁决 | 对本卡的影响 |
|---|---|---|
| OQ1 | 看板作 `/logs` 内**置顶 tab**，**不动侧栏导航** | 侧栏「日志」项不动（L372 `nav-logs`）；只在 `vLogs` 内加 tab |
| OQ2 | 价格"目标市场日" = **上一开市日**（非今天） | 价格卡写"目标 2026-10-25（上一开市日）"，不是写运行日 2026-10-26 |
| OQ3 | 必须改 cron-worker 落库 `result`（数据契约前置） | 原型用 mock 模拟"已有 result"；真实依赖 `TASK-057` |
| OQ4 | 再平衡聚合为 1 张卡 + 详情页（可按组合过滤） | 再平衡卡「查看详情」→ `/logs/rebalance` 子视图 |
| OQ5 | **手动刷新**（不轮询） | 看板放「↻ 刷新」按钮，无自动定时器 |
| OQ6 | `/logs` **只读排障，永不放执行动作** | 全频道不得出现「执行/撤销/重做/手动触发/编辑阈值」按钮 |
| OQ7 | 「再平衡提醒详情」**不落本频道**（归组合域） | 详情页只列"跑成没跑成/失败原因"，**不列建议明细、不放执行按钮** |
| OQ8 | 再平衡详情用**独立子路由** `/logs/rebalance`（形态 B） | 新增 `vRebalanceBoard()` + 路由分支，不在看板卡内行内展开 |

### 2.3 系统状态色（与行情"红涨绿跌"严格区分）
| 色 | 含义 | 原型既有类 |
|---|---|---|
| 绿 `c-green` | 好 / 完成 / 数据齐 | `.c-green`（已存在，L151） |
| 黄 `c-amber` | 部分 / 需关注 | `.c-amber`（已存在，L153） |
| 红 `c-red` | 失败 / 缺数据 | `.c-red`（已存在，L154） |
| 灰 `c-gray` | 跳过 / 未跑 / 无数据 | `.c-gray`（已存在，L155） |

⚠️ **此处红=坏、绿=好，与本项目价格"红涨绿跌"语义无关**。看板必须带图例说明这一点（避免和行情红绿打架）。

### 2.4 频道定位（硬约束）
`/logs` 是**只读排障频道**：只回答"系统有没有干活、干成了没有"，**永不放任何执行动作**。所有"动手"都发生在组合域。

---

## 3. 现状缺口（原型当前 vs 设计，即本卡要改的清单）

原型当前 `vLogs`（L1948–1981）只有 2 个 tab：`任务运行记录`（runs）+ `服务日志`（logs）；`S.logs.tab` 默认 `'runs'`（L599）。`TASKRUNS`（L558–566）只有 `task/time/status/dur/summary` 四个字段，**没有数据态**。

| # | 现状问题 | 设计要求的正确形态 | 判定 |
|---|---|---|---|
| G1 | 无「任务运行看板」tab，且默认是原始表格 | 新增置顶「任务运行看板」tab，默认即它 | ✗ 缺失 |
| G2 | 无总览条（5 健康灯 + 整体徽章 + 快照时间） | 顶部一行 5 灯 + 整体徽章 + 快照时间 | ✗ 缺失 |
| G3 | 价格行 `status=SUCCEEDED`(绿) + 失败藏进 summary 文字"成功13·失败1（0700.HK超时）" | 价格卡以**数据态**为主信号：目标市场日 + 应采/已采 + 进度条 + missing 清单 | ✗ 违例（全绿误导） |
| G4 | 仅 `c-green/c-red` 二元色，无黄/灰，无图例 | 四态色 + 图例（与行情红绿区分说明） | ✗ 缺失 |
| G5 | 再平衡 3 条 `rebalance-suggestions:*` 当普通表格行平铺 | 聚合为 1 张卡 + 「查看详情」进 `/logs/rebalance` | ✗ 缺失 |
| G6 | 无刷新按钮 | 手动「↻ 刷新」按钮（OQ5） | ✗ 缺失 |
| G7 | tab 命名 `任务运行记录`/`服务日志` | 改 `任务日志`/`服务器日志`（与 FS/C-01 命名一致） | △ 命名不一致 |
| — | 侧栏保留「日志」入口（L372） | **保持不变**（OQ1） | ✓ 一致 |
| — | 两个原始视图数据仍在 | **保留可访问**（NG6/G4） | ✓ 一致 |

---

## 4. 具体改动（UI agent 按顺序执行）

### 4.1 状态默认值（L599）
```js
logs:{ tab:'board', task:'', status:'', level:'ALL' },   // 原 'runs' → 'board'
```
> 改 `S.logs.tab` 默认值为 `'board'`，保证打开 `/logs` 默认落在看板。

### 4.2 tab 栏重排（改 `vLogs` 顶部 `seg`，原 L1950–1953）
新顺序：**任务运行看板（board）→ 任务日志（task）→ 服务器日志（server）**。
```js
const seg = `<span class="seg">
  <button class="seg-btn ${f.tab==='board'?'on':''}" onclick="S.logs.tab='board';route()">任务运行看板</button>
  <button class="seg-btn ${f.tab==='task'?'on':''}" onclick="S.logs.tab='task';route()">任务日志</button>
  <button class="seg-btn ${f.tab==='server'?'on':''}" onclick="S.logs.tab='server';route()">服务器日志</button>
</span>`;
```
> 原 `runs` 分支改名为 `task`；原 `logs` 分支改名为 `server`。**保留两个原始分支的内部逻辑不变**（只改 tab key 与文案），满足 G4/AC7 零回归。

### 4.3 新增数据态 mock（在 `TASKRUNS` 之后，约 L566 后插入）
保留 `TASKRUNS` 给「任务日志」tab 用；新增 `CRON_STATUS` 供看板渲染（形态对齐 `TASK-054` 的 `GET /api/cron/status` 返回）：
```js
const CRON_STATUS = {
  snapshotAt: '2026-10-26 09:35',
  tasks: [
    { key:'daily-price-sync', name:'价格同步', lastRun:'2026-10-26 07:00', runState:'SUCCEEDED',
      dataLevel:'amber', targetDay:'2026-10-25', expected:40, fetched:38, missing:['0700.HK'], progress:95,
      keyNumbers:'目标 2026-10-25（上一开市日）：38/40 · 95%', note:'0700.HK 超时未采' },
    { key:'price-integrity-check', name:'完整性检查', lastRun:'2026-10-26 03:30', runState:'SUCCEEDED',
      dataLevel:'amber', ok:40, gap:2, skippedNoLaunchDate:1, gapItems:['000191','510310'], progress:95,
      keyNumbers:'完整 40 / 缺口 2 / 跳过 1', note:'缺口：000191、510310' },
    { key:'alert-evaluate', name:'提醒评估', lastRun:'2026-10-26 04:00', runState:'SUCCEEDED',
      dataLevel:'green', alertsFired:3, progress:null, keyNumbers:'命中 3 条提醒' },
    { key:'fx-rate-sync', name:'汇率同步', lastRun:'2026-10-26 09:30', runState:'SUCCEEDED',
      dataLevel:'green', currencies:{USD:'ok',CAD:'ok',HKD:'ok'}, progress:null, keyNumbers:'USD ✓ CAD ✓ HKD ✓' },
    { key:'rebalance', name:'再平衡分发', lastRun:'2026-10-26 00:00', runState:'PARTIAL',
      dataLevel:'amber', due:2, generated:1, failed:1, progress:null,
      keyNumbers:'到期 2 / 生成 1 / 失败 1', detailLink:'#/logs/rebalance',
      perPortfolio:[
        {pid:'cn-long',  name:'CN-长钱', schedule:'daily',  due:true,  runState:'SUCCEEDED', generated:true,  suggestions:3, reason:null},
        {pid:'cn-stable',name:'CN-稳钱', schedule:'daily',  due:true,  runState:'FAILED',    generated:false, suggestions:0, reason:'SYMBOL_NOT_FOUND'},
        {pid:'ca-long',  name:'CA-长钱', schedule:'weekly', due:false, runState:'SKIPPED',   generated:false, suggestions:0, reason:'未设目标配置'}
      ] }
  ]
};
```
> 字段含义见 FS §4.3。注意：价格 `targetDay` 是**上一开市日 2026-10-25**（OQ2），不是运行日；`progress=null` 的任务（提醒/汇率）不画进度条、只显关键数字。

### 4.4 新增看板分支（在 `vLogs` 的 `if(f.tab==='runs')` 之前插入 `if(f.tab==='board')`）
渲染：刷新按钮 + 总览条 + 5 卡网格 + 图例。建议抽两个小函数（UI agent 自行择位）：
```js
const LEVEL_CLASS = { green:'c-green', amber:'c-amber', red:'c-red', gray:'c-gray' };
const LEVEL_DOT   = { green:'#16A34A', amber:'#F59E0B', red:'#DC2626', gray:'#94A3B8' };
function overallBadge(tasks){
  if(tasks.some(t=>t.dataLevel==='red'))   return ['c-red','存在失败'];
  if(tasks.some(t=>t.dataLevel==='amber')) return ['c-amber','需关注'];
  if(tasks.some(t=>t.dataLevel==='gray'))  return ['c-gray','可能停滞'];
  return ['c-green','全部正常'];
}
function cronCard(t){
  const bar = t.progress!=null
    ? `<div class="pbar"><div class="pbar-f" style="width:${Math.min(100,t.progress)}%"></div></div>`
    : '';
  const actions = `<a class="link" onclick="go('#/logs?tab=task&task=${t.key}')">查看日志</a>`
    + (t.detailLink?` <a class="link" onclick="go('${t.detailLink}')">查看详情</a>`:'');
  return `<div class="card cron-card"><div class="card-b">
    <div class="head-row"><div class="ph-title">${t.name}</div>
      <span class="chip ${LEVEL_CLASS[t.dataLevel]}" title="数据态：${LEVEL_LABEL[t.dataLevel]}">${LEVEL_LABEL[t.dataLevel]}</span></div>
    <div class="muted" style="margin:4px 0">上次运行 ${t.lastRun}</div>
    <div class="run-state">运行态 ${t.runState}</div>
    ${bar}<div class="knum">${t.keyNumbers}</div>
    ${t.note?`<div class="note">⚠ ${t.note}</div>`:''}
    <div class="card-actions">${actions}</div>
  </div></div>`;
}
```
`vLogs` 内 board 分支：
```js
if(f.tab==='board'){
  const [obc,obl] = overallBadge(CRON_STATUS.tasks);
  return `
  <div class="toolbar">${seg}
    <button class="btn" onclick="route()">↻ 刷新</button>
    <span class="count">基于 taskruns 最近一次运行 + 价格库当前态 · 更新于 ${CRON_STATUS.snapshotAt}</span>
  </div>
  <div class="cron-overview">
    <div class="hl-wrap">${CRON_STATUS.tasks.map(t=>`<span class="hl"><span class="dot" style="background:${LEVEL_DOT[t.dataLevel]}"></span>${t.name}</span>`).join('')}</div>
    <span class="chip ${obc}">${obl}</span>
  </div>
  <div class="cron-grid">${CRON_STATUS.tasks.map(cronCard).join('')}</div>
  <div class="cron-legend">状态色（系统态，与行情「红涨绿跌」无关）：
    <span class="chip c-green">好</span><span class="chip c-amber">关注</span>
    <span class="chip c-red">坏</span><span class="chip c-gray">跳过/未跑</span></div>`;
}
```

### 4.5 新增样式（在 `<style>` 内，建议放在 `.cron-card` 附近）
```css
.cron-overview{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:12px 0 4px;}
.hl-wrap{display:flex;gap:14px;flex-wrap:wrap;}
.hl{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink2);}
.cron-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin:12px 0;}
.cron-card .ph-title{font-size:15px;font-weight:600;}
.cron-card .knum{font-size:13px;margin:8px 0;color:var(--ink);}
.cron-card .note{font-size:12px;color:var(--warn-t);background:var(--warn-bg);padding:4px 8px;border-radius:6px;margin:4px 0;}
.cron-card .card-actions{margin-top:8px;display:flex;gap:14px;}
.cron-card .run-state{font-size:11px;color:var(--muted);margin:2px 0 6px;letter-spacing:.02em;}
.pbar{height:8px;background:#F1F3F7;border-radius:999px;overflow:hidden;margin:8px 0;}
.pbar-f{height:100%;background:var(--brand);border-radius:999px;}
.cron-legend{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--border);margin-top:6px;}
.link{color:var(--brand);cursor:pointer;font-size:13px;font-weight:500;}
```

### 4.6 新增再平衡详情子视图 `vRebalanceBoard()`（OQ8 形态 B）
- **路由**：在原型路由分发处新增 `#/logs/rebalance` 分支（参考现有 `go('#/logs')` 的分发写法），渲染 `vRebalanceBoard()`；面包屑「‹ 返回看板」→ `go('#/logs?tab=board')`。
- **筛选**：日期下拉（默认 2026-10-26）、组合下拉（取自 `CRON_STATUS.tasks[4].perPortfolio` 的 name）、状态下拉（全部/已运行/失败/跳过）、频率下拉（全部/daily/weekly/monthly）。
- **表格列**（只读，NG6/NG7）：组合 · 计划 · 到期 · 运行态 · 生成结果 · 建议数 · 失败原因 · 操作（查看原始日志 / 去组合）。
- **数据**：用 `CRON_STATUS.tasks[4].perPortfolio` 渲染三行。
- **只读声明**：页脚一行 `ⓘ 本页只读。「执行 / 撤销 / 重做」在组合域完成 —— 点「去组合」跳转。`；**不得出现任何执行/撤销/重做控件**（OQ6/OQ7）。
- **深链**：支持 `?portfolio=<pid>` 与 `?date=` 筛选保持（从 URL 读初值）。

---

## 5. Design Token（必须套用，已固化）
| 用途 | 值 |
|---|---|
| 主色 / 进度条 / 链接 | `#635BFF`（var `--brand`） |
| 浅紫底 | `#EEEDFF`（var `--brand-surf`） |
| 边框 / 分隔 | `#E3E8EE`（var `--border`） |
| 系统态绿 / 黄 / 红 / 灰 | `c-green`/`c-amber`/`c-red`/`c-gray`（已存在，**复用**，勿新建） |
| 涨红 / 跌绿（行情，**不在本频道用作状态色**） | `#DF1B41` / `#0E9F6E` |

> ⚠️ 本频道状态色**严禁**复用行情的"涨红跌绿"语义；看板红=坏、绿=好，靠 §4.4 图例书面区分。

---

## 6. Acceptance Criteria（UI agent 自测 + Reviewer 复核）

| # | 验收标准 |
|---|---|
| AC1 | 打开 `#/logs` → **默认落在「任务运行看板」tab**，且该 tab 在列表**第一位**；「任务日志」「服务器日志」依次为第二、第三。 |
| AC2 | 顶部总览条就位：恰好 **5 个健康灯**（`.dot` + 任务名）+ **1 个整体徽章**（本 mock = 「需关注」`c-amber`）+ 1 行快照时间文案。 |
| AC3 | 5 张任务卡渲染，每张含：任务名 / 上次运行时间 / **数据态 chip（文案与颜色均 = 数据态：好/关注/坏/跳过，按 `LEVEL_CLASS` 着色）** / 运行态副行小灰字（SUCCEEDED 等）/ 数据态进度条或关键数字（无 `progress` 的任务不画 bar、不出现 `NaN`）/ 「查看日志」入口。 |
| AC4 | 价格卡显示 **"目标 2026-10-25（上一开市日）：38/40 · 95%"** + 数据态 chip = 关注（amber）+ 运行态 SUCCEEDED 在副行（验证 OQ2 + 数据态为主信号、运行态仅辅助，而非 `status` 绿灯）。 |
| AC5 | 看板含**状态色图例**，且文案明确"与行情红涨绿跌无关"。 |
| AC6 | 再平衡卡显示「到期 2 / 生成 1 / 失败 1」+「查看详情」→ 进入 `/logs/rebalance`：逐组合表格（CN-长钱生成 3 / CN-稳钱 FAILED·SYMBOL_NOT_FOUND / CA-长钱 跳过）+ 4 个筛选器 + 只读声明；**无执行/撤销/重做控件**。 |
| AC7 | tab 命名为「任务运行看板 / 任务日志 / 服务器日志」；切到「任务日志」「服务器日志」后数据与改动前**一致**（原 `TASKRUNS` / `LOGLINES` 未动）。 |
| AC8 | 看板含**「↻ 刷新」按钮**（手动，OQ5）；无 `setInterval` 自动轮询。 |
| AC9 | `/logs` 子树（含 `/logs/rebalance`）DOM 中**不存在**「执行再平衡 / 撤销 / 重做 / 手动触发 / 编辑阈值」等按钮或链接（负向断言：先临时塞一个假按钮确认能失败）。 |
| AC10 | 视觉套用 design token：`--brand` 进度条/链接、边框 `--border`、chip 复用既有 `c-*` 类；全频道零横向溢出、空态齐备。 |
| AC11 | 侧栏「日志」入口（L372）**未被改动**，仍指向 `#/logs`。 |

---

## 7. 与工程卡的边界（避免重复/冲突）
- 本卡**只改原型文件**，不碰 `client/src`；真实实现由 `TASK-053`（骨架）/`TASK-055`（价格数据态）/`TASK-056`（状态色）/`TASK-057`（数据契约）承担。
- 行为口径**以本卡 §2 + FS 为准**；若发现原型与工程卡描述冲突，以 **FS-cron-worker-status-board.md** 为权威，并在交付说明中点出差异。
- 再平衡"到期 N"分母在真实系统依赖 `TASK-057` 数据契约（未落地前全记录与"全健康"不可区分）；**原型阶段用 mock 直接给 `due/generated/failed`，并在详情页保留"数据契约未就绪时降级"的注释位**（真实实现见 FS §4.5.2 降级规则）。

---

## 8. Risks
| # | 风险 | 应对 |
|---|---|---|
| R-1 | 空/默认态被渲染成绿色 → 重演"全绿误导" | 原型所有 mock 已显式给 `dataLevel`；**禁止**默认 green；AC3/AC4 卡死 |
| R-2 | tab 改名破坏既有深链（`?tab=runs/logs`） | 新 tab key 用 `board/task/server`；旧 `runs/logs` 深链不再支持，交付说明列出（与 TASK-053 的 R-2 一致） |
| R-3 | 进度条 `fetched>expected` 溢出 / `0/0` 出 `NaN` | `progress` 用 `Math.min(100, …)`；`progress=null` 任务不画 bar（AC3） |
| R-4 | 再平衡详情页被塞进看板卡内行内展开 | 严格走 `vRebalanceBoard()` 独立子路由（OQ8） |
| R-5 | 只读约束靠自觉 | AC9 负向断言 + 代码审查双重把关 |

---

## 9. 本卡未做的事
- 未改动任何真实业务代码；未创建 ExecPlan（原型任务免 ExecPlan，同 `TASK-060` 先例）。
- 未把 FS 的 5 个任务名/字段当作实现事实——原型数据来自 mock，真实形态以 `TASK-054` 接口契约为准。

---

## 10. 实施 · 交付与自测（UI agent，2026-10-27）

### 10.1 交付清单（全部落在 `docs/development/prototypes/2.0/portomind-prototype.html`，零业务代码）
| § | 改动 | 落点 |
|---|---|---|
| 4.1 | `S.logs.tab` 默认 `'runs'` → `'board'`；新增 `S.rb`（再平衡详情筛选态） | 状态区 |
| 4.3 | 新增 `CRON_STATUS` mock（5 任务 + `perPortfolio` 3 组合）+ `RB_DATES` | `TASKRUNS` 之后 |
| 4.2 | tab 栏重排：任务运行看板 / 任务日志 / 服务器日志；`runs`→`task`、`logs`→`server`，两个原始分支内部逻辑未动（AC7 零回归） | `vLogs()` |
| 4.4 | `overallBadge()`（只由 dataLevel 决定）/ `cronCard()` / `refreshBoard()`（手动刷新，无 `setInterval`）/ board 分支（总览条 + 5 卡网格 + 图例 + 只读声明） | `vLogs()` |
| 4.5 | `.cron-*` / `.pbar` / `.link` / `.cron-ro` / `.crumbs` 样式（复用既有 `c-*` chip 类，未新建状态色） | `<style>` |
| 4.6 | `vRebalanceBoard()`：面包屑「‹ 返回看板」+ 4 筛选器（日期/组合/状态/频率）+ 8 列只读表格 + 只读声明 + TASK-057 契约降级注记；路由新增 `#/logs/rebalance` 分支，支持 `?date=` / `?portfolio=` 深链 | 新函数 + `route()` |
| — | 侧栏「日志」入口未动（OQ1，AC11） | L372 |

### 10.2 自测
- **`_audit-cron-board.cjs`（新增，44 条）**：覆盖 AC1~AC11 全部 + OQ8 深链 + R-3（无 NaN / bar 不溢出）+ AC9 负向对照（临时注入「执行再平衡」假按钮确认断言能失败）+ AC10 token 实测（进度条/链接 `rgb(99,91,255)`、边框 `rgb(227,232,238)`）。
- **回归**：`_audit.cjs` 37/37、`_audit-auth.cjs` 59/59 全绿（AC7 零回归成立）。
- 截图：`_audit-cron/board.png`、`rebalance.png`、`server-log.png`。

### 10.3 与卡内口径的差异 / 补充决策（Reviewer 请重点核对）
| # | 差异 | 理由 |
|---|---|---|
| D-1 | mock 价格 `missing` 用 **2 项**（`0700.HK` + `VBG.TO`）而非卡内 1 项 | 卡内 `expected:40, fetched:38` 与 `missing:['0700.HK']` 数值不自洽（38+1≠40）；`VBG.TO` 无价 61 天为生产实测缺陷，note 同步列出 |
| D-2 | 卡片 chip：**文案与颜色均 = 数据态（好/关注/坏/跳过），运行态降为卡片副行小灰字** | **2026-10-27 Human 裁决 F4 采用「更彻底」方案**：原 D-2（文案=运行态、颜色=数据态）在视觉验收中被确认「首屏先读到三连 SUCCEEDED，与防全绿误导初衷有张力」，故改为 chip 文案=数据态中文 + 运行态副行 muted 小字。图例同步声明「chip 文案与颜色=数据态；运行态已降为副行」。属设计变更，由 PM 改卡后落实 |
| D-3 | 「查看日志」跳转用 `onclick` 设 `S.logs` + `go('#/logs')`，同时 `vLogs` 支持 `?tab=&task=` URL 深链（读初值写回状态） | 兼顾点击交互与可分享深链；URL 无参时以 `S.logs` 为准，不破坏现有 tab 点击行为 |
| D-4 | 再平衡详情页**顶栏标题 = 「日志 · 再平衡详情」**，页内标题 = 「再平衡分发 · 逐组合结果」 | 卡未规定顶栏 title；规避 `TASK-059` §11 的 A 级问题「Topbar 与页内标题同名」 |
| D-5 | 旧深链 `?tab=runs` / `?tab=logs` 不再支持（R-2 已声明）；`?tab=board/task/server` 与 `?task=` 可用 | 与 TASK-053 的 R-2 口径一致 |
| D-6 | 详情页「计划」列显示中文（每日/每周/每月），「到期」用 chip（到期=c-purple / 未到期=c-gray） | 卡只定列名未定形态；沿用原型既有 chip 语言 |

### 10.4 遗留
- 真实 `client/src` 的看板实现仍由 `TASK-053/055/056/057` 跟踪；本原型 tab key（`board/task/server`）与筛选深链格式应作为其交互口径参考。
- `CRON_STATUS` 为 mock；真实实现必须走 `GET /api/cron/status`（TASK-054 契约），`contractReady=false` 时数值字段为 `null` 的降级形态本原型未演示（mock 全量可算），实现侧须按 FS §4.5.2 处理。

---

## 11. 独立 Reviewer 复核（2026-10-27 · 不同角色不同轮）

### 11.1 复核方式与证据

| 项 | 做法 | 结果 |
|---|---|---|
| 断言脚本 | **Reviewer 独立重跑** `_audit-cron-board.cjs`，**不采信**执行方 §10.2 的自测结论 | **44/44 PASS · 0 FAIL**，退出码 0 |
| 视觉核对 | 逐张阅读 `_audit-cron/board.png`、`_audit-cron/rebalance.png` | 与 FS 设计意图一致（见 §11.2） |
| 代码核对 | 逐条读 `vLogs`(L2047-2103) / `vRebalanceBoard`(L2109-2145) / `CRON_STATUS`(L593-615) / 路由(L994-1002) / 样式(L217-233) / 侧栏(L390-393) | 见 §11.2 |

### 11.2 AC 逐条判定

| AC | 判定 | 依据 |
|---|---|---|
| AC1 默认落看板 + tab 顺序 | ✅ | 断言 06/07；`S.logs.tab='board'`（L650） |
| AC2 5 灯 + 整体徽章 + 快照 | ✅ | 断言 08-11；L2065-2068 |
| AC3 5 卡 + 数据态 chip + 运行态副行 + 无 NaN + 入日志口 | ✅ | 断言 12-17（含 chip=数据态中文、run-state 副行）；`cronCard`（L2023-2038，`Math.min(100,…)` + `progress==null` 不画 bar） |
| AC4 价格数据态=关注(amber) + 运行态副行 SUCCEEDED + 上一开市日 38/40 + 0700.HK | ✅ | 断言 18-20；L597-598 + L2032-2036 |
| AC5 四态图例 + 与行情红绿无关 | ✅ | 断言 21-22；L2070-2072 |
| AC6 再平衡聚合 + 详情 + 4 筛选 + 只读 | ✅ | 断言 23-30；L2109-2145 |
| AC7 tab 命名 + 原始分支零回归 | ✅（数据口径见 **F1**） | 断言 32-34；`TASKRUNS`/`LOGLINES` 未被删改 |
| AC8 手动刷新无轮询 | ✅ | 断言 01/02/35；`refreshBoard`（L2038-2046），全文无 `setInterval` |
| AC9 只读（含负向对照） | ✅ | 断言 31/36/37；组合域的「执行/撤销/重做」在 L2452-2570，**未串入** `/logs` |
| AC10 token + 无横向溢出 | ✅ | 断言 38-42 |
| AC11 侧栏「日志」未动 | ✅ | 断言 05；L390-393 与 `setNav` 映射（L1009） |

**结论：结构层 11/11 通过。** 以下 6 项为数据 / 视觉 / 文档层问题。

### 11.3 待改项

#### F1（P1 · **必须改**）跨 tab mock 数据是两套口径，演示时会自相矛盾

`CRON_STATUS`（新，L593-615）与 `TASKRUNS`/`LOGLINES`（旧，L577-583 / L618-626）来自**两个不同的数据宇宙**：

| 维度 | 看板 `CRON_STATUS` | 任务日志 `TASKRUNS` / 服务日志 `LOGLINES` |
|---|---|---|
| 价格同步规模 | 应采 **40** / 已采 **38** | L577「成功 **13** · 失败 1」；L620「同步 **14** 个启用资产」 |
| 完整性检查 | 完整 40 / 缺口 2 / 跳过 1（合计 **43**） | L578「检查 **14** · 缺口 2 · 跳过 1」 |
| 缺口标的 | `000191`、`510510` | L623「`0700.HK`、`AAPL`」 |
| 提醒 | 命中 **3** 条 | L579「新增 **1**」；L622「新增 1 条提醒」 |
| CN-稳钱 | `FAILED` / `SYMBOL_NOT_FOUND` | L582 `SUCCEEDED` /「无偏离，未生成建议」 |
| CA-长钱 | `SKIPPED` | L583 `SUCCEEDED` /「未设目标配置，跳过」 |

**最致命的一条**：详情页「查看原始日志」（L2124）会带着 `rebalance-suggestions:cn-stable` 跳到「任务日志」并过滤，而那一行是 `SUCCEEDED`「无偏离」。
→ **用户从一个 `FAILED` 行点进去，看到 `SUCCEEDED`。** 这正是本功能存在的理由（根除「全绿误导」），却在原型里被自己演示了出来。

**改法（只改 mock 常量，不动结构）**：

| 行 | 现值 | 建议改为 |
|---|---|---|
| L577 | `status:'SUCCEEDED'`，`'成功 13 · 失败 1（0700.HK 超时）'` | `status:'PARTIAL'`，`'成功 38 · 失败 2（0700.HK 超时、VBG.TO 无价）'` |
| L578 | `'检查 14 · 缺口 2 · 跳过 1'` | `'检查 43 · 完整 40 · 缺口 2 · 跳过 1'` |
| L579 | `'评估 8 · 新增 1 · 归档 0'` | `'评估 8 · 命中 3 · 归档 0'` |
| L582 | `status:'SUCCEEDED'`，`'无偏离，未生成建议'` | `status:'FAILED'`，`'SYMBOL_NOT_FOUND：目标/持仓 symbol 写法不一致'` |
| L583 | `status:'SUCCEEDED'` | `status:'SKIPPED'` |
| L620 | `'开始同步 14 个启用资产（active only）'` | `'开始同步 40 个启用资产（active only）'` |
| L622 | `'评估 8 条规则，新增 1 条提醒（cooldown 生效）'` | `'评估 8 条规则，新增 3 条提醒（cooldown 生效）'` |
| L623 | `'检查完成：缺口 2（0700.HK、AAPL 延迟回补 DEFERRED）'` | `'检查完成：缺口 2（000191、510510）'` |

> 连带（卡外小增项）：L2087 状态筛选下拉当前只有 `SUCCEEDED`/`FAILED`；mock 引入 `PARTIAL`/`SKIPPED` 后须补至**四态**，与 FS 四态一致。

#### F2（P2 · 视觉）详情页操作列两个链接挤在一起

L2124-2125 的「查看原始日志」与「去组合」之间无间距（`rebalance.png` 可见明显粘连）。建议包一层 `display:flex;gap:12px`，或给前者加 `margin-right`。

#### F3（P2 · 文案）完整性检查 note 把两类问题混写

L601 `'缺口：000191、510510（无 launchDate，跳过 1）'` → 易被读成「这两个标的因无 launchDate 被跳过」，但 `gap=2` 与 `skippedNoLaunchDate=1` 是**两类**。建议改为 `'缺口：000191、510510；另有 1 个无 launchDate 被跳过'`。

#### F4（已裁决 · 2026-10-27 Human 选「更彻底」，**非缺陷**）chip 第一眼先读到 "SUCCEEDED"

`D-2` 原取舍（文案=运行态、颜色=数据态）在视觉验收中被确认：**首屏扫视先看到的仍是三连 `SUCCEEDED`**，颜色提醒是第二眼，与「别被全绿误导」的初衷存在张力。

**Human 裁决（2026-10-27）**：采用「更彻底」方案 —— **chip 文案与颜色均 = 数据态中文（好/关注/坏/跳过），运行态降为卡片副行 muted 小字**。

已落实改动：
- 原型 `cronCard`（L2031-2036）：chip 改为 `${LEVEL_LABEL[t.dataLevel]}`，新增 `<div class="run-state">运行态 ${t.runState}</div>` 副行；新增 `.cron-card .run-state` 样式（11px / `var(--muted)`）。
- 图例（L2070-2072）改写为「chip 文案与颜色 = 数据态；运行态已降为卡片副行小灰字」。
- 自测脚本 `_audit-cron-board.cjs`：AC3 加 `run-state` 捕获、断言「每卡有数据态 chip + 运行态副行」；AC4 改为「chip=关注(amber) 且 运行态 SUCCEEDED 在副行」。
- 本卡 AC3/AC4 验收描述与 D-2 取舍同步更新（见 §6 / §4.2 / D-2）。

> 注：再平衡详情页（L2120）逐组合仍用运行态 `STATE_CLASS` chip —— 那是**逐组合运行结果**的真实信号（该组合到底跑没跑成），与看板卡「数据态为主信号」是两回事，不在 F4 范围内。

#### F5（记录）资产基数三处不齐

价格 **40** / 完整性 **43**（40+2+1）/ 生产实测 **44**。F1 已按 40 对齐价格与完整性主数字；若统一取 44，请一并回调 L577-578 与 L620。

#### F6（P3 · 文档卫生）卡内行号已偏移

本卡写作时引用的 `nav-logs` L372 / `S.logs` L599 / `vLogs` L1948-1981，因 auth 原型合并（`TASK-060`）整文件行号后移；**实际现为 L390 / L650 / L2047-2103**。§11.2 已按现编号重述；本文档历史正文不逐条回改（保留交付原貌）。

### 11.4 复核结论

**CHANGES REQUIRED（F1~F3 未修；F4 已裁决并已落实）**

- 结构、交互、只读约束、色彩语义、design token **全部达标**，**不涉及返工**。
- **F1 是唯一影响「功能可信度」的项，必须修** —— 否则演示时"从 FAILED 点进原始日志看到 SUCCEEDED"，等于把本功能要治的病当众演一遍。
- F1~F3 修完后可直接置 `APPROVED` 并 `git mv` 至 `complete/`，**无需再开一轮**。
- **F4 已裁决并已落实**（2026-10-27 Human 选「更彻底」：chip 文案与颜色 = 数据态中文，运行态降为副行小灰字；原型 + 自测 + 本卡三方同步，见 F4 节）。F4 不再阻塞归档。

---

## 12. F1~F3 修复记录（UI agent，2026-10-27 15:12）

### 12.1 修复内容

**F1 跨 tab mock 同口径（P1）**——`TASKRUNS` / `LOGLINES` 已与 `CRON_STATUS` 对齐为**同一套数据宇宙**（同一份 2026-10-26 跑批结果），逐项落地 §11.3 建议表的 8 处：

| 项 | 改后 |
|---|---|
| `daily-price-sync` | `PARTIAL` ·「成功 38 · 失败 2（0700.HK 超时、VBG.TO 无价）」 |
| `price-integrity-check` | 「检查 43 · 完整 40 · 缺口 2 · 跳过 1」 |
| `alert-evaluate` | 「评估 8 · 命中 3 · 归档 0」 |
| `rebalance-suggestions:cn-stable` | `FAILED` ·「SYMBOL_NOT_FOUND：目标/持仓 symbol 写法不一致」 |
| `rebalance-suggestions:ca-long` | `SKIPPED` |
| 服务器日志 ×3 | 同步 40 个启用资产 / 新增 3 条提醒 / 缺口 2（000191、510510） |

连带项已做：任务日志**状态筛选下拉补至四态**（SUCCEEDED/PARTIAL/FAILED/SKIPPED）；状态 chip 由二元色改 **`STATE_CLASS` 四态着色**（否则 PARTIAL 显示红色、SKIPPED 显示红色，又造出新的口径分裂）。

**F2（视觉）**：详情页操作列两链接包进 `.act-cell{display:flex;gap:12px}`，实测渲染间距 12px、同行不换行。

**F3（文案）**：完整性 note →「缺口：000191、510510；另有 1 个无 launchDate 被跳过」；`gapItems` 同步 `['000191','510510']`（与服务器日志一致，顺带修正了执行稿中 510310 的笔误）。

### 12.2 验证

- 新增执行方专项脚本 **`_audit-cron-f13.cjs`（23/23 PASS）**：核心是 **F1-a 回归钉死——「从详情页 CN-稳钱（FAILED）行点『查看原始日志』，任务日志过滤结果仍是 FAILED + SYMBOL_NOT_FOUND」**；另覆盖价格/完整性/提醒/CA-长钱逐项对齐、四态着色、四态筛选真实生效、服务器日志三处数字、F2 间距（getBoundingClientRect 实测）、F3 文案正反两面。不动 Reviewer 的 `_audit-cron-board.cjs`。
- Reviewer 脚本原样重跑 **`_audit-cron-board.cjs` 44/44 PASS**；回归 `_audit.cjs` 37/37、`_audit-auth.cjs` 59/59。
- 截图：`_audit-cron/tasklog-f13.png`（四态任务日志）、`_audit-cron/rebalance-f13.png`（F2 间距）。

### 12.3 一处需 Reviewer/Human 知悉的残留粒度差异（非 F1 反例）

价格同步：看板卡副行「运行态 **SUCCEEDED**」（`CRON_STATUS.runState`，进程级——真实系统里该任务落库 status 确为 SUCCEEDED，这正是 §2.1 要治的病）vs 任务日志行状态 **PARTIAL**（业务结果级——成功 38 / 失败 2）。数字完全一致，仅状态枚举粒度不同。若 Human 要求枚举逐字统一：改 `CRON_STATUS` 价格卡 `runState:'PARTIAL'` 一行 + 同步微调 `_audit-cron-board.cjs` AC4 断言即可（未擅自执行，因会改动 Reviewer 脚本验收口径）。完整性检查按 §11.3 表保持 `SUCCEEDED`（未列入改动）。

### 12.4 结论

F1~F3 全部修复并自测通过；按 §11.4 预授权，**待 Reviewer 确认后即可置 `APPROVED` 并 `git mv` 至 `complete/`**（本执行方不自行归档）。

---

## 13. 完成记录（2026-10-27 结案）

### 13.1 结案依据（不采信自述，只认独立重跑）

| 证据 | 结果 |
|---|---|
| `_audit-cron-board.cjs`（Reviewer 脚本，**原样重跑**） | **44/44 PASS · 0 FAIL** |
| `_audit-cron-f13.cjs`（执行方专项，核心是 F1-a 回归钉死） | **23/23 PASS · 0 FAIL** |
| 回归 `_audit.cjs`（TASK-059 原型整改） | 48/48 PASS |
| 回归 `_audit-auth.cjs`（TASK-060 用户模块） | 59/59 PASS |
| 截图 | `_audit-cron/board.png` · `rebalance.png` · `server-log.png` · `tasklog-f13.png` · `rebalance-f13.png` |

### 13.2 交付物

| 落点 | 内容 |
|---|---|
| `docs/development/prototypes/2.0/portomind-prototype.html` | `S.logs.tab` 默认 `board`；`CRON_STATUS` mock（5 任务 + 3 组合逐组合结果）；`vLogs()` 三段 tab（任务运行看板 / 任务日志 / 服务器日志）+ 总览条 + 5 卡网格 + 四态图例 + 手动「↻ 刷新」；`vRebalanceBoard()` 独立子路由 `#/logs/rebalance`（4 筛选器 + 8 列只读表 + 只读声明 + TASK-057 契约降级注记）；`.cron-*` / `.pbar` / `.cron-ro` / `.crumbs` 样式 |
| `docs/development/prototypes/2.0/_audit-cron-board.cjs` | 44 条断言（AC1~AC11 + OQ8 深链 + R-3 边界 + AC9 负向对照 + AC10 token 实测） |
| `docs/development/prototypes/2.0/_audit-cron-f13.cjs` | 23 条 F1~F3 专项断言 |
| 侧栏 | 「日志」入口未动（OQ1 / AC11）；`/logs` 全频道只读，无执行/撤销/重做/触发/编辑阈值控件 |

### 13.3 遗留（不阻断，已指派去处）

| 项 | 去处 |
|---|---|
| 真实 `client/src` 看板实现 | `TASK-053`（tab 骨架）/ `TASK-055`（价格数据态）/ `TASK-056`（状态色）/ `TASK-057`（数据契约）；本卡交付的 tab key（`board/task/server`）与深链格式为其交互口径参考 |
| `contractReady=false` 时的降级形态（数值 `null`） | 原型 mock 全量可算、未演示；实现侧按 `FS §4.5.2` 处理 |
| 价格卡副行「运行态 SUCCEEDED」vs 任务日志「PARTIAL」的枚举粒度差 | 见 §12.3；数字一致，仅粒度不同，未擅自统一（会改动 Reviewer 断言口径） |
| `F5` 资产基数三处不齐（40 / 43 / 生产 44） | 记录项，随真实数据落地时统一 |

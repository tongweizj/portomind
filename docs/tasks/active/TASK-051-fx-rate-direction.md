# TASK-051 — 家庭折算汇率方向反了（`rateToCny` 存成 `1 CNY = X 外币`）

## Metadata

**Status:**  
`Draft`（2026-10-21 立项）—— 由 `TASK-050` 实施期发现的 **F-1** 单独立项。**需求待 Human 批准；ExecPlan 未产出；不得动代码**。

**Priority:**  
`High`（已交付功能的核心数字错误：家庭总资产被算错一个数量级）

**Owner:**  
`—`（待指派 Planner → Implementer → 独立 Reviewer）

**Created:**  
`2026-10-21`

**Updated:**  
`2026-10-21`（立项，含真实数据实测）

**Type:**  
`Bug`（服务端折算口径 / 数据正确性）

**Related Product Spec:**  
`docs/product/lines/PL-6-household.md`（家庭层 · 汇率与折算）· `docs/product/specs/PRD.md:63`（FxRate 前置依赖）

**Related ADR:**  
`None`

**Execution Plan:**  
`None`（待 Human 批准本卡后由 Planner 产出）

**来源：**  
`TASK-050` 实施记录 §10 **F-1**（2026-10-21）· ExecPlan `TASK-050` §12 F-1

---

## 1. 问题

家庭层折算用的汇率**方向是反的**，且**采集端与手动录入端的语义互相矛盾**。

三处约定都说「`rateToCny` = 1 外币折合多少人民币」：

| 落点 | 原文 |
|---|---|
| `shared/models/fxRate.js:2,13` | 「记录各外币对 CNY 的汇率（1 外币 = rateToCny 人民币）」 |
| `docs/product/lines/PL-6-household.md:106` | 「语义为「1 外币 = `rateToCny` 人民币」」 |
| `docs/manual/SERVER.md:88` | 示例 `{"rateToCny":7.2}`（USD） |

但自动采集端取的是 **以 CNY 为基准**的接口，把「1 CNY = X 外币」原样当 `rateToCny` 存了进去：

```js
// shared/services/fxRate.service.js:11,78-82
const PROVIDER_URL = 'https://open.er-api.com/v6/latest/CNY';   // base = CNY
...
for (const currency of SUPPORTED_CURRENCIES) {
  result[currency] = Number(rates[currency]);   // ← 0.149 USD，不是 6.69
}
```

`familySummary.service.js:70,90` 再以 `amount * rate` 折算，于是「除以 6.69」变成了「乘以 0.149」。

**方向反了的后果不是单向的**——正确值 >1 的币种被低估，正确值 <1 的币种反而被高估：

| 币种 | 库内实存 | 正确应为 | 折算偏差 |
|---|---|---|---|
| USD | `0.149448` | `1 / 0.149448 = 6.6913` | 仅为正确值的 **2.23%**（低估约 44.8 倍） |
| CAD | `0.210271` | `1 / 0.210271 = 4.7558` | 仅为正确值的 **4.42%**（低估约 22.6 倍） |
| HKD | `1.172876` | `1 / 1.172876 = 0.8529` | 为正确值的 **137.6%**（**高估** 37.6%） |

---

## 2. 已核实的证据（2026-10-21 亲读 + 实测）

### 2.1 代码事实

| 事实 | 落点 |
|---|---|
| 采集端 URL 以 CNY 为基准 | `shared/services/fxRate.service.js:11` |
| 采集结果**未取倒数**直接入库 | `shared/services/fxRate.service.js:78-82`（`fetchFromProvider`）→ `:90-96`（`syncLatestRates` 传 `rateToCny: fetched[currency]`） |
| 折算用乘法 | `shared/services/familySummary.service.js:70`（`cnyValue += amount * rate`）、`:90`（分桶同式） |
| 模型注释与 schema 均声明「1 外币 = 人民币」 | `shared/models/fxRate.js:2,13-14` |
| 无任何方向校验 | `upsertRate` 只校验 `Number.isFinite && > 0`（`:53-56`），schema 范围 `0.000001 ~ 100000`（`fxRate.js:17-18`）——两种方向都能通过 |
| 采集 cron 每日 09:30，与 `date` 幂等 upsert | `cron-worker/src/schedulers/fxScheduler.js:14`、`fxRate.service.js:57-63` |
| 消费方仅 2 处 | `familySummary.service.js:135`（折算）、`family.controller.js:22`（列表展示） |

### 2.2 真实数据实测（`portomind_dev`，镜像自真实库 `portomind`）

`fxrates` 集合现有记录全部 `source='er-api'`，**方向全错**，两个库一致：

```
== portomind（12 条）        2026-10-20 USD 0.149448 / CAD 0.210271 / HKD 1.172876
== portomind_dev（9 条）     2026-10-19 USD 0.149396 / CAD 0.210733 / HKD 1.172422
```

用 `buildFamilySummary` 对同一批持仓分别按「现状」与「取倒数」折算：

| | 现状 | 汇率取倒数后 |
|---|---|---|
| `totalCny` | **3,151.35** | **76,127.87** |

**偏差 24.16 倍**。（该次实测中两个 A 股组合分别因缺价 / 空仓不计入总额，故总额只含 CA 两个组合；数值随行情变动，**不作固定断言**，仅证明量级。）

### 2.3 为什么一直没被发现

| 原因 | 证据 |
|---|---|
| `fxRate.service` **零单测** | `server/test/` 下无任何 `fxRate` 相关测试文件；`fetchFromProvider` 无覆盖 |
| 家庭汇总测试**绕过了采集端** | `server/test/integration/family.summary.test.js:132` 直接以 `rateToCny: 7.2`（**正确方向**）插库、`:160` 用 `7.2 / 5.3 / 0.92`，全是手填的正确值 |
| 没有「采集值与手动值同量级」的交叉校验 | 无此测试，也无运行时断言 |
| 家庭页只显示折算后总额，无「用市场汇率手算」的对照 | `TASK-050` 新增的 `FxPanel` 只展示 `rateToCny` 裸值 |

### 2.4 用户可见的矛盾

`TASK-050` 新交付的 `client/src/components/Household/FxPanel.jsx` 标题写「家庭汇率（**1 外币 = ¥人民币**）」、说明行写「汇率为「1 外币 = ¥人民币」」、手动录入 placeholder 写「如 **7.20**」——旁边列表却显示 **USD 0.1494**。同一面板内自相矛盾，用户可直接看到。

### 2.5 手动修复**不持久**

用户若按 placeholder 输入 `7.2` 修好 USD，**次日 09:30 cron 会写一条新的 `date` 记录（错误方向），而 `getLatestRates` 按 `date` 降序取最新**（`fxRate.service.js:20-22`）→ 自动退回错误值。即：手动兜底挡不住自动采集的污染。

---

## 3. Acceptance Criteria

> 期望值一律**取自 §1 的口径定义与接口语义**，不得从实现反推。每条都要能失败。

| # | 验收标准 |
|---|---|
| AC1 | **先红后绿**：先提交一条在**当前实现上失败**的测试（断言 `fetchFromProvider` 对固定 provider 响应 `{USD:0.149448, CAD:0.210271, HKD:1.172876}` 返回 `USD≈6.6913 / CAD≈4.7558 / HKD≈0.8529`，容差 ±1e-4），确认红灯后再改实现使其转绿。**禁止先改实现再补测试** |
| AC2 | 新增 `fxRate.service` 单元测试，至少覆盖：① 采集方向（AC1）；② `upsertRate` 拒绝 `rateToCny <= 0` 与非数；③ 同 `(currency, date)` 二次写入不新增文档（幂等）；④ provider 返回缺字段时抛错而非静默写入 |
| AC3 | 新增**端到端口径**测试：不 mock `getLatestRates`，改用 `fetchFromProvider` 固定响应 + 一份手工构造的持仓（如 USD 1000 + CAD 1000 + CNY 1000），断言 `totalCny` 与「按市场汇率手算」的偏差 ≤ 0.5%。**该测试必须能捕捉「仅有一端被反转」的情况**（正负对照：把实现改回旧方向应立刻失败） |
| AC4 | 自动采集与手动录入的语义**一致**：测试断言二者产出的 `rateToCny` 处于同一量级（USD/CAD 均 > 1，HKD < 1），且 `/api/family/fx/rates/:currency` 的手动写入后，`/api/family/summary` 的折算方向不因此改变 |
| AC5 | 历史错误数据有明确处置并已验证：说明「修好后下一次同步即自愈最新一条」是否成立；若 `getLatestRateDocs`（汇率列表面板）会出现新旧方向混排，须给出清理脚本或过滤方案，并实测修复前后 `totalCny` 的跳变可解释 |
| AC6 | 文档与实现一致：`shared/models/fxRate.js:2,13`、`docs/product/lines/PL-6-household.md:106`、`docs/manual/SERVER.md:88`、`docs/dev/API_CONTRACT.md:93`、`docs/product/specs/PRD.md:63` 的语义表述与最终实现相符；采集源的 `base` 与「取倒数」动作在 JSDoc 中写明 |
| AC7 | **客户端零补偿**：不得在前端把汇率反过来「补」回来。检测式 `grep -rn "1 / rate\|1 / item\.rateToCny\|/ rateToCny" client/src` 无结果；折算方向只在服务端一处决定 |
| AC8 | 独立 Reviewer 复核通过；Implementer 不得自判 |

---

## 4. Scope

**In Scope**

- `shared/services/fxRate.service.js`：`fetchFromProvider` / `syncLatestRates` 的数值处理（具体方案见 §7 OQ1，由 Planner 定）
- 新增 `fxRate.service` 测试文件 + 扩写 `family.summary.test.js`（AC2 / AC3）
- 历史数据处置脚本或一次性清理（AC5，若 OQ2 裁决为「清理」）
- 4 处文档语义对齐（AC6）

**Out of Scope**

- **不改** `familySummary.service.js` 的乘法逻辑，除非 OQ1 裁决为方案 B 并同时反转手动录入语义（二者必须同批改，否则 AC4 不成立）
- 不改客户端 `FxPanel` / 各家庭区块的展示逻辑（`TASK-050` 产出，本任务只关心数值是否正确）
- 不新增币种（`SUPPORTED_CURRENCIES` 保持 `USD/CAD/HKD`）
- 不替换数据源（仍用 er-api；PRD 已明示「口径一致、可替换」）
- 不改 `FxRate` schema 字段名、不改唯一索引
- 不动价格 / 估值 / 再平衡任何逻辑

---

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | **历史数据混排**：修复后新记录正确、旧记录仍反，`getLatestRateDocs` 按 `date` 降序返回的列表里两种方向并列，用户看到 USD `0.1494` 与 `6.69` 同时出现在「1 外币 = ¥人民币」标题下 | AC5 强制处置；倾向清理历史（`source='er-api'` 的旧记录全部重算或删除），保留 `manual` 记录 |
| R-2 | **测试继续用正确值的 mock**：沿用 `family.summary.test.js` 现有 `rateToCny: 7.2` 手填风格，则修完仍测不出回归 | AC3 明确要求端到端、不 mock 汇率、且带正负对照 |
| R-3 | **数字跳变 24 倍被误判为故障**：修复后家庭总资产从约 3 千跳到约 7.6 万，用户可能以为系统出错 | 结案说明与提交信息必须写明「这是修正而非故障」，并给出跳变前后对照 |
| R-4 | **把无关缺陷算进来**：实测中「A股-长钱组合」因缺价 `CNY` 桶为 `null` 而不计入总额，这是既定口径（宁可少报），**不是本任务的 bug** | 本任务只修汇率方向；若发现总额仍异常，须先排除缺价组合再断言 |
| R-5 | **改折算端会连带破坏手动录入**：若只把 `amount * rate` 改成 `amount / rate`，则用户按 placeholder 输入的 `7.2` 会变成除以 7.2 | OQ1 必须连带考虑手动语义；AC4 卡住 |
| R-6 | **仅修采集端但 cron 已跑过**：部署前可能已写入当天错误记录，修复后需等次日 09:30 才自愈 | AC5 要求在结案前手动触发一次 `POST /api/family/fx/sync` 或用 `upsertRate` 覆盖当天记录，并实测验证 |

---

## 6. Blocking Dependencies

| 编号 | 依赖 | 状态 |
|---|---|---|
| **B1** | Human 批准本卡（§7 OQ1 / OQ2 需裁决） | ⏳ 阻塞 |
| **B2** | Planner 产出 ExecPlan 并经 Human Plan Review | ⏳ 阻塞 |
| **B3** | 独立 Reviewer 复核 | ⏳ 交付时 |

> **无技术阻塞**。`shared/` 改动与 `TASK-050` 的文件集**不重叠**（050 是纯客户端）。
> 但建议 **`TASK-050` 先结案**再开工，避免同一分支上「前端待 Review 的 12 个文件 + 服务端修复」混在一个工作树里，Reviewer 难以区分归属。

---

## 7. Open Questions（需 Human 裁决，未擅自处置）

### OQ1：修在哪一端？

| 方案 | 内容 | 代价 |
|---|---|---|
| **A（倾向）** | 采集端存**倒数**：`rateToCny = 1 / rates[currency]` | 1 行改动；模型 / 文档 / 手动录入 / 折算端**全部不动**，语义自洽 |
| B | 折算端改除法（`amount / rate`） | **必须同时**反转手动录入语义（placeholder 改「如 0.149」），否则用户输入全错；且违反「客户端与文档都已经按 7.2 写」的现状 |
| C | 双字段 `rateToCny` + `rateFromCny` | 语义最无歧义，但涉及 schema 变更、迁移、全部消费方改写，成本远超问题本身 |

> 本卡**不预设方案**，倾向 A 仅标注为「看起来的最小正确解」，最终由 Planner 在 ExecPlan 中论证。

### OQ2：历史错误数据是否清理？

- **不清理**：`getLatestRates` 只取最新，修好后下一次同步（或手动触发一次）即自愈；但 `getLatestRateDocs` 的列表面板会把新旧方向混排（R-1）。
- **清理**：把 `source='er-api'` 的历史记录按倒数重算，`manual` 记录保留原值。可逆、可脚本化。
- **清空重采**：`deleteMany({source:'er-api'})` + 触发一次同步。最简单，但丢历史。

### OQ3：HKD 的「高估」是否需要单独提示？

USD/CAD 被低估，HKD 被高估 37.6%。当前家庭组合的币种桶为 `CNY / USD / CAD`（实测无 HKD 持仓），故 HKD 偏差**当前不影响总额**，但只要将来持有 HKD 资产就会反向失真。是否需要在本任务内一并处理，还是仅记录在案？

---

## 8. Coordination Notes

- 本任务与 `TASK-050` 的**唯一交集**是 `FxPanel` 的展示文案（`TASK-050` 产出）。若 OQ1 选方案 B，`TASK-050` 的 placeholder「如 7.20」将成为错误提示 → 需要回改 `TASK-050` 已交付的文件。**这也是方案 A 更优的一个理由**：不动前端。
- `TASK-050` 的任务卡 §10 与 ExecPlan §12 的 F-1 条目已加指向本卡的交叉引用。
- 本卡只登记问题、证据与验收标准；**技术方案由 Planner 在 ExecPlan 中定**，不经 ExecPlan 不得动 `shared/`。

# TASK-051 — 汇率方向修复实施计划

## Status

Status：Approved（2026-11-11，Human 批准「051、047、046 三份计划」；`Draft → Approved` 归 Human）

Related Task：[TASK-051](../../tasks/active/TASK-051-fx-rate-direction.md)（独立维护任务，无 Story）。

Branch / Base：`main` @ `ee989c7`。实施时从最新 `main` 开 `feature/TASK-051-fx-rate-direction`。

Approval：**未批准**。`Draft → Approved` 归 Human（[STATES.md](../../../os/process/STATES.md) §4）。

## 1. Intent

修复「家庭折算汇率方向反了」：采集端把 `1 CNY = X 外币` 直接当 `rateToCny`（`1 外币 = X CNY`）入库，导致家庭总资产被算成约 1/24。目标：**只修采集方向**，不改折算公式、不改手动录入语义、不做历史数据迁移（Human 2026-11-11 决定，见 §6 D-2）。

覆盖卡内 AC1～AC8。

## 2. Context

- 采集源：`https://open.er-api.com/v6/latest/CNY`（以 CNY 为 base）→ `rates.USD` 是「1 CNY 可换多少 USD」（约 0.149）。
- 入库字段：`rateToCny` 语义为「1 外币 = X CNY」（模型注释与 schema 范围 0.000001~100000 均按此定义）。
- 折算：`familySummary.service.js:70,90` 用 `amount * rate`。
- 现实：`fxrates` 现有记录方向全错（`portomind_dev` 27 条，最新 3 条仍为 USD 0.1497 / CAD 0.2096 / HKD 1.1750）；`source='er-api'`。
- 现状无任何该模块测试（`server/test/integration` 无 fx 用例）。

## 3. Repository Findings（2026-11-11 亲读）

| # | 事实 | 落点 |
|---|---|---|
| F-01 | 采集端以 CNY 为 base | `shared/services/fxRate.service.js:11` |
| F-02 | 采集结果**未取倒数**直接作为 `rateToCny` | `:78-82`（`result[currency] = Number(rates[currency])`）→ `:90-96`（`syncLatestRates` 原样写入） |
| F-03 | 折算端按乘法 | `shared/services/familySummary.service.js:70`、`:90` |
| F-04 | 模型注释与 schema 均声明「1 外币 = 人民币」 | `shared/models/fxRate.js:2,13-18` |
| F-05 | `upsertRate` 只校验 `finite && > 0`，两种方向都能通过 | `fxRate.service.js:48-58` |
| F-06 | 列表面板 `getLatestRateDocs` 会把新旧方向混排 | `fxRate.service.js:28-31`、`family.controller.js:22` |
| F-07 | 无任何 fx 测试 | `server/test/integration/` 无 `fx*` 文件 |

## 4. Proposed Design

### 4.1 修复点（仅采集端）

```js
// fetchFromProvider：把「1 CNY = X 外币」转成「1 外币 = X CNY」
for (const currency of SUPPORTED_CURRENCIES) {
  const perCny = Number(rates[currency]);
  if (!Number.isFinite(perCny) || perCny <= 0) throw new Error(`FxRate provider returned invalid rate for ${currency}`);
  result[currency] = 1 / perCny;
}
```

- 手工录入（`upsertRate`）、折算（`familySummary`）、模型与文档语义**全部不动**。
- 不在折算端改除法：那会同时反转手动录入语义，用户输入全错（卡 OQ1 方案 B 的代价）。

### 4.2 历史数据：不迁移（D-2）

- 按 Human 2026-11-11 决定，**不**反转历史行、**不**加 `invalidated` 标记。
- 后果（必须记录）：① 历史日期的家庭汇总仍错；② `/api/family/fx/rates` 面板在修复后会新旧方向混排，直到旧行被同一 `(currency,date)` 的 upsert 覆盖。
- 缓解（文档层，不改代码）：在卡与 `SERVER.md` 注明「历史行需等待同日期覆盖或手工重录」，并提示运维可手动触发一次同步。
- 若将来要清理，另立任务（脚本方案已在卡 OQ2 记录）。

### 4.3 语义边界

- 不新增字段、不改 schema、不写迁移。
- 不改 `/api/family/fx/rates` 响应结构。
- 不改前端显示逻辑（不做「反向补偿」）。

## 5. Work Breakdown

### W1 · 采集方向修复（0.5h）

- [ ] `fetchFromProvider` 取倒数 + 有限性/正数校验（错误信息含币种）。
- [ ] 保持 `syncLatestRates` 与 `upsertRate` 不变。
- **验收**：单测见 W2；`node -e` 用固定响应手算核对 USD≈6.69 / CAD≈4.76 / HKD≈0.85。

### W2 · 单元测试（1h）

新建 `server/test/integration/fxRate.service.test.js`（或 shared 侧同名），stub `http.get` 返回固定 payload：

- [ ] AC1：固定响应 `{USD:0.149448, CAD:0.210271, HKD:1.172876}` → `rateToCny` 约为 `{USD:6.691, CAD:4.756, HKD:0.852}`；**量级断言** USD/CAD > 1、HKD < 1。
- [ ] AC2：`upsertRate` 拒绝 `0`、负数、`NaN`、非数。
- [ ] AC2：同 `(currency,date)` 幂等 upsert（两次写入同值不新增记录）。
- [ ] **先验红**：在未修复的 `HEAD^` 上跑同一用例必须失败（记录红→绿两次输出）。

### W3 · 端到端口径测试（1h）

- [ ] 不 mock `getLatestRates`：用固定 provider 响应入库，再构造 USD 持仓调用 `buildFamilySummary`；
- [ ] 断言 `totalCny` 与人算一致（例：USD 1000 × 6.691 ≈ ¥6,691）；
- [ ] 反向验证：若把采集值改回原实现，该断言必须失败（证明测的是方向，不是常量）。

### W4 · 文档一致性（0.5h）

- [ ] 核对并修正（仅在确有偏差时）：`shared/models/fxRate.js` 注释、`docs/handbook/ops/SERVER.md`、
  `docs/handbook/product/lines/PL-6-household.md` 的「1 外币 = 人民币」口径；
- [ ] 在 `TASK-051` 卡补「历史数据未迁移」的后果说明（D-2）。

### W5 · 验证与交接（0.5h）

- [ ] `npm run test:server`（248 + 新增，全绿）；`npm run build --workspace client`；`npm run lint --workspace client`；`npm run docs:check`；
- [ ] `grep -rn "1 / rate\|/ rateToCny" client` 必须为 0（前端零补偿）；
- [ ] 计划 §11 写实施记录；提交 + PR（标题 `TASK-051: ...`）。

## 6. Decisions

| # | 事项 | 决定 | 依据 |
|---|---|---|---|
| D-1 | 修在哪端 | **采集端取倒数** | 卡 OQ1 方案 A；折算/手动录入/模型语义零改动 |
| D-2 | 历史数据是否迁移 | **不迁移** | Human 2026-11-11 选择 B（只修采集）；后果见 §4.2 |
| D-3 | 是否需要 UI 提示「历史汇率可能反向」 | **不做** | 属新需求，另立任务；本计划只在文档记录 |

## 7. Verification

| AC | 方法 | 预期 |
|---|---|---|
| AC1 | W2 固定 payload 用例 | 取倒数后量级正确；旧实现上失败 |
| AC2 | W2 校验/幂等用例 | 全部通过 |
| AC3 | W3 端到端 `buildFamilySummary` | 与人算一致 |
| AC4 | W3 采集 vs 手动录入同量级 | USD/CAD > 1、HKD < 1 |
| AC5 | 卡内记录「不迁移」及后果 | 文档可追溯 |
| AC6 | W4 文档核对 | 与实现一致 |
| AC7 | `grep` 前端零补偿 | 0 命中 |
| AC8 | 独立 Reviewer | 复核方向与「先验红」证据 |

## 8. Risks

| 风险 | 影响 | 缓解 |
|---|---|---|
| 只改采集但历史行仍在 | 面板新旧混排、历史汇总仍错 | 已在 §4.2 与卡内记录；运维可手动触发一次同步 |
| 浮点精度 | 断言过严导致偶发失败 | 用量级 + 容差断言（如 `Math.abs(x-6.691)<0.01`） |
| provider 变更 base | 再次反向 | 用例固定 payload 只验证映射；另在注释写明依赖 base=CNY |
| 测试仍可能假阳性 | 误判修复成功 | W3 要求「改回旧实现必须失败」，先验红存档 |

## 9. Rollback

单提交（或两个：修复 + 测试）；失败 `git revert`。无 schema/迁移/数据写入变化，回滚无副作用。

## 10. Implementer Handoff

- **输入**：本计划 §4 修复点、§5 步骤、卡内 AC1～AC8；
- **授权**：须 Human 批准本计划；
- **边界**：只改 `fxRate.service.js` 采集函数 + 新增测试 + 文档；不改折算、不改 UI、不改 schema、不迁移历史数据；
- **产出**：修复提交 + 测试提交 + §11 记录 + 独立审查；
- **验证入口**：`DEPLOYMENT.md §7` + 本计划 §7。

## 11. Implementation Record

### 11.1 基线（2026-11-11）

- `git rev-parse main` = `e1730a00f1ae3925d42474a022921c42c9505c77`；工作区干净；分支 `feature/TASK-051-fx-rate-direction`。
- 四项命令基线：`test:server` 248 pass / 0 fail；`build` ✓ built；`lint` 0 errors / 5 warnings（既存 fixture）；`docs:check` 141 文档 / 1438 链接 / ERROR 0。
- 环境：默认沙箱禁用 `child_process.spawn`，`node --test` 与 esbuild 会报 `spawn EPERM`；本记录的输出是在放开该限制后取得的真实结果（非代码缺陷）。

### 11.2 W1 · 采集方向修复

`shared/services/fxRate.service.js` `fetchFromProvider`：

```js
const perCny = Number(rates[currency]);
if (!Number.isFinite(perCny) || perCny <= 0) {
  throw new Error(`FxRate provider returned invalid rate for ${currency}: ${rates[currency]}`);
}
result[currency] = 1 / perCny;
```

- 错误信息含币种（满足 W2 的「非法值抛错且错误信息含币种」）。
- `upsertRate` / `syncLatestRates` / `getLatestRates` / `getLatestRateDocs` **未改动**。
- JSDoc 补写「provider 以 CNY 为 base、必须取倒数」的方向说明。

### 11.3 W2 · 单元测试（新增 `server/test/integration/fxRate.service.test.js`，10 条）

覆盖 AC1（方向 + 量级）、AC2（`upsertRate` 拒绝 0/负数/NaN/非数/非法币种 + 同日幂等）、AC3（端到端折算）、AC4（采集与手动同语义）。

**先验红（未修复实现，`totalCny` 实际 149.45 = 1000×0.149448，方向确实是反的）**：

```
✖ fetchFromProvider：CNY base 的 provider 值必须取倒数（1 外币 = X CNY）
✖ fetchFromProvider：量级断言——USD/CAD > 1，HKD < 1
✖ fetchFromProvider：非法值抛错且错误信息含币种
✖ syncLatestRates：入库的 rateToCny 是「1 外币 = X CNY」
✔ upsertRate：拒绝 0 / 负数 / NaN / 非数
✔ upsertRate：非法币种拒绝
✔ upsertRate：同 (currency, date) 幂等，不新增文档
✖ 端到端：固定 provider → 入库 → getLatestRates → buildFamilySummary 与人算一致
✖ 端到端：computeFamilySummary 全链路（不 mock getLatestRates）
✖ 采集与手动录入同语义：同一量级
ℹ tests 10  ℹ pass 3  ℹ fail 7
```

其中端到端用例报错原文：`全链路 totalCny 期望约 6691.29，实际 149.45`。

**修复后转绿**：

```
✔ ×10
ℹ tests 10  ℹ pass 10  ℹ fail 0
```

### 11.4 W3 · 反向验证（证明测的是方向，不是常量）

把 `result[currency] = 1 / perCny` 临时改回 `= perCny`（旧实现），重跑同一用例：

```
ℹ tests 10  ℹ pass 4  ℹ fail 6
```

恢复修复后重跑 10/10 通过。即：**仅当方向正确时端到端断言才成立**，不是常量断言。

### 11.5 W4 · 文档一致性

| 落点 | 处理 |
|---|---|
| `shared/models/fxRate.js:2` | 原注释「1 外币 = rateToCny 人民币」本就正确；补一行说明采集源为 CNY base、入库前取倒数（TASK-051） |
| `docs/handbook/ops/SERVER.md:98` | `/api/family/fx/sync` 行补「采集源以 CNY 为 base，入库前取倒数」 |
| `docs/handbook/product/lines/PL-6-household.md:79` | 汇率采集行补方向说明与 TASK-051 标注 |
| `TASK-051` 卡新增 §9 | 记录 D-2「历史数据不迁移」及其后果（混排 / 自愈路径 / 运维手动同步建议） |

其余文档（`API_CONTRACT.md`、`PRD.md`）的语义表述经核对与实现一致，未改。

### 11.6 W5 · 验证输出

| 命令 | 结果 |
|---|---|
| `npm run test:server` | ✅ `tests 258 / pass 258 / fail 0`（248 + 新增 10） |
| `npm run build --workspace client` | ✅ `✓ built in 3.52s`（仅既存 500 kB chunk 提示） |
| `npm run lint --workspace client` | ✅ `0 errors, 5 warnings`（既存 fixture 警告） |
| `npm run docs:check` | ✅ `141 文档 / 1438 链接 / ERROR 0 / WARN 0` |
| `grep -rn "1 / rate\|/ rateToCny" client/src` | ✅ 0 命中（AC7 前端零补偿） |

### 11.7 偏差与未做项

- **无偏差**。
- **未迁移历史数据**（D-2）：未写迁移脚本、未改库、未加 `invalidated`。历史行仍为反向，后果见 §4.2 与卡内 §9。
- 未改折算公式、未改手动录入、未改 schema、未改 UI、未改 API 契约与 HTTP 路径。
- AC8（独立 Reviewer）待 Reviewer 执行，Implementer 不自判。

## 12. Review Record

（按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §7 记录。）

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。

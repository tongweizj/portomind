# TASK-051 — 汇率方向修复实施计划

## Status

Status：Approved（2026-11-11，Human 批准「051、047、046 三份计划」；`Draft → Approved` 归 Human）

Related Task：[TASK-051](../../tasks/completed/TASK-051-fx-rate-direction.md)（独立维护任务，无 Story）。

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

### 11.8 返修记录（2026-11-12，审查 MINOR 处置）

审查结论见 §12（`Pass with issues`，3 MINOR）。本轮只处置 findings，不改 AC / Scope / Status。
基线仍为 `main` @ `e1730a0`；审查记录提交 `3539fb5`；本条记录提交见 §11.9。

#### F-051-1（MINOR）容差口径 —— 已按指示处理（不改 AC）

`server/test/integration/fxRate.service.test.js` 的 `TOLERANCE` 保持 `0.01`，并在常量上方加注释说明：

- 卡内 AC1 写「±1e-4」，**批准的计划 §8 已放宽为「量级 + 容差断言（如 |x-6.691|<0.01）」**，实现与计划一致；
- 放宽安全：方向错误的偏差是数量级（USD 6.691 vs 0.149 ≈ 45 倍，CAD ≈ 22.6 倍），0.01 仍能判错；
- **是否收紧到 1e-4 属 AC 文本口径，归 PM**；实现侧不擅自改 AC。

证据：注入反向缺陷后仍有 6 fail（见下），证明 0.01 的判定力足够。

#### F-051-3（MINOR）AC4 未走 HTTP 端点 —— 已修

原用例只走服务层（`upsertRate` + `buildFamilySummary`），绕过了 HTTP 层。本轮**新增 2 条用例**
（复用 `family.summary.test.js` 的 `request()` / `installAdminSession()` 同一套夹具）：

1. `AC4（端点级）：PUT 手动录入 USD 后 GET summary 折算方向正确`
   真实 `PUT /api/family/fx/rates/USD`（期望 201）→ 真实 `GET /api/family/summary`
   → 断言 `totalCny = 1000 × 7.2 = 7200`（±0.01）且 `> 7000`，并校验 `fxRates.USD === 7.2`。
2. `AC4：手动录入 HKD 量级 < 1（与采集端同语义）`
   补上原用例缺失的「HKD < 1」断言，并断言 `HKD 1000 × 0.85 ≈ 850`。

**可证伪性验证（负向对照，临时注入后已还原）**：

| 注入的缺陷 | 结果 |
|---|---|
| `fetchFromProvider` 改回不取倒数 | **6 fail**（方向/量级/入库/两条端到端/同语义） |
| `familySummary` 的 `amount * rate` 改成 `amount / rate` | **5 fail**，其中包含新增的两条 AC4 用例 |

即新增用例不是恒真断言，能捕捉「采集端被反向」与「折算端被反向」两类错误。

#### F-051-2（MINOR）AC5 未回收 —— **未做，按指示留给 PM**

AC5 要求「若 `getLatestRateDocs` 会新旧混排，须给出清理脚本或过滤方案，并实测跳变」。
Human 2026-11-11 已裁定 D-2「历史数据不迁移」，交付只在卡内 §9 记录后果。
**AC5 的文本回收需 PM 按 D-2 修订验收标准**；实现侧不改 AC、不写迁移脚本。
**交付点名：AC5 仍未回收，需 PM 处置。**

#### 本轮验证

| 命令 | 结果 |
|---|---|
| `npm run test:server` | **260 pass / 0 fail**（258 + 新增 2） |
| `npm run build --workspace client` | ✅ `✓ built` |
| `npm run lint --workspace client` | ✅ `0 errors, 5 warnings`（既存 fixture 警告） |
| `npm run docs:check` | ✅ `141 文档 / 1438 链接 / ERROR 0 / WARN 0` |

#### 边界

未改折算公式、手动录入语义、schema、UI、API 契约与 HTTP 路径；未迁移历史数据；
未改 `fxRate.service.js` 实现（只改测试与文档）。

### 11.9 提交

| SHA | 内容 |
|---|---|
| `3539fb5` | `docs(TASK-051): record independent review verdict`（审查记录） |
| 见 `git log -1` | `test(TASK-051): 返修 MINOR——AC4 端点级用例 + 容差口径说明` |

## 12. Review Record

> 由独立 Reviewer 填写；Implementer 未自评（本卡无自审记录）。判定词不是状态：本章不改变 Task Status，不构成合入许可。

### 12.1 结论

- **判定：PASS WITH ISSUES**（无 BLOCKER、无 MAJOR；3 条 MINOR）。
- 审查对象：`feature/TASK-051-fx-rate-direction` @ `4aeeb10`（`git status --porcelain` 为空）。
- 基线：本地 `main` @ `e1730a0`（**不用** `origin/main` @ `22f5f6e`，后者落后 4 个文档提交）。
- 改动范围：`git diff --stat main...HEAD` = **7 文件 / +376 −7**，与卡内 Scope 一致，无越界文件。
- 未审部分：真实 er-api 联网行为（审查期不发起外部请求，用固定 payload 替身）；历史库内既有记录（Human D-2 已决定不迁移）。

### 12.2 AC 逐条判定

| # | 标准 | 判定 | 证据 |
|---|---|---|---|
| AC1 | 先红后绿，固定 provider → USD≈6.6913 / CAD≈4.7558 / HKD≈0.8529，容差 ±1e-4 | ✅ 满足（容差实为 `0.01`，见 F-051-1） | 独立复现：旧实现 7 fail → 修复后 10 pass；`fxRate.service.test.js:28-34` |
| AC2 | 单测覆盖 ①采集方向 ②`upsertRate` 拒 `<=0`/非数 ③同 `(currency,date)` 幂等 ④缺字段抛错 | ✅ 满足 | 四项各有独立用例（`fxRate.service.test.js:90-176`） |
| AC3 | 端到端不 mock `getLatestRates`，USD 1000 ≈ ¥6,691，且改回旧方向必失败 | ✅ 满足 | `fxRate.service.test.js:179-228`；实测旧实现 `totalCny` 实际 149.45 |
| AC4 | 采集与手动录入同量级（USD/CAD>1、HKD<1），手动写入后折算方向不变 | ⚠️ 部分满足（见 F-051-3） | 走服务层 `upsertRate` + `buildFamilySummary`，未走两个 HTTP 端点；HKD<1 仅对采集值断言 |
| AC5 | 历史数据处置 + 混排方案 + 修复前后跳变可解释 | ⚠️ 部分满足（Human D-2 取代，见 F-051-2） | 卡内 §9 已记录后果与自愈路径；未给清理脚本/过滤方案，未实测跳变 |
| AC6 | 5 处文档与实现一致；JSDoc 写明 `base` 与取倒数 | ✅ 满足 | `fxRate.js:5-6`、`SERVER.md:98`、`PL-6-household.md:79`、`fxRate.service.js:67-82`；`API_CONTRACT.md:129`、`PRD.md:63` 经核对无相反表述 |
| AC7 | 客户端零补偿 | ✅ 满足 | `grep -rn "1 / rate\|/ rateToCny" client/src client/scripts` → 0 命中（exit 1） |
| AC8 | 独立 Reviewer 复核 | ✅ 满足 | 本记录；审查者未参与实现 |

### 12.3 独立实跑证据（不采信 §11 自述）

| 命令 | 结果 |
|---|---|
| `npm run test:server` | **258 pass / 0 fail**（23 个测试文件；`main` 基线 248，新增 10）✅ 与交付声称一致 |
| `npm run build --workspace client` | `✓ built in 3.34s`（仅既存 500 kB chunk 提示，exit 0） |
| `npm run lint --workspace client` | `0 errors, 5 warnings`（5 条均为既存 `client/scripts/fixtures/*.jsx` 的 react-refresh 警告） |
| `npm run docs:check` | `扫描 141 份文档；链接 1438 条；ERROR 0；WARN 0` |
| `git diff --stat main...HEAD` | 7 文件，与卡内 Scope 一致 |

> 环境说明：本沙箱默认禁止 `child_process.spawn`，`node --test`（每文件 spawn 子进程）与 esbuild 会报 `spawn EPERM`。取得真实输出的方法：对 22 个 `server/test/integration/*.test.js` **逐文件 `node <file>` 直接执行**（等价断言、非子进程隔离），累加各文件 `ℹ pass` / `ℹ fail`；client 的 `vite build` 在放开限制后正常。未以「无法运行」替代结论。

### 12.4 先验红复现（独立完成）

把 `fetchFromProvider` 临时还原为旧实现（`result[currency] = Number(rates[currency])`，并恢复旧的 USD/CAD/HKD 有限性预检），未改任何测试：

```
✖ fetchFromProvider：CNY base 的 provider 值必须取倒数      → USD 期望约 6.6913，实际 0.149448
✖ fetchFromProvider：量级断言——USD/CAD > 1，HKD < 1        → USD 折算率应 > 1，实际 0.149448
✖ fetchFromProvider：非法值抛错且错误信息含币种
✖ syncLatestRates：入库的 rateToCny 是「1 外币 = X CNY」    → USD 入库值应为 6.6913，实际 0.149448
✖ 端到端：固定 provider → 入库 → getLatestRates → buildFamilySummary 与人算一致
✖ 端到端：computeFamilySummary 全链路                      → 期望约 6691.29，实际 149.45
✖ 采集与手动录入同语义：同一量级
ℹ tests 10  ℹ pass 3  ℹ fail 7
```

还原修复后：`ℹ tests 10  ℹ pass 10  ℹ fail 0`，`git status --porcelain` 为空。

**红的真实性结论：成立。** 端到端被怀疑的 `getLatestRates` **未被 mock**（`fxRate.service.test.js:182` 注释 + 实际调用真实 `getLatestRates`，仅 `FxRate.find` 用内存存储替身），断言读的是「采集→入库→读取→折算」全链路，方向反了必然落到 149.45。

> 附注：交付计划 §11.3 记录的「7 fail」与我复现的「7 fail」一致；任务简报里提到的「5 条失败」与仓库记录不符，以实际 7 条为准。

### 12.5 Findings

| # | 严重度 | 位置 | 现象 | 修法方向 |
|---|---|---|---|---|
| F-051-1 | MINOR | `server/test/integration/fxRate.service.test.js:34` | 容差 `TOLERANCE = 0.01`，而 AC1 要求 ±1e-4；计划 §8 已把口径放宽到 0.01 并获批准。方向错误的偏差是 45 倍，0.01 仍足以判错，**未削弱判定力**，但卡内 AC 文本未同步 | 由 PM/Planner 把 AC1 的容差改成与计划一致，或在用例注释里写明「放宽理由 + 仍可判错的余量」；不要为了贴 AC 去收紧到 1e-4 造成 flaky |
| F-051-2 | MINOR | 卡内 `TASK-051-fx-rate-direction.md` §3 AC5 与新增 §9 | AC5 原文要求「若 `getLatestRateDocs` 会新旧混排，须给出清理脚本或过滤方案，并实测修复前后 `totalCny` 跳变可解释」。Human D-2 已裁定不迁移，交付仅在卡内 §9 记录后果，未给脚本/过滤，也未实测跳变。**决定本身合规**，缺口在 AC 文本未回收 | 归 PM：按 D-2 修订 AC5（改为「记录后果 + 提示运维手动触发一次同步」），使卡与决定一致；不要由 Implementer 私自改 AC |
| F-051-3 | MINOR | `fxRate.service.test.js:232-258` | AC4 后半句要求经 `PUT /api/family/fx/rates/:currency` 写入后 `GET /api/family/summary` 方向不变；实际是直接调 `upsertRate` + `buildFamilySummary`，**绕过了 HTTP 层**；且 `manual` 侧只断言 `USD>1`，未断言 `HKD<1` | 复用 `family.summary.test.js` 已有的 `request()` 夹具补一条端点级用例；或把 AC4 文本改成服务层口径 |

### 12.6 残余风险

1. **历史行仍反向**（Human D-2 接受）：`getLatestRates` 取最新一条，故修复后下一次 09:30 同步即自愈当日折算；但 `/api/family/fx/rates` 面板在新旧行被同日 upsert 覆盖前会**同屏混排** `0.1494` 与 `6.69`。已在卡内 §9 记录，属**已接受**风险，不是缺陷。
2. **provider 变更 base**：JSDoc 已写明依赖 `base=CNY`（`fxRate.service.js:67-82`）；若上游改 base，用例无法发现（用例固定 payload，只验证映射）。属已知盲区。
3. **浮点容差**：0.01 的组合在 USD/CAD/HKD 三个量级上都安全，不构成 flaky 风险。
4. **测试替身局限**：内存存储把 `.sort({date:-1,_id:-1})` 变成空操作（`fxRate.service.test.js:59`），故「取最新」语义未被这些用例覆盖；本任务不要求覆盖该语义，但不可据此认为已覆盖。

### 12.7 独立性声明

审查者未参与本任务的实现、计划编写或验收脚本编写；未修改任何业务代码、测试或 AC。§12.4 的临时回退在独立副本中进行，已还原并以 `git status --porcelain` 为空证净。判定不是合入许可，**Merged 与关闭归 Human**。


### 12.8 复审记录（第二轮，2026-11-12）

**对象**：`feature/TASK-051-fx-rate-direction` @ `0dc23d4`（返修提交 `0dc23d4`；首轮审查记录提交 `3539fb5`）。基线 `main` @ `e1730a0`。审查开始与结束时 `git status --porcelain` 均为空；未审到任何未提交的工作区改动。

**结论**：`Pass with issues`（维持首轮判定，3 项 MINOR 中 2 项已修、1 项按指示留 PM）。判定不是合入许可；Merged 与关闭归 Human。

#### 12.8.1 Findings 复核

| Finding | 首轮 | 本轮判定 | 依据 |
|---|---|---|---|
| F-051-1 容差口径 | MINOR | **已修** | 用例 `TOLERANCE` 上方新增注释：AC1 写 ±1e-4、**批准计划 §8 已放宽为 0.01**、方向错时偏差为 45×（USD）/22.6×（CAD）量级差故 0.01 仍可判错、**是否收紧归 PM**。`TOLERANCE` 保持 `0.01`，**AC1 文本逐字未改** |
| F-051-3 AC4 未走 HTTP 端点 | MINOR | **已修** | 新增 2 条用例，经真实 Express（`app.listen` + 复用 `family.summary.test.js` 的 `installAdminSession()` / `authHeaders()` / `request()` 夹具）打 `PUT /api/family/fx/rates/USD` → `GET /api/family/summary`；断言 `totalCny = 1000 × 7.2 = 7200`（±0.01）且 `> 7000`、`fxRates.USD === 7.2`；另补 manual 侧 `HKD < 1` 断言。运行时日志可见真实 `PUT status=201` / `GET status=200`，确认走的是 HTTP 层而非服务层直调 |
| F-051-2 AC5 未回收 | MINOR | **按指示未处理（正确）** | 卡内 AC5 行逐字未变；仅在 §11.8 点名「AC5 仍未回收，需 PM 处置」。**未私改 AC5** |

#### 12.8.2 回归与方向复核

- `test:server`：**260 / 260 pass，0 fail**（我逐文件就地跑并求和）。相对 `main` 的 248：+10（首轮采集方向用例）→ 258，+2（本轮 AC4 用例）= 260，与实现者声称一致；**未删除任何旧断言**（返修 diff 中 `assert` 仅新增，无 `-assert` 行）。
- 方向修复未被改动：`shared/services/fxRate.service.js` 仍为 `result[currency] = 1 / perCny;`。
- 前端零补偿成立：`git diff main..0dc23d4 --name-only` **无任何 `client/` 文件**。

#### 12.8.3 我独立完成的负向对照（证明新增用例可证伪）

| 注入的缺陷 | 结果 |
|---|---|
| `1 / perCny` 改回 `perCny`（采集端反向） | **6 fail**（方向 / 量级 / 入库 / 两条端到端 / 同语义） |
| `familySummary` 的 `amount * rate` 改为 `amount / rate`（折算端反向） | **5 fail，其中包含本轮新增的两条 AC4 用例** |

两处注入均在独立副本中进行、逐次还原并以再次全绿证净。说明新增用例不是恒真断言。

#### 12.8.4 残余风险

1. **AC5 文本仍未回收**（需 PM 按 Human D-2 修订）——属流程悬空，非实现缺陷。
2. 内存替身使 `.sort({date:-1})` 成为空操作，「取最新汇率」语义未被这些用例覆盖（既存盲区）。
3. 容差 0.01 与卡内 ±1e-4 的口径差异仍由注释承载，未上升为 AC 文本。

#### 12.8.5 独立性声明

审查者未参与本任务实现、计划编写或验收脚本编写；本轮未修改任何业务代码、测试或 AC/Status；未 `git add`/`commit`/`push`；未合并 `main`、未填 `Merged`。负向注入在 `.review-tmp/` 独立快照中进行并已还原，结束时 `git status --porcelain` 为空（仅含本记录改动）。判定不是合入许可，**Merged 与关闭归 Human**。

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。

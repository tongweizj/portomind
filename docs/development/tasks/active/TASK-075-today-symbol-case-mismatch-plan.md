# TASK-075 — 今日行情 symbol 未归一化（方案 A）实施计划

## Status

Status：Approved（2026-11-17，Human 批准「073～078 计划」；`Draft → Approved` 归 Human）

Owner：Planner（起草）；Implementer（待指派）

Related Task：[TASK-075-today-symbol-case-mismatch](./TASK-075-today-symbol-case-mismatch.md)（独立维护任务，2026-11-17 由 `backlog/` 移入 `active/`）

Related Spec / ADR：[ADR-003 symbol 后缀契约](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md)（Accepted，存储格式唯一来源）；发现来源 [PRICE-PIPELINE-REVIEW P0-4 / 附录 C](../../../os/architecture/PRICE-PIPELINE-REVIEW.md)

Branch / Base：当前 `main`（起草时与 TASK-073/077/078 同批；实施前以 `git branch --show-current` / `git rev-parse` 复核，见 [AGENTS §4](../../../../AGENTS.md)）；从最新 `main` 开 `feature/TASK-075-today-symbol-case-mismatch`

Approval：**已批准（2026-11-17，Human）**。本计划冻结任务卡 §6 的 **D-h = 方案 A**（由 Human 在 2026-11-17 本轮问答中选定：服务端/数据层返回 ADR-003 存储格式 symbol，客户端纯消费、零归一化逻辑），覆盖 AC1–AC4。方案 A 的实质是「**客户端零生产代码改动**」，依赖 TASK-073 + TASK-077 先落地；此取舍已获选定，`Draft → Approved` 仍须 Human 按 STATES §4 登记。

## 1. Intent

修复 P0-4「今日行情列表 44 资产中 29 个 CN-FUND 显示『近 14 天无数据 · 缺口』，但库中全有价格」——根因是归并端与查找端用原始 symbol（`001180.cn`）到 `priceWindow.latestBySymbol` 查表，而价格侧存储键为 `001180.CN`，精确匹配失败。

按 **方案 A** 实施（不改需求、不改产品行为）：

- **客户端零后缀派生 / strip 逻辑**（硬规则 #3、AC2）：`Today.jsx` 继续用服务端返回值的原始 `symbol` 做归并与查找，**不新增** `toUpperCase()` / `replace(/\.CN$/…)` 等任何内联处理。
- **一处定义**：symbol 存储格式由 [ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md) 唯一定义（按 `market` 派生大写后缀：`001180.CN` / `VOO.US` / `600519.SS`），由 [TASK-073 AC1/AC2](./TASK-073-price-pipeline-p0-data-correctness.md) 的 `shared/` 单一实现保证新数据，由 [TASK-077 AC1/AC2/AC5](./TASK-077-symbol-historical-data-migration.md) 迁移保证存量数据。
- 本卡的**真实工作**是：①前置依赖闸门（确认 073+077 已落地且**库已迁移**）；②API_CONTRACT 的 symbol 语义澄清（只引用 ADR-003，不复写后缀规则）；③真实数据 / 浏览器 E2E 验证 44/44 命中与零回归。**不写生产代码**即为方案 A 的正确实施结果。

覆盖 AC1–AC4；范围外事项见任务卡 §4（服务端 `shared/` 归一化层与迁移属 073/077，观测/熔断/新鲜度属 074，估值/再平衡规则不碰）。

## 2. Context

- **客户端数据流**（亲读）：
  - `getAssets()`（`client/src/services/asset.service.js:3-7`）→ `GET /assets`，返回 Asset 文档（含原始 `symbol`）。
  - `getPricesByDate()`（`client/src/services/price.service.js:11-13`）→ `GET /api/prices/date/:date`（[API_CONTRACT](../../../handbook/technical/API_CONTRACT.md) L97），返回 Price 文档数组。
  - `Today.jsx:37-88` 的 `loadPriceWindow()` 按 `row.symbol` 归并出 `latestBySymbol`；`:117` 用 `latestBySymbol.get(asset.symbol)` 查找。两端都用服务端返回的原样 symbol，**当前无任何归一化**（grep 确认 `Today.jsx` 仅搜索框有 `toLowerCase()`，与 symbol 契约无关）。
- **服务端链路**（亲读）：
  - `server/controllers/price.controller.js:48-57` → `priceService.getPricesByDate()`（`shared/services/price.service.js:14-20`）→ `pagedFind()` 直接返回 Price 文档，**无 symbol 转换**。
  - Asset / Price 两个 schema 的 `symbol` 均 `uppercase: true`（`shared/models/asset.js:10-19`、`shared/models/price.js:4-10`）；`Price` 唯一索引 `{symbol:1,timestamp:1}`（`price.js:23`）。
- **为什么方案 A 无需改客户端**：073 让新数据按 ADR-003 存储键写入，077 把存量 `assets`/`prices`/`transactions`/`portfolio.targets` 全部归一到同一格式（并删双键资产全部价格重采）。迁移完成后 `/assets` 与 `/prices/date/:date` 返回的 `symbol` 自然同为存储格式，`:117` 的精确匹配即命中。若在 API 响应层再做一次转换，反而是第二份归一化实现（违反硬规则 #1），且会掩盖 077 未完成的真实缺陷。
- **边界**：`getLatestPrices`（估值链路，`shared/services/marketData.service.js:12-38`）的 27/29 无价属 [TASK-073 AC2](./TASK-073-price-pipeline-p0-data-correctness.md)，与本卡通过 `AC3` 独立切分；本卡不声称估值已修。
- **排期前置**（任务卡 §7 已写明）：本卡 AC1 验收排在 073 + 077 之后；077 D-b 为「删光重采」，迁移期短期可能更缺价，故以**迁移完成后的真实库**为准，不用迁移中间态验收。

## 3. Repository Findings（2026-11-17 亲读，标注行号）

| # | 事实 | 落点 |
|---|---|---|
| F-01 | 归并键取 `row.symbol`：`acc.get/set(row.symbol, …)` | `client/src/pages/Prices/Today.jsx:54-58` |
| F-02 | 查找键取 `asset.symbol`：`latestBySymbol.get(asset.symbol)` | `client/src/pages/Prices/Today.jsx:117` |
| F-03 | `Today.jsx` 无内联后缀处理；唯一的 `toLowerCase()` 在搜索过滤（`:154-156`），不参与 symbol 契约 | grep 全文确认；`Today.jsx:49-65, 116-135` |
| F-04 | 价格窗口由 `getPricesByDate(date)` 拉取，按查询日归组（非解析 timestamp 切日），规避时区歧义 | `client/src/pages/Prices/Today.jsx:32-41`；`client/src/services/price.service.js:11-13` |
| F-05 | `/prices/date/:date` 控制器直通 `priceService.getPricesByDate`，无 symbol 转换 | `server/controllers/price.controller.js:48-57` |
| F-06 | `getPricesByDate` 返回 `pagedFind` 的原始 Price 文档 | `shared/services/price.service.js:14-20, 4-12` |
| F-07 | Asset / Price 的 `symbol` 均 `uppercase: true`，唯一索引在 Price 上 | `shared/models/asset.js:10-19`；`shared/models/price.js:4-10, 23` |
| F-08 | 根因是「两端均未归一化」；库中 `assets.symbol=001180.cn`（小写）与 `prices.symbol=001180.CN` 不匹配（历史数据） | 任务卡 §2；审阅 P0-1 / 附录 C |
| F-09 | `client/package.json` 有 `build` / `lint`，**无 `test` 脚本** → 本卡验证＝build + lint + 浏览器/真实库 E2E | `client/package.json:6-10` |
| F-10 | ADR-003 为存储格式唯一来源；073 负责代码层单一实现与四处接线，077 负责存量迁移与双键删价 | [ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md)；073 AC1/AC2；077 AC1/AC2/AC5 |
| F-11 | 077 AC5 已声明本卡 AC1（44/44 命中）以其迁移为前提；两卡不互相顶替验收 | 077 §7、AC5；本卡 §7、AC1 |

未核实项（诚实标注）：本轮只读源码与文档，**未连库、未跑浏览器**。迁移后 `/assets` 与 `/prices/date/:date` 实际返回值的逐字一致性、44/44 的真实命中数，须在实施阶段以真实库 + 浏览器 E2E 确认（AC1/AC4）；未取得前不得记为验证通过（[AGENTS §9](../../../../AGENTS.md)）。

## 4. Proposed Design

### 4.1 客户端：零改动（方案 A 的核心决策）

- **不改** `client/src/pages/Prices/Today.jsx` 的生产代码：保持 `:54-58` 与 `:117` 使用服务端返回的原样 `symbol`。
- **禁止**新增任何 `toUpperCase()` / `replace(/\.cn$/…)` / helper 归一化（AC2 检测式；硬规则 #1/#3）。搜索框的 `toLowerCase()` 仅用于文本匹配，保留。
- 因此本卡交付物**不是代码 diff**，而是「依赖闸门 + 文档澄清 + E2E 证据」。若实施者在 `Today.jsx` 写了归一化代码，属方案漂移，须停下回报（AGENTS §8）。

### 4.2 依赖闸门：确认服务端/数据层已交付（W1）

开工验证前必须确认（任一不满足 → 停止，不得用客户端补丁绕过）：

1. [TASK-073 AC1/AC2](./TASK-073-price-pipeline-p0-data-correctness.md)：`shared/` 存在唯一 `toStorageSymbol` / `toProviderSymbol`，档案建档/采集/`priceStorage`/`getLatestPrices` 四处接线；`grep` 无第二份后缀实现。
2. [TASK-077 AC1/AC2/AC5](./TASK-077-symbol-historical-data-migration.md)：迁移脚本已按 D-b 执行，**真实库**已归一——`assets` 44/44 存储格式、`prices` 双键资产已删并重采、`transactions`/`portfolio.targets` 无悬挂引用；077 AC5「32 持仓缺价 17→0、今日行情 44/44 命中」已有证据。
3. 两者 Status 由 Orchestrator 登记为已完成（卡片记录为准，非口传）。

### 4.3 API_CONTRACT 语义澄清（只引用，不复写）

- 在 [API_CONTRACT](../../../handbook/technical/API_CONTRACT.md) 对 `GET /assets` 与 `GET /prices/date/:date` 的 `symbol` 字段补一句：**返回值遵循 [ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md) 存储格式（按 `market` 派生大写后缀）**。
- **不**在 API_CONTRACT 复制后缀表、派生规则或 market 映射——按 [AGENTS §3](../../../../AGENTS.md) 单一来源原则，这些归 ADR-003；API_CONTRACT 只加链接与一句话语义。
- 端点行为代码**零改动**：不改 controller、不改 service、不改 schema。

### 4.4 E2E 验证（W3）

- 迁移完成后的**真实库** + 浏览器打开「今日行情」页：44 资产全部显示价格/涨跌幅，29 个 CN-FUND 不再「无数据/缺口」；缺口标注只在真实缺价或请求失败时出现。
- 统计断言：`failedCount`/缺口条数正确；其它页面（估值、价格同步卡片、原日志）零回归。
- 构建/静态：`npm run build --workspace client` + `npm run lint --workspace client`（入口 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)）；client 无 test 脚本（F-09），不虚构单测。

## 5. Work Breakdown

- [ ] W1（依赖闸门）核对 073 AC1/AC2 + 077 AC1/AC2/AC5 的完成状态与真实库迁移证据；任一不满足 → 停止并回报 Planner/Human（§4.2）。产出：Gate 记录（§6 / §11）。
- [ ] W2 API_CONTRACT 补一句 symbol 语义并链接 ADR-003（§4.3）→ 产出：文档 diff；端点代码零 diff。
- [ ] W3 真实库 + 浏览器 E2E：29 基金显示价格、44/44 命中、缺口/失败统计正确、其它页面零回归（AC1/AC4）→ 产出：E2E 证据（截图/记录 + 命中数）。
- [ ] W4 `npm run build --workspace client` + `npm run lint --workspace client`（F-09，无 test 脚本）→ 产出：验证记录（§11）。
- [ ] W5 交接独立 Reviewer 审查 → 产出：Review Record（§12）。

依赖顺序：W1 → W2（可并行但 W2 须在 W1 通过后才有意义）；W3 依赖 W1（迁移后库）；W4 可与 W3 并行；W5 依赖 W3+W4。

## 6. Decisions

| # | 事项 | 状态 / 依据 |
|---|------|-------------|
| D-h | 客户端 symbol 不匹配修复方案 | ✅ **已选定 = 方案 A**（Human 2026-11-17 本轮问答确认）。服务端/数据层返回 ADR-003 存储格式 symbol，客户端纯消费、零归一化。本计划 §4 落实。任务卡 §6/§8 的「待裁决」表述须同步为已选定（Planner 在本轮一并留痕，见 §9 记录）。 |
| 方案 A 的实质 | 客户端零生产代码改动 | ✅ 本计划核心取舍（§4.1）。`Today.jsx` 维持原样即正确实施；写归一化代码属方案漂移，停止回报（AGENTS §8）。 |
| 前置 | 073 + 077 先落地且库已迁移 | ✅ 任务卡 §7、本卡 AC1、077 AC5/§7 已冻结；W1 为硬闸门，不可用客户端补丁绕过。 |
| API_CONTRACT | symbol 语义澄清方式 | 建议只加一句 + 链接 ADR-003（§4.3），不复制后缀规则（AGENTS §3 单源）。属文档细节，范围内实施。 |

范围、AC、产品行为均无变更；若 W1 发现 073/077 未落地或迁移未执行，或实施中认为必须改客户端归一化逻辑，按 [EXECUTION_PLANS §5](../../../os/process/EXECUTION_PLANS.md) 与 [STATES §4](../../../os/process/STATES.md) 回 Draft 重批，不得擅自改方案。

## 7. Verification

命令入口唯一归属 [DEPLOYMENT.md §7](../../../handbook/ops/DEPLOYMENT.md)（此处只引用，不复制命令清单）。不写死用例数量，以实际输出为准。

| AC | 验证方法 | 预期结果 |
|---|---|---|
| AC1 | W1 闸门 + W3 真实库浏览器 E2E | 迁移后 44/44 命中，29 个 CN-FUND 正常显示价格/涨跌幅；「无数据/缺口」仅在真实缺价或请求失败时出现。前提未满足时 W1 停止，不出具通过结论 |
| AC2 | grep `Today.jsx` 无 `toUpperCase()` / `replace(/\.CN$/…)` 等内联后缀处理；client 全局无第二份归一化实现 | 检测式通过；搜索框 `toLowerCase()`（`:154-156`）不参与 symbol 契约，不计违规；无 client→shared 依赖 |
| AC3 | W1 核对 073 AC2 证据；E2E 明确区分估值页面表现 | `getLatestPrices` 27/29 无价仍由 TASK-073 AC2 独立验收；本卡列表修复不被视为估值链路已修 |
| AC4 | W3 E2E（29 基金显示、缺口/failedCount 统计正确、其它页面零回归）+ W4 build/lint | 真实浏览器与统计断言通过；`npm run build --workspace client` + `npm run lint --workspace client` 通过（client 无 test 脚本，F-09） |

覆盖缺口：计划阶段未连库、未跑浏览器；AC1/AC4 的真实命中数与零回归须在 Implementing 阶段以真实库 E2E 证据确认。W1 未通过即不得进入 E2E，更不得记为验证通过（AGENTS §9）。

## 8. Risks

| # | 触发条件 | 影响 | 应对 |
|---|----------|------|------|
| R-1 | 073/077 延期或库未真正迁移 | 29 基金仍「无数据」，方案 A 短期无效 | 任务卡已明示「短期列表仍坏，待 073/077」；W1 硬闸门；不得用客户端单行 uppercase 绕过（那是 D-h 方案 C，已被否决） |
| R-2 | 实施者在 `Today.jsx` 加归一化 helper | 第二份实现漂移、违反硬规则 #1/#3 与 AC2 | §4.1 明令禁止；AC2 检测式复核；发现即停止回报 |
| R-3 | 迁移中间态（双键已删未重采）下验收 | 误判 44/44 失败或误以为修复无效 | W3 以迁移**完成后**的真实库为准；077 D-b 删光重采期间不做本卡验收 |
| R-4 | 涨跌幅按日序列口径错（双轨合并问题） | 显示价格但涨跌幅异常 | 由 077 D-b 删双键重采解决（任务卡 R-3 指向 077）；W3 E2E 检查涨跌幅合理性，异常则回 W1 核对 077 执行 |
| R-5 | API_CONTRACT 复写后缀规则导致与 ADR-003 漂移 | 两处定义不一致（AGENTS §3 缺陷） | §4.3 只加一句 + 链接，不复制规则；Reviewer 核对单源 |

## 9. Rollback

- 代码：客户端生产代码零改动（§4.1），**无可回退代码**；W2 仅文档 diff，回退即还原 API_CONTRACT 该行。
- 数据：本卡不写任何数据；迁移与回退责任属 [TASK-077 §9](./TASK-077-symbol-historical-data-migration.md)（备份/`sync:db` 还原点），本卡不介入。
- 不可逆影响：无。若 E2E 失败，根因必在上游 073/077 或环境，回退本卡文档即可，不得在客户端打补丁掩盖。

## 10. Implementer Handoff

- 下一角色：Implementer（待指派）。
- 输入：本计划 + 任务卡（AC1–AC4、§6 D-h=方案 A）、§3 Findings 行号、§4 设计、§5 步骤、§7 验证映射。
- 范围与禁改：**不改** `client/src/pages/Prices/Today.jsx` 生产代码（§4.1）；**不改** server controller/service/schema（§4.3）；**不**新增 client 归一化 helper 或 client→shared 依赖（硬规则 #3）；**不**碰 073/074/076/077/078 范围。唯一允许的文件改动是 API_CONTRACT 的一行澄清。
- 授权：计划为 Draft，**未获 Human 批准前不得开工**；`Draft → Approved` 由 Human 登记（STATES §4）。D-h=方案 A 已由 Human 选定，但本轮选定不等于本计划已批准。
- 依赖：W1 硬闸门——073 AC1/AC2 + 077 AC1/AC2/AC5 完成且库已迁移；无其它新依赖。
- 预期产出：W1 Gate 记录、W2 文档 diff、W3 E2E 证据（命中数/截图）、W4 build/lint 记录、可审对象。
- 停止条件：W1 未通过、发现须改客户端归一化、或须改上游代码/数据 → 停止并报 Planner / Human（AGENTS §8）。
- 验证入口：[DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)；命令不在此重复。

## 11. Implementation Record

（实施后填写：实际改动文件与版本、基线、偏差及依据、验证结果、遗留事项。计划完成不等于已合入，Merged 由 Human 登记。）

## 12. Review Record

（由独立 Reviewer 按 [REVIEWER.md §7](../../../os/roles/REVIEWER.md) 填写：verdict、AC 对照、findings 与严重度、实跑/引用证据、残余风险与独立性声明。Implementer 不为自己的改动出具独立审查结论。）

## 13. Completion Record

（填写：AC 与验证证据引用、关闭依据、归档与移交、长期沉淀位置与证据入口。计划完成后随独立任务留在 `docs/development/tasks/active/`，结案后按 [DOCS.md §1.1](../../../os/standards/DOCS.md#11-story-交付目录与文档生命周期) 随卡片移到 `completed/`。Merged 仅引用 Human 登记，不自行判定。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求（D-h=方案 A 由 Human 本轮选定；客户端零改动、零业务规则，需求/AC 不变）。
- [x] 步骤可执行、依赖明确（W1–W5 与依赖顺序、W1 硬闸门）、AC1–AC4 均有验证方法（§7）。
- [x] 记录可追溯且只存一处（技术方案与记录在计划；需求/AC/Status 在任务卡；symbol 规则在 ADR-003；命令入口引用 DEPLOYMENT §7）；编号与相对链接正确（与任务卡同目录 `active/`）。

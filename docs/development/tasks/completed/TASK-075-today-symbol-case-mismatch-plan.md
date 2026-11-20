# TASK-075 — 今日行情 symbol 未归一化（方案 A）实施计划

## Status

Status：Completed（2026-11-20，参见 §13）

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
2. [TASK-077 AC1/AC2/AC5](./TASK-077-symbol-historical-data-migration.md)：获批隔离镜像已按 D-b 迁移和重采，资产 44/44 符合存储格式，交易和组合目标无悬挂引用。077 验收记录为最近价 44/44、持仓 32/32 有最近价，今日行情全量 42/44，按 Human 裁决排除两只上游无数据标的后为 42/42。见 [077 结案记录](./TASK-077-symbol-historical-data-migration-plan.md#13-completion-record)。
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

- [x] W1（依赖闸门）核对 073 AC1/AC2 + 077 AC1/AC2/AC5 的完成状态与真实库迁移证据；任一不满足 → 停止并回报 Planner/Human（§4.2）。产出：Gate 记录（§6 / §11）。
- [ ] W2 API_CONTRACT 补一句 symbol 语义并链接 ADR-003（§4.3）→ 产出：文档 diff；端点代码零 diff。
- [ ] W3 真实库 + 浏览器 E2E：29 基金显示价格、44/44 命中、缺口/失败统计正确、其它页面零回归（AC1/AC4）→ 产出：E2E 证据（截图/记录 + 命中数）。
- [x] W4 `npm run build --workspace client` + `npm run lint --workspace client`（F-09，无 test 脚本）→ 产出：验证记录（§11）。
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

### 给开发 Agent 的提示词（2026-11-18）

你是 PortoMind 的 Implementer。请按 Human 已批准的 TASK-075 方案 A 执行。先读 `AGENTS.md`、`client/AGENTS.md`、[任务卡 AC1–AC4 与 D-h](./TASK-075-today-symbol-case-mismatch.md) 和本计划 §4–§7。先检查工作树和基线，保留其它任务的改动。通过 W1 后，从最新 `main` 开 `feature/TASK-075-today-symbol-case-mismatch`。

1. **先核对 W1。** 复核 TASK-073 AC1/AC2 的已合入实现、独立审查证据和任务卡状态，以及 TASK-077 的结案记录和所选验收库的迁移、重采证据。截至本交接，073 的实现已合入，独立审查覆盖 AC1/AC2，但任务卡仍为 `Implementing`。按 §4.2 向 Orchestrator 报告这个缺口，待 073 结案依据和验收库都核实后进入 W2/W3。TASK-077 已 `Completed`，验收限于获批隔离镜像。确认浏览器连接的 API 实际读取该镜像或有同等迁移证据的验收库。禁止重跑 077 迁移或复用其删除清单。[TASK-073 审查](./TASK-073-price-pipeline-p0-data-correctness-plan.md#12-review-record) · [TASK-077 结案](./TASK-077-symbol-historical-data-migration-plan.md#13-completion-record)
2. **按方案 A 对齐契约。** 在 `API_CONTRACT.md` 的资产和按日价格端点说明中，注明返回的 `symbol` 遵循 ADR-003 存储格式，并链接 ADR。客户端以 API 返回的原样键归并和查找。保持生产代码零改动，禁止客户端大小写或后缀兜底、引入 `shared` 或在服务端重复派生。
3. **验证真实页面。** 用浏览器打开「今日行情」，核对资产与按日价格 API 的实际键、14 日窗口、29 个 CN-FUND 的价格及涨跌幅、缺口数和 `failedCount`。区分真实缺价和请求失败，并回归估值页面、价格同步卡片及日志。记录验收库、日期窗口、分子和分母、未命中标的和原因，附截图或可复核记录。按 DEPLOYMENT §7 运行 client build 与 lint。
4. **保留 TASK-075 自己的 AC1 判定。** TASK-077 的隔离库实采今日行情为 42/44，`VBG.TO` 和 `VBU.TO` 因 Yahoo `NOT_FOUND` 经 Human 裁决仅在 077 的验收中排除，得到 42/42。含历史的最近价 44/44 和去重持仓 32/32 属于不同指标。若 075 浏览器实测仍为 42/44，保留原始分母和两只标的的缺价证据，向 Human 请求 TASK-075 自身的裁决，AC1 保持待验收。估值读取按 TASK-073 AC2 独立验收。
5. **记录并交接。** 在本计划 §11 记录 W1 判定、文档 diff、版本、AC1–AC4 实测结果、失败和未验证项。把可审对象与证据交 Orchestrator，由其安排独立 Reviewer。发现需变更获批方案、产品代码或上游数据时，停止受影响的工作并上报。[DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)

## 11. Implementation Record

### 2026-11-18 · W1 前置复核

**W1 未通过。** 本次在 `feature/TASK-077-symbol-historical-data-migration` @ `38368ce` 复核。`git ls-remote` 确认远端 `main` 同为 `38368ce`，本地 `main` 为 `fc1c728`。开工前已有开发顺序、075 交接提示词和 077 结案计划三处未提交改动。本轮只追加本节，保留原改动。075 分支尚未创建，API_CONTRACT 和生产代码 diff 均为空。

- **TASK-073。** PR #58 的合入提交 `fc1c728` 已在远端基线中。`shared/utils/symbol.js` 定义 `toStorageSymbol` / `toProviderSymbol`，已核对资产建档、采集、价格存储、`getLatestPrices` 和完整性检查的调用。[独立复审](./TASK-073-price-pipeline-p0-data-correctness-plan.md#12-review-record)对 `42e5d8d` 的范围内判定为 `Pass with issues`，AC1/AC2 满足，剩余 F-05 为 MINOR。基线与审查记录提交 `926660b` 在四个 workspace 内无差异。任务卡仍为 `Implementing`，[结案节](./TASK-073-price-pipeline-p0-data-correctness-plan.md#13-completion-record)仍是占位。请 Orchestrator 协调 Human 确认关闭并登记结案依据。
- **TASK-077 获批隔离镜像。** [结案记录](./TASK-077-symbol-historical-data-migration-plan.md#13-completion-record)确认 `Completed`。核对本机私有恢复目录的 `migration-audit.json` 和 `post-collection-ac5.json`，目标均为 `portomind_task077_probe_dev`，11 月 17 日实采 42/44。今日行情原始口径 42/44，`VBG.TO`、`VBU.TO` 均为 Yahoo `NOT_FOUND`，077 按其 Human 裁决为 42/42。含历史的最近价 44/44，去重持仓 32/32。组合专用修正后，结案回读显示 53 个目标和 50 条交易均精确匹配资产。
- **当前候选验收库。** 本机 6600 为 Vite，8080 为开发 API。客户端配置使用同源 `/api`，Vite 默认转至 8080。当前 `server/.env` 配置目标为另一已迁移库 `portomind_task077_restore_test`。只读实查确认四个集合 UUID 与索引指纹均匹配 `%LOCALAPPDATA%/PortoMind-TASK-077-20261118-DbMFmv/migration-audit.json`；资产、交易、组合的内容指纹也一致，44/44 资产为规范键，50 条交易、53 个组合目标均无悬挂。价格 32,332 条，与同目录 `post-collection.json` 的 11 月 18 日重采后计数相符；迁移后、重采前的审计价格指纹与当前值有差异。重采文件记载成功 42/44，同两只标的为 Yahoo `NOT_FOUND`。同目录的 `frontend-browser.json` 早于当前 API 进程启动，保留候选库的历史浏览器实测 42/44。当前进程实际读取该库仍待用当前浏览器的鉴权请求核实。以上核对仅读取数据与已有文件。

| AC | 当前证据与待验证项 |
|---|---|
| AC1 | 待验收。075 未跑浏览器，历史 42/44 保留原始分母。075 若复现，提交两只未命中标的的证据并请 Human 独立裁决。 |
| AC2 | 静态核对 `Today.jsx` 直接用 `row.symbol` 归并、`asset.symbol` 查找，`toLowerCase()` 仅用于搜索。客户端无共享派生函数引用或 `@portomind/shared` 依赖。契约文档待 W2。 |
| AC3 | TASK-073 独立复审已覆盖 `getLatestPrices` 派生键及写入路径。075 的估值页面回归待 W3。 |
| AC4 | 待 W3/W4。尚无 075 的 14 日窗口、29 个基金价格及涨跌幅、缺口与 `failedCount`、同步卡片、日志回归或 build/lint 实跑。 |

Orchestrator 交接：先回收 TASK-073 的 Human 结案依据，并核实浏览器所连 API 的实际数据库。两项落实后，从最新 `main` 创建 075 分支，继续 W2–W4。独立审查待 W5 安排。

### 2026-11-18 · Human 结案确认及 W1 复查

- Human 在 TASK-075 对话中明确确认 TASK-073 已正式结案。复查本地与远端 `main`（均为 `75c11ec`），TASK-073 任务卡仍为 `Implementing`，计划 §13 仍是占位。请 Orchestrator 根据本次 Human 确认登记结案，满足本计划 §4.2 的卡片记录要求。
- 验收浏览器访问 `http://localhost:6600/api/auth/session` 得到 `authenticated: false`。已确认验收入口可达，当前尚无鉴权数据回读来证明运行中的 API 实际读取候选库。本轮未执行 W3 浏览器验收。

### 2026-11-18 · W1 通过，W2–W4 实施与取证

- **基线与 W1。** Human 确认 TASK-073 完成并指定已迁移的 `portomind_task077_restore_test`。工作树内 TASK-073 任务卡已登记 `Completed`，该登记尚未提交。上文的独立审查、迁移审计及重采证据复用。从与远端一致的 `main` @ `75c11ec` 开 `feature/TASK-075-today-symbol-case-mismatch`，保留既有工作树改动。使用独立的本地验收进程加载当前 Express 应用，在应用进程内确认实际连接的 MongoDB 库名，再监听 `127.0.0.1:8185`。Vite 在 `127.0.0.1:6685` 使用该 API。首次登录被现有开发白名单拒绝，仅在验收进程的环境中明确允许 `http://127.0.0.1:6685`，重试成功。原开发 API 和 Worker 未改动。
- **W2 文档与偏差。** [API_CONTRACT](../../../handbook/technical/API_CONTRACT.md#接口清单) 的 `GET /api/assets` 响应说明已链接 ADR-003。按日价格端点的同一说明试写后撤回。其底层只读服务在真实库返回了 6 个旧裸码键 `000191`、`000942`、`ARKK`、`CQQQ`、`TLT`、`VCR`，无条件格式承诺与现有数据不符。按计划停止该处改动并上报。客户端、服务端、Worker、shared 的生产代码 diff 均为空。业务数据仅读取，未执行采集或迁移。
- **W4。** Client build 成功，仍有大于 500 kB 的分块告警。Lint 0 errors、5 条既有 Fast Refresh warnings。API 文档改动的空白检查通过，ADR 链接目标存在。

| AC | 实测与边界 |
|---|---|
| AC1 | 浏览器「今日行情」实测 **42/44**，14 日窗口为 **2026-11-05 至 2026-11-18**（America/Toronto）。缺口 2，分别为 `VBG.TO`、`VBU.TO`，11 月 18 日重采日志均为 Yahoo `NOT_FOUND`。Human 在 TASK-075 对话中批准这两只仅作为本卡 AC1 的覆盖率例外，例外口径为 **42/42**。浏览器 29/29 CN-FUND 有价，**0/29** 显示涨跌幅。只读核实 29 只均只有 11 月 18 日有精确匹配的价格，页面以 `—` 显示。涨跌幅待验收，AC1 整体暂未通过。 |
| AC2 | `Today.jsx` 静态核对通过。浏览器鉴权读回 `/api/assets` 为 44 条标准键（含 `001180.CN`），11 月 18 日日价为 41 条（含同一精确键）；11 月 17 日日价为 14 条，其中 `000942`、`ARKK`、`CQQQ`、`TLT`、`VCR` 为裸码。服务级全窗口另见 `000191`。完整的两端契约尚不能确认。 |
| AC3 | 同库独立实跑 `getLatestPrices`，44/44 个资产键有含历史的最近价。浏览器家庭总览与 CA-家庭RESP 组合详情成功展示市值，持仓页加载 12 行。TASK-073 读取证据独立于 075 窗口覆盖。 |
| AC4 | 浏览器 14 个日请求均成功，首次为 HTTP 200、复访为 304，`failedCount=0`，无部分加载失败横幅。四个周末日返回空数组。仅上述两只标的显示「近 14 天无数据 · 缺口」。同步卡片显示目标市场日 **11 月 17 日，应采 / 已采 9 / 44**，与候选库的历史浏览器记录一致。服务器日志与任务日志页均成功加载，任务日志表显示 20 行。看板另显示一条再平衡建议失败记录，详情为缺 `000191.CN` 价，与本次实跑的估值结果分别保留。未注入日请求失败。Build/lint 已通过；基金涨跌幅仍缺数据。 |

可复核记录：本机 `logs/app-2026-11-18.log` 中 20:53:57–20:55:20 ET 的 `HTTP_ACCESS`，可按 `/api/assets`、`/api/prices/date/`、`/api/family/summary`、`/api/portfolios/`、`/api/cron/status`、`/api/logs` 筛选。上游失败原因见 `%LOCALAPPDATA%/PortoMind-TASK-077-20261118-DbMFmv/post-collection.json`。

Orchestrator 交接：可审对象为当前分支的资产接口文档 diff、本节浏览器及服务级证据。请协调按日价格端点的存量裸码和基金第二个价格日的处置。如需补数据或改变契约范围，先取得相应裁决。该范围内的 W2/W3 待闭环，独立 Reviewer 尚待安排。

### 2026-11-18 · 回补后复核 AC2 的价格冲突

验收库 `portomind_task077_restore_test`，生产代码基线 `75c11ec`。按接口的 `America/Toronto` 市场日分组，对同一标的、同一天的每个键取最新的一条价格，再比较数值。下表只统计 2026-11-05 至 2026-11-18 的验收窗口，同日双键的计数单位为「标的 × 市场日」。

| 旧键 | 标准键 | 同日双键 | 价格不同 |
|---|---|---:|---:|
| `000191` | `000191.CN` | 5 | 0 |
| `000942` | `000942.CN` | 9 | 0 |
| `ARKK` | `ARKK.US` | 9 | 8 |
| `CQQQ` | `CQQQ.US` | 9 | 9 |
| `TLT` | `TLT.US` | 9 | 9 |
| `VCR` | `VCR.US` | 9 | 8 |
| **合计** | | **50** | **34** |

同库只读复核 29/29 CN-FUND 在窗口内均已有至少两条标准键价格记录。浏览器复验及 AC1、AC3、AC4 的判定见下方独立复审；本轮未重跑页面。全历史同口径另得 67 处同日双键，其中 45 处价差，另有 8,679 个市场日标的组合只有旧键价格。处置范围须明确是否保留这些旧键独有的历史，以及冲突日以哪套价格为准。AC2 是唯一未满足的验收项。请 Orchestrator 协调 Human 裁决；本轮只读，未修改行情或生产代码。

### 2026-11-18 · 六个裸码的定向回补、清理与验收

- **范围及裁决。** Human 授权在 `portomind_task077_restore_test` 运行专用脚本，要求优先补齐现用历史。首次默认清理因 8,679 个标的日仅旧键有价而退出，复查确认零删除。使用同一项目行情适配器向天天基金与 Yahoo 取价，仅对六只标的的原有缺失日期使用 `$setOnInsert` 写入 **8,471** 条标准键交易日价格。已逐文档验证原有 78 条标准键价格和 10,832 条裸码均未被该步骤改写。剩余 **208** 个标的日均无 Yahoo 日线且项目市场日历为休市，包括周末 192 个、工作日节假日 16 个。Human 随后确认仅保留其归档并清理六个裸码。
- **归档与执行。** 私有恢复目录 `%LOCALAPPDATA%/PortoMind-TASK-075-recovery` 留有原预演、上游返回暂存和补写 ID 台账 `20261118-212259-7af0be4b-backfill-inserts.ejson`。最终归档 `20261118-final-c13e4921-bare-prices.ejson` 含全部 **10,832** 条旧记录，与回补前的裸码数据逐条一致，SHA256 为 `d87df76dfe76abdb370e34d861563542eff76e4afa6f1df5acefbbb0f1dc45a7`，同前缀 `-preview.json` 保留逐日明细。清理前复核集合 UUID、归档哈希和 208 个获批日期，没有近期 `RUNNING` 任务。使用 [专用脚本](../../../../scripts/retire-task075-bare-prices.cjs) 清理 10,832 条，6 个裸码余量 0，读回确认清理前后的 8,549 条标准键价格指纹一致。未运行 TASK-077 迁移或使用其删除清单。
- **AC2 实施复验。** 全库读回 44 个不同价格键均符合 ADR-003。已登录浏览器逐日请求 2026-11-05 至 2026-11-18 的 `/api/prices/date/:date`，14/14 成功，分页完整，共 424 条，没有裸码。刷新「今日行情」显示 44 行、42 行有价，29/29 CN-FUND 有涨跌幅，缺口仍仅为 Human 已批准的 `VBG.TO`、`VBU.TO`，无部分加载失败。验收库另实跑 `getLatestPrices` 为 44/44。[API_CONTRACT](../../../handbook/technical/API_CONTRACT.md#接口清单) 的资产及按日价格端点均已链接 ADR-003。生产代码仍为 `75c11ec`，沿用同一代码版本的 build/lint 和 §12 其余回归证据。
- **交接。** AC2 的实施验证通过，提交给 Orchestrator 协调独立 Reviewer 复审 R2。下方历次独立审查保留原判定，Task 仍待独立审查和 Human 结案。

## 12. Review Record

### 2026-11-18 · 第一轮独立审查

**判定：Fail。** 审查对象为 `feature/TASK-075-today-symbol-case-mismatch` @ `75c11ec` 的工作区快照，范围为 API_CONTRACT 的资产接口改动、§11 的 075 交付证据及对应的既有行情链路。客户端、服务端、Worker 和 shared 的生产代码相对基线无差异。工作区其他文档改动未纳入本轮审查。Reviewer 未参与 075 实现或交付验收。

| AC | 结论 | 证据 |
|---|---|---|
| AC1 | 不满足 | 11-05 至 11-18 市场日窗口，实际服务读回覆盖 42/44，缺 `VBG.TO`、`VBU.TO`。按 §11 记载的本卡 Human 裁决，价格覆盖按 42/42 通过；29/29 CN-FUND 有价，0/29 有第二个精确匹配的价格日，涨跌幅要求未满足（R1）。 |
| AC2 | 不满足 | 客户端精确匹配及零归一化通过静态核对；按日价格服务仍返回 6 个裸码，对应资产端均为标准键，两端同键契约未满足（R2）。 |
| AC3 | 满足 | 同一验收库独立调用 `getLatestPrices`，最近价 44/44 命中。估值页面证据引用 §11 的浏览器记录，复核本机日志中家庭总览及组合请求成功。 |
| AC4 | 不满足 | 29 只基金均有价格但涨跌幅仍为「—」（R1）。§11 的成功请求、缺口、看板、日志、build/lint 证据继续有效；本轮另外以一次失败请求验证 `failedCount=1`，验证限于实际归并函数，未补跑浏览器失败展示。 |

| 编号 | 严重度 | 现象与处置 |
|---|---|---|
| R1 | BLOCKER | [今日行情归并代码](../../../../client/src/pages/Prices/Today.jsx#L69) 需要两个价格日计算涨跌幅。指定验收库 29 个 CN-FUND 各只有一个精确匹配的价格日，与交付浏览器的 0/29 显示涨跌幅一致。维持缺值「—」。由 Orchestrator 协调 Human 确认真实历史净值回补或验收口径。 |
| R2 | BLOCKER | [按日价格读取](../../../../shared/services/price.service.js#L17) 在验收窗口返回 `000191`、`000942`、`ARKK`、`CQQQ`、`TLT`、`VCR` 六个裸码；44 个资产全部为标准键，[页面](../../../../client/src/pages/Prices/Today.jsx#L117) 无法将这些日价和标准资产键归并。一次性对照以相同的两天数据调用实际归并函数，第二日为裸码时标准键的涨跌幅为 null，使用同一标准键时能计算；注入的单日请求失败在两个场景均计为 1。认可实施者撤回按日价格端点的不实承诺。由 Orchestrator 协调数据或服务端契约，方案变更按批准流程处理。 |

本轮只读连接指定的 `portomind_task077_restore_test`，调用实际按日价格和最近价服务，并核对交付时段的行情及估值 HTTP 日志。一次性 stdin 探针只替代请求输入，不入库。浏览器、build/lint 采用 §11 的实施记录，本轮未重跑；文档检查及审查范围内的差异空白检查通过。未执行历史回补、迁移或生产代码修改。

### 2026-11-18 · 历史回补后复审

**判定：Fail，剩余 AC2 未满足。** 审查对象为同一分支 `75c11ec` 的工作区快照及用户回补后的验收库 `portomind_task077_restore_test`。客户端、服务端、Worker 和 shared 的生产代码仍与基线一致。Reviewer 未参与历史回补、075 实现或交付验收。

| AC | 复审结果 | 证据 |
|---|---|---|
| AC1 | 满足 | 在验收浏览器重开今日行情，44 行中 42 行有价，只有已批准排除的 `VBG.TO`、`VBU.TO` 显示缺口。29/29 CN-FUND 显示价格和涨跌幅，R1 关闭。 |
| AC2 | 不满足 | 客户端仍按原样键精确匹配，44 个资产均为标准键；11-05 至 11-18 的按日价格服务依然返回六种裸码，R2 维持。 |
| AC3 | 满足 | 同库再次调用 `getLatestPrices`，44/44 均有最近价；估值页面证据沿用首轮独立审查。 |
| AC4 | 满足 | 浏览器实际验证 29 只基金的涨跌幅和两项缺口；实际归并函数使用真实日价时 14 天请求均成功、`failedCount=0`，首轮受控失败对照为 1。其它页面和 build/lint 沿用 §11 首轮证据。另在浏览器验证 `003949.CN` 显示 ¥1.244、▲ 0.06%，详情的 30 日迷你走势已绘出 13 个点。 |

**R2（BLOCKER）**：再次读出 `000191`、`000942`、`ARKK`、`CQQQ`、`TLT`、`VCR`。本轮窗口中，这些裸码出现的每个日期都有对应标准键，六只标的均已有可显示的涨跌幅。按每天各键最新一条比较，50 个标的日期同时有两套键，其中 34 个价格值不同。本轮页面覆盖已恢复，按日接口统一返回标准键的验收条件仍未达成。由 Orchestrator 协调处置口径；既有 D-h 约定客户端精确消费。

本轮独立实跑真实库按日与最近价服务、现有页面归并函数、浏览器列表及详情。生产代码与先前回归证据相同。本轮不涉及数据库写入。

### 2026-11-18 · 裸码清理后独立复审

**判定：Pass，R2 关闭。** 审查对象为 `feature/TASK-075-today-symbol-case-mismatch` @ `75c11ec` 的当前工作区与获批验收库 `portomind_task077_restore_test`。生产代码与上一轮相同，资产和按日价格两条 API 契约均引用 ADR-003。定向清理脚本以工作区文件核对。Reviewer 未参与本轮回补或清理实施。

| AC | 结果 | 复测证据 |
|---|---|---|
| AC1 | 满足 | 浏览器 44 行中 42 行有价，按本卡批准口径 42/42。缺口仅 `VBG.TO`、`VBU.TO`，29/29 CN-FUND 显示涨跌幅。 |
| AC2 | 满足 | 44/44 资产键规范。以实际页面归并函数调用按日价格服务，11-05 至 11-18 的 14 日窗口无裸码、无分页截断。全历史 distinct 44 个价格键均能与资产精确匹配且符合 ADR-003，专用脚本只读预演的六个裸码余量为 0。 |
| AC3 | 满足 | 同库独立调用 `getLatestPrices`，44/44 有最近价。估值页面回归沿用首轮证据。 |
| AC4 | 满足 | 浏览器重验价格、涨跌幅和缺口；14 日服务均成功、`failedCount=0`。复用此前的单日请求失败对照、看板与日志回归、同生产代码版本的 build/lint。 |

独立核对私有恢复包的 SHA256 与归档条数，10,832 条旧记录可读，目标集合 UUID 与归档一致，保留的 8,549 条标准键价格仍匹配归档指纹。208 个仅留归档的标的日期依 §11 的 Human 裁决保留。另实跑清理脚本语法检查和无写入预演，未再次执行清理。复审结论适用于上述验收库及当前工作区，任务关闭由 Human 决定。

## 13. Completion Record

2026-11-20，原任务卡已登记完成，本次核对证据后归档。§11 和 §12 的浏览器验收与独立复审支持 AC1–AC4，最终结论为 Pass。获批验收库的今日行情实测 42/44，按本卡批准的两只上游缺价例外为 42/42，29 个 CN-FUND 均显示价格和涨跌幅。实现 `9436bb3` 随 PR #59 进入主干（`f7ef68a`）。

## 自检

- [x] Task 与批准依据对应，方案未改变需求（D-h=方案 A 由 Human 本轮选定；客户端零改动、零业务规则，需求/AC 不变）。
- [x] 步骤可执行、依赖明确（W1–W5 与依赖顺序、W1 硬闸门）、AC1–AC4 均有验证方法（§7）。
- [x] 记录可追溯且只存一处（技术方案与记录在计划；需求/AC/Status 在任务卡；symbol 规则在 ADR-003；命令入口引用 DEPLOYMENT §7）；编号与相对链接正确（与任务卡同目录 `active/`）。

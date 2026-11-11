# TASK-072 — API 契约残差收敛实施计划

## Status

Status：Approved（2026-11-11，Human 指令「一次性完成 071、072 两个任务」；`Draft → Approved` 归 Human）

Related Task：[TASK-072](../../tasks/active/TASK-072-api-contract-residuals.md)（独立维护任务，无 Story）。

Branch / Base：`main` @ `c7a2751`（含 `v1.0.0` 基线）。实施时从最新 `main` 开 `feature/TASK-072-api-contract-residuals`。

Approval：**已批准（2026-11-11，Human）**。依据 Human 指令「写一个提示词，让开发一次性完成 071，072 两个任务」；`Draft → Approved` 归 Human（[STATES.md](../../../os/process/STATES.md) §4）。

## 1. Intent

契约主体已完成（见任务卡 §1.1），本计划只做三件事：**让 lint 归零、把关键 CRUD 纳入契约测试、把响应形状例外写清**。不改任何响应结构或状态码。

## 2. Context

- API 契约单一归属：[API_CONTRACT.md](../../../handbook/technical/API_CONTRACT.md)（62 行表格覆盖 64 个端点）。
- 测试入口：`npm run test:server`（当前 240 pass / 0 fail，2.2s）。
- 前端门禁：`npm run build --workspace client`（通过）、`npm run lint --workspace client`（**3 error**）。
- 测试工具：`server/test/helpers/auth.js`（`installAdminSession`、`cookieHeader`、`stubAuthModels`）、`server/test/helpers/modelStubs.js`（`applyWorld`）；契约测试范式见 `server/test/integration/api-contract.test.js`。

## 3. Repository Findings（2026-11-09 亲跑）

```
$ npm run test:server
ℹ tests 240 / pass 240 / fail 0

$ npm run build --workspace client
✓ built in 3.50s

$ npm run lint --workspace client
✖ 8 problems (3 errors, 5 warnings)
```

3 个 error（`npx eslint . -f json` 定位）：

| 文件 | 行 | 规则 | 信息 |
|---|---:|---|---|
| `client/scripts/fixtures/task063-fixture.jsx` | 450 | `no-unused-vars` | `'failed' is assigned a value but never used` |
| `client/scripts/verify-price-display.cjs` | 29 | `import/no-dynamic-require` | `Definition for rule ... was not found` |
| `client/vite.config.js` | 16 | `no-undef` | `'process' is not defined` |

`client/eslint.config.js` 现状：单段配置，`languageOptions.globals = globals.browser`，`files: ['**/*.{js,jsx}']` —— 未覆盖 node 环境文件，也未忽略 `scripts/**`。

## 4. Proposed Design

### 4.1 Lint 修复（配置为主，代码最小改动）

1. `client/eslint.config.js` 追加一段**只针对 node 文件**的配置：

```js
{
  files: ['vite.config.js', 'scripts/**/*.{cjs,js}'],
  languageOptions: { globals: globals.node },
}
```

2. `client/scripts/verify-price-display.cjs:29`：删除 `// eslint-disable-next-line import/no-dynamic-require`（规则未安装，disable 本身即错误）。
3. `client/scripts/fixtures/task063-fixture.jsx:450`：删除未使用的 `const failed = results.filter(...)`（`payload` 只使用 `results` 与 `failures`，行为不变）。

> `src/**` 的 browser 环境配置**不动**，避免掩盖真实问题。

### 4.2 契约测试补充（新建文件，不改既有用例）

新建 `server/test/integration/api-contract.crud.test.js`，复用 `helpers/auth.js` + `modelStubs.js`，按现有范式 stub service（不连真实 DB）。用例：

| # | 用例 | 断言要点 |
|---|---|---|
| 1 | 组合 CRUD 全链路 | `POST /api/portfolios` → `201` + `success:true`；`GET /api/portfolios/:id` → `200`；`PUT` → `200`；`DELETE` → `200` 且 `data` 含 `{portfolio,deletedTransactions,deletedRebalanceRecords}` |
| 2 | 组合 404 / 400 | 不存在 id → `404`；非法 ObjectId → `400`（`success:false` + `traceId`） |
| 3 | 交易 CRUD | `POST /api/transactions` → `201`（含 `warnings` 字段）；`GET /api/transactions` → `data[]` + `pagination{page,pageSize,total}`；`GET /:id` 缺失 → `404`；`DELETE` → `200` |
| 4 | 组合交易子资源 | `GET /api/portfolios/:pid/transactions` → `data[]` + `pagination`（默认 `pageSize=50`） |
| 5 | 提醒规则 CRUD | `POST /api/alerts/rules` → `201`；`GET /api/alerts/rules` 列表；`GET/:id` → `200`；`PUT` → `200`；`DELETE` → `200`；再 `GET/:id` → `404` |
| 6 | `users` 包装形状锁定 | `GET /api/users` → `data` 为 `{items:[...]}`（**不是数组**），且不含 `passwordHash` |
| 7 | 列表分页形状一致性 | `assets` / `portfolios` / `transactions` / `prices/today` 四个列表响应的 `pagination` 均有且仅有 `{page,pageSize,total}` |
| 8 | 非列表端点无分页 | `/api/portfolios/summary`、`/api/cron/status`、`/api/users` 的响应**不含** `pagination` 键 |

> 第 7/8 条把「前后端不再猜结构」变成可执行断言；第 6 条锁定 `{items}` 例外，防止后续被误改。

### 4.3 文档标注（集中一处，不逐行重复）

在 `API_CONTRACT.md`「通用响应」之后新增一小节「**响应形状例外**」：

- `/api/users` 列表返回 `{items:[...]}`（**全仓唯一**的包装式列表；保持现状，不改为裸数组）；
- `/api/valuations`、`/api/family/fx/rates` 返回**裸数组、不分页**（数据量有界）；
- `/api/cron/status` 返回**对象快照**、非列表；
- 其余列表端点返回 `data: []` + `pagination`；非列表端点**不含** `pagination` 键；
- `/api/valuations` 目前**无前端消费方**（server-only），前端不建 service 属预期。

### 4.4 注释修正

`client/src/pages/Prices/History.jsx:1` 的 `// src/pages/Price/History.jsx` → `// src/pages/Prices/History.jsx`。

## 5. Work Breakdown

### P1 · Lint 归零（0.5h）

- [ ] 按 §4.1 改 `client/eslint.config.js`、删 1 行 disable 注释、删 1 行未使用变量。
- **验收**：`npm run lint --workspace client` exit 0（3 error → 0；warning 仍为 5）。

### P2 · 契约测试（2h）

- [ ] 新建 `server/test/integration/api-contract.crud.test.js`，实现 §4.2 的 8 条用例。
- [ ] 只加不改：不动 `api-contract.test.js` 既有 10 条。
- **验收**：`npm run test:server` → 240 + 8 = **248 pass / 0 fail**。

### P3 · 文档与注释（0.5h）

- [ ] `API_CONTRACT.md` 增「响应形状例外」小节（§4.3）。
- [ ] 修正 `History.jsx` 顶部注释（§4.4）。
- **验收**：`npm run docs:check` 0 ERROR。

### P4 · 全量验证与交接（0.5h）

- [ ] 四项实跑并存档输出：`npm run lint --workspace client`、`npm run build --workspace client`、`npm run test:server`、`npm run docs:check`。
- [ ] `git diff --stat` 复核范围：只应出现 `client/eslint.config.js`、2 个 scripts 文件、`client/src/pages/Prices/History.jsx`、1 个新测试文件、`API_CONTRACT.md`。
- [ ] 证明零行为变更：`git diff --stat -- server/routes shared server/controllers` 为空。

## 6. Decisions

无新增待决事项。Human 已于 2026-11-09 决定：`/api/users` 保持 `{items}` 并写入文档（不改破坏性结构）。

## 7. Verification

| AC | 方法 | 预期 |
|---|---|---|
| AC-01 | `npm run lint --workspace client` | exit 0，0 error |
| AC-02 | `npm run test:server` | 248 pass / 0 fail |
| AC-03 | `npm run docs:check`；人工核对新增小节 | 0 ERROR；5 处例外均写明 |
| AC-04 | `npm run build --workspace client` | exit 0 |
| AC-05 | `git diff --stat -- server/routes shared server/controllers` | 空 |
| AC-06 | 读 `History.jsx:1` | 路径为 `src/pages/Prices/` |

## 8. Risks

| 风险 | 影响 | 缓解 |
|---|---|---|
| eslint 配置放宽到 `src/` | 真实问题被掩盖 | node 配置仅匹配 `vite.config.js` 与 `scripts/**` |
| 新测试 stub 不完整导致假绿 | 断言无效 | 沿用既有 helper；每条用例至少一条负向断言（404/400） |
| 文档小节与逐行表格重复 | 双份真相 | 例外只在通用段落声明一次，表格不加注释 |

## 9. Rollback

按 P1/P2/P3 分三个提交；任一阶段失败 `git revert` 该提交。无数据、无依赖、无迁移，回滚无副作用。

## 10. Implementer Handoff

- **输入**：本计划 §4 具体改法、任务卡 §3 AC、§4 残差清单；
- **授权**：须 Human 批准本计划（`Draft → Approved`）后实施；
- **边界**：不改响应结构/状态码/路径；不改 `shared/**` 与 `server/controllers/**`；只加测试不改既有断言；
- **产出**：3 个提交 + §11 实施记录 + 独立审查；
- **验证入口**：§7 四条命令。

## 11. Implementation Record

**实施日期**：2026-11-11 ｜ **分支**：`feature/TASK-072-api-contract-residuals` ｜ **基线**：`main` @ `83be5e6`

### 11.1 开工前置核对

| 项 | 期望 | 实测 |
|---|---|---|
| 当前分支 | `main` | `main` ✅ |
| 工作区 | 仅 1 个外部未提交文件 `docs/handbook/ops/DEPLOYMENT.md` | 仅该文件（全程未提交/未修改/未回滚）✅ |
| TASK-072 Status | `Implementing` | `Implementing（2026-11-11）` ✅ |
| 计划 Status | `Approved`（`30f0dfa`） | `Approved（2026-11-11）`，`30f0dfa` 存在 ✅ |
| `git rev-parse main` | — | `83be5e670fc8212137169bb2349c341095114bdb` ✅ |

### 11.2 基线实跑（改前，`main` @ `83be5e6`）

```
$ npm run build --workspace client      → ✓ built in 3.76s（exit 0）
$ npm run lint --workspace client       → ✖ 8 problems (3 errors, 5 warnings)
$ npm run test:server                   → ℹ tests 240 / pass 240 / fail 0
$ npm run docs:check                    → 扫描 138 份文档；链接 1421 条；ERROR 0；WARN 0
```

3 个 error 与计划 §3 完全一致：`vite.config.js:16`（`process` 未定义）、`verify-price-display.cjs:29`（未安装规则）、`task063-fixture.jsx:450`（`failed` 未使用）。

> **环境备注（重要）**：首次执行 `build` 与 `test:server` 均失败于 `spawn EPERM`（esbuild 子进程 / `node --test` 子进程被沙箱拒绝），并非代码问题；放宽沙箱后同一命令在同一代码上通过。后续四项验证均在可 spawn 子进程的环境下执行。

### 11.3 逐阶段实施与提交

| 阶段 | 提交 | 内容 |
|---|---|---|
| P1 | `061f94b` | `eslint.config.js` 追加 `files: ['vite.config.js','scripts/**/*.{cjs,js}']` + `globals.node` 段（`src/**` 的 browser globals 不变）；删 `verify-price-display.cjs:29` 失效 disable 注释；删 `task063-fixture.jsx:450` 未使用的 `const failed` |
| P2 | `80c42c0` | 新建 `server/test/integration/api-contract.crud.test.js`（8 条），复用 `helpers/auth.js` + `helpers/modelStubs.js`，stub service 不连 Mongo；未改既有 `api-contract.test.js` 任何断言 |
| P3 | `3729551` | `API_CONTRACT.md` 新增「响应形状例外」小节（5 处）；`Prices/History.jsx:1` 注释 `Price/` → `Prices/` |

### 11.4 新增 8 条用例（全部通过）

```
✔ 组合 CRUD 全链路：POST 201 → GET 200 → PUT 200 → DELETE 200 且返回级联删除计数
✔ 组合 404 与非法 id 400 均返回 success:false 且带 traceId
✔ 交易 CRUD：POST 201 含 warnings → 列表 data[]+pagination → :id 404 → DELETE 200
✔ GET /api/portfolios/:pid/transactions 返回 data[] + pagination，默认 pageSize=50
✔ 提醒规则 CRUD：POST 201 → 列表 → GET :id 200 → PUT 200 → DELETE 200 → 再 GET 404
✔ GET /api/users 的 data 是 {items:[...]} 而非数组，且不含 passwordHash
✔ 列表端点 pagination 形状一致：恰好 {page,pageSize,total}
✔ 非列表端点不含 pagination 键：/summary、/cron/status、/users
ℹ tests 8 / pass 8 / fail 0
```

### 11.5 收尾四项实跑（改后，`feature/TASK-072-api-contract-residuals` @ `3729551`）

```
$ npm run build --workspace client   → ✓ built in 2.74s（exit 0）
$ npm run lint --workspace client    → ✖ 5 problems (0 errors, 5 warnings)（exit 0）
$ npm run test:server                → ℹ tests 248 / pass 248 / fail 0
$ npm run docs:check                 → 扫描 138 份文档；链接 1421 条；ERROR 0；WARN 0
```

- lint：3 error → **0 error**，exit 0；既有 5 条 `react-refresh/only-export-components` warning 保留（属既有，未在此卡处理）。
- test:server：240 → **248**（正好 +8），fail 0。
- 构建产物与改前同为 `index-DLXIi7Z5.js`（1,002.78 kB），证明前端产物零变化。

### 11.6 范围与零行为变更证明

```
$ git diff --stat main...HEAD

 client/eslint.config.js                           |   9 +
 client/scripts/fixtures/task063-fixture.jsx       |   1 -
 client/scripts/verify-price-display.cjs           |   1 -
 client/src/pages/Prices/History.jsx               |   2 +-
 docs/handbook/technical/API_CONTRACT.md           |  16 +
 server/test/integration/api-contract.crud.test.js | 517 ++++++++++++++++++++++

$ git diff --stat main...HEAD -- server/routes shared server/controllers
（空）
```

改动面与计划 §5 P4 要求**逐项一致**（eslint 配置 + 2 个 scripts 文件 + 1 行注释 + 1 个新测试文件 + API_CONTRACT.md），`server/routes` / `shared` / `server/controllers` **零 diff** → 响应结构、状态码、HTTP 路径、计算口径均未变更。

### 11.7 AC 对照

| AC | 证据 | 状态 |
|---|---|---|
| AC-01 Lint 归零 | lint exit 0，0 error / 5 warning | ✅ |
| AC-02 契约测试补齐 | 新增 8 条（≥7），test:server 248 pass / 0 fail | ✅ |
| AC-03 文档标注 | `API_CONTRACT.md`「响应形状例外」覆盖 5 处 + server-only；docs:check 0 ERROR | ✅ |
| AC-04 构建通过 | build exit 0 | ✅ |
| AC-05 零行为变更 | `git diff --stat -- server/routes shared server/controllers` 为空 | ✅ |
| AC-06 注释修正 | `Prices/History.jsx:1` 为 `src/pages/Prices/History.jsx` | ✅ |

### 11.8 未决与移交

- **PR 未创建**：本机无 `gh` CLI，环境亦无 GitHub API token（仅配置了 SSH 推送）。分支已推送，PR 正文已按计划拟好待人工/后续创建；**未合入 main**。
- 未改动任何 Task Status / Reviewer 结论 / Merged 字段。


## 12. Review Record

（按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §7 记录。）

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。

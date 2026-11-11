# TASK-072 — API 契约残差收敛（lint / 契约测试 / 文档标注）

## Metadata

| 字段 | 内容 |
|---|---|
| Status | **Completed（2026-11-11，Human 确认完成）**：lint 归零（0 error）、新增 8 条契约测试（`test:server` 240→**248**）、5 处响应形状例外写入 `API_CONTRACT.md`。**`Merged` = `6421d4f`**（**PR #52**） |
| Priority / Owner / Type | `Medium` / Implementer（待指派） / `Maintenance`（测试与文档，零 API 行为变更） |
| Created / Updated | 2026-11-09 / 2026-11-11 |
| 所属 Story | 无（独立维护任务） |
| 覆盖的验收条件 | 见 §3（AC-01～AC-06） |
| Related | [API_CONTRACT.md](../../../handbook/technical/API_CONTRACT.md)、[TASK-071](./TASK-071-codebase-structure-cleanup.md)（结构清理，与本卡无冲突） |
| Execution Plan | [Completed：TASK-072-plan](../../exec-plans/completed/TASK-072-api-contract-residuals-plan.md) |

## 1. 背景

Human 提出「统一前后端 API 契约」。经 2026-11-09 全仓核查，**契约主体已在此前任务中落地**（响应封装、错误结构、前端基址、Axios 单实例、静态路由优先、5 个优先修复项），并有 240 条服务端测试（含 `api-contract.test.js` 10 条专项）锁定。本卡**不重做已有契约**，只收敛 6 处残差。

### 1.1 已核实的现状（作为本卡前提，不再变更）

| 能力 | 现状 | 证据 |
|---|---|---|
| 成功响应 | `{success:true,data,...}`，列表附 `pagination` | `server/utils/apiResponse.js` |
| 错误响应 | `{success:false,message,traceId}`，校验附 `details`、认证附 `code` | 同上 + `server/utils/errorResponse.js` |
| 前端基址 | 单处 `VITE_API_URL`，空值回落 `/api`（不再出现 `undefined/assets`） | `client/src/services/api.js:4-6` |
| Axios 实例与错误处理 | 单实例 + 拦截器（解包、traceId、401/403 分流） | `client/src/services/api.js:9-50` |
| 静态路由优先 | 价格/组合路由已固定顺序并有测试 | `price.routes.js`、`portfolio.routes.js`、`api-contract.test.js` |
| 5 个优先问题 | 价格 total/分页、历史年月过滤、组合交易分页、再平衡对象体、空 env 基址 | 均已有实现 + 测试 |

## 2. Scope

**In Scope**

- 修复 `npm run lint --workspace client` 的 3 个 error（均在 `src/` 之外）
- 补充 7～8 条 API 契约集成测试（组合 / 交易 / 提醒规则 CRUD、`users` 形状、分页一致性）
- 契约文档标注 5 处响应形状例外与 server-only 端点
- 修正 1 处前端注释中的过期路径

**Out of Scope**

- 任何响应结构、状态码、HTTP 路径变更（含把 `/api/users` 的 `{items}` 改成数组）
- 前端 service 拆分/合并（属 TASK-071 P3）
- `shared/` 业务逻辑改动
- 依赖升级

## 3. Acceptance Criteria

- [ ] **AC-01 Lint 归零**：`npm run lint --workspace client` exit 0（0 error；允许既有 5 条 `react-refresh` warning）。
- [ ] **AC-02 契约测试补齐**：新增 ≥7 条用例，覆盖组合 CRUD、交易 CRUD、提醒规则 CRUD、`users` 包装形状、分页形状一致性；`npm run test:server` 全绿（240 + 新增）。
- [ ] **AC-03 文档标注**：`API_CONTRACT.md` 明确写出 5 处形状例外（`/api/users` 的 `{items}`、`/api/valuations` 裸数组、`/api/family/fx/rates` 裸数组、`/api/cron/status` 对象、非列表端点不含 `pagination`）与 server-only 端点；`npm run docs:check` 0 ERROR。
- [ ] **AC-04 构建通过**：`npm run build --workspace client` exit 0。
- [ ] **AC-05 零行为变更**：`git diff` 中 `server/routes/**`、`shared/**` 无改动；`server/controllers/**` 无改动（本卡只动测试/文档/注释/lint 配置）。
- [ ] **AC-06 注释修正**：`client/src/pages/Prices/History.jsx` 顶部路径注释由 `src/pages/Price/History.jsx` 改为正确路径。

## 4. 已核实的残差清单

### G-3 前端 lint 失败（3 error，均在 `src/` 之外）

| 文件:行 | 规则 | 现象 | 处置 |
|---|---|---|---|
| `client/vite.config.js:16` | `no-undef` | `process.env.VITE_API_PROXY_TARGET`，flat config 只给了 browser globals | 在 `client/eslint.config.js` 为 `vite.config.js` 与 `scripts/**/*.cjs` 补 `globals.node` |
| `client/scripts/verify-price-display.cjs:29` | `import/no-dynamic-require` | 引用了**未安装**的 `import` 插件规则，disable 注释自身报错 | 删除该行 disable 注释（该规则本就不存在） |
| `client/scripts/fixtures/task063-fixture.jsx:450` | `no-unused-vars` | `const failed = results.filter(...)` 声明后未使用 | 删除该行（`payload` 只用 `results`/`failures`） |

### G-4 契约测试覆盖缺口

现有 `api-contract.test.js`（10 条）覆盖：价格三类查询的分页/过滤、400/404/500 结构、再平衡对象体、Asset CRUD 与枚举校验。**缺**：

- 组合 CRUD（201 / 200 / PUT / DELETE 级联计数 / 404 / 非法 id 400）
- 交易 CRUD（201 + `warnings` / 列表分页 / `:id` 404 / DELETE）
- 提醒规则 CRUD（201 / 列表 / `:id` 200 / PUT / DELETE / 404）
- `GET /api/users` 的 `{items}` 包装（锁定唯一例外形状）
- 列表端点 `pagination` 形状一致性（assets / portfolios / transactions / prices/today）

### G-2 / G-5 / G-6 文档与注释

- `GET /api/cron/status` 返回**对象**而非列表，契约需显式说明「不分页」；
- `GET /api/valuations` 无前端消费方（server-only），需在契约标注；
- `GET /api/users` 是全仓**唯一** `{items}` 包装的列表端点（Human 决定保持，不改为数组）；
- `History.jsx` 顶部注释路径过期。

## 5. 风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| 修改 eslint 配置放宽过度 | 误把 `src/` 的 browser 环境改成 node | 只对 `vite.config.js`、`scripts/**/*.cjs` 追加 node globals，`src/**` 配置不动 |
| 新增测试依赖真实 DB | 与现有测试风格不一致 | 复用 `server/test/helpers/{auth,modelStubs}.js` 的 stub 方式，不连真实 Mongo |
| 文档标注被后续改动覆盖 | 契约漂移 | 在「接口清单」前的通用段落集中声明例外，不逐行重复 |

## 6. 依赖与顺序

1. 无阻塞依赖；与 TASK-071 无文件重叠（071 动 `src/` 结构，本卡只动 lint 配置、测试、文档、1 行注释）。
2. 建议在 TASK-071 之前先做（测试与 lint 归零可为 071 提供更稳的验证基线）。

## 7. Coordination Notes

- 不改任何响应结构——`/api/users` 保持 `{items}`（Human 2026-11-09 决定）。
- 测试只加不改：不改动既有 240 条用例的断言。
- 本卡不含 Status 推进动作；计划获批后由 Orchestrator 登记 `Implementing`。

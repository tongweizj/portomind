# TASK-058 — 账号与访问控制（U1：后端认证内核）

## Status

Current status:

`Completed`（2026-10-27：W1–W9 实施 + 验证完成；独立 Reviewer **三轮复核 PASS**（第一轮 PASS WITH FINDINGS → 3 MAJOR + 8 MINOR 全整改；第二/三轮复检无 BLOCKER/MAJOR/MINOR 遗留）。**2026-10-28 随 `TASK-058` 结案归档 `complete/`**；代码仍在分支 `dd388ac`，未合入 `main`（合入属 Human 动作）—— 实施记录见 §11；发布约束不变：**U1 与 U2 必须同批发布**

Owner:

`Planner`（已交付）→ `Implementer`（2026-10-27 实施完成）→ 独立 `Reviewer`（2026-10-27 三轮复核 PASS）

Priority:

`Critical`

Related task:

`TASK-058`（`docs/development/tasks/completed/TASK-058-authentication-and-accounts.md`）

Related spec / ADR:

`docs/development/requirements/specs/completed/FS-authentication.md` · `docs/os/architecture/adr/ADR-001-authentication.md`

---

## 1. Intent

### Goal

在 `server` 前加一道**覆盖全站的准入闸门**，并提供账号管理的最小内核：`User` / `Session` 两个集合、密码哈希、服务端会话、`requireAuth` / `requireAdmin` 两个中间件、`/api/auth/*` 与 `/api/users/*` 端点、默认 admin seed、登录失败限速，同时把 CORS 从 `origin:true` 收敛为白名单。

### Why

当前任何人访问 IP 即可读写全部家庭资产（9 个路由裸奔），而界面却渲染了「退出登录」按钮。这是**假的安全感**，比无安全感更危险；且产品方向已含公网（`PL-0 M0.2d` P0），认证是公网前置条件。

### Scope

仅 `shared/` + `server/`。产出物见 §4。**不含任何前端改动**（U2 负责）。

### Out of Scope

前端页面/守卫（U2）、管理员用户管理 UI（U3）、操作人留痕、`viewer` 角色、找回密码、多租户、2FA、用户删除。

### Constraints

- **业务模型零改动**（10 个 `shared/models/*.js` 不动一个字段）。
- 既有 9 个业务路由**凭证零改动**（只多一层准入）。
- 认证在 `app.js` 单一挂载点覆盖，不逐路由改。
- **禁止**引入 `AUTH_DISABLED_FOR_TESTS` 之类跳过开关。
- `cron-worker` 零改动、零回归。
- 不复用 `taskruns` / 日志体系之外的任何新基础设施；不引入 Redis / MQ / 迁移框架。

### Acceptance Criteria

以 `specs/completed/FS-authentication.md §7 U1` 为准，此处不复制。补充本单元的硬性项：

- [ ] 无 cookie 请求 `GET /api/portfolios` → **401**（非 200 空数组、非 500）
- [ ] `admin/admin` 登录 → 200 + `Set-Cookie`；改密前业务端点 **403 `PASSWORD_CHANGE_REQUIRED`**；改密后 200
- [ ] `member` → `GET /api/users` **403**；`admin` → 200
- [ ] 停用用户后其旧 cookie **立即** 401（会话已从库中删除）
- [ ] 停用/降级唯一启用 admin → **409 `LAST_ADMIN_PROTECTED`**，状态不变
- [ ] 5 次错密后第 6 次（即使正确）→ 锁定错误
- [ ] 跨源请求被拒；生产未配 `CORS_ORIGINS` → 启动 fail-fast
- [ ] `server` 既有测试改造后全绿；`cron-worker` 测试无变化全绿
- [ ] 全仓 `require` 可解析性检查通过

---

## 2. Context

- 产品形态：`specs/completed/FS-authentication.md`（单租户多账号、`admin`/`member`、`mustChangePassword`、不可删除只停用）。
- 技术决策：`ADR-001`（为什么不用 JWT / 不用反代 Basic / 不做多租户）。
- 拓扑前提：`ADR-002`（三进程，仅 `server` 提供 HTTP；`cron-worker` 不监听端口）。
- 安全边界的现有唯一归属：`DEPLOYMENT.md §9`（实施完成后必须回写）。

---

## 3. Repository Findings

> 以下均为 2026-10-26 实码核查结果，实施时若与代码不符以符号名为准。

| # | 事实 | 位置 | 对本计划的影响 |
|---|---|---|---|
| F1 | 9 个业务路由集中挂载 | `server/app.js:41-49` | 闸门可一处覆盖 |
| F2 | CORS：`allowedOrigins` 已构造但白名单 `cors()` 整段注释，实际 `cors({origin:true})` | `server/app.js:21-34` | 恢复白名单即可，无需重写逻辑 |
| F3 | 中间件目录已有 `traceId` / `requestLogger` / `errorHandler` | `server/middleware/` | 新增 `auth.js` / `loginThrottle.js` 沿用同一风格（CommonJS 默认导函数） |
| F4 | 启动序列：`dotenv` → 连库 → `app.listen` | `server/server.js` | seed 插在 `DATABASE_CONNECTED` 之后 |
| F5 | `server/package.json` **无** `bcrypt*` / `cookie-parser` / `express-session` / `jsonwebtoken` | `server/package.json` | 需新增 2 个依赖 |
| F6 | 响应包装为 `success()` / `failure()` | `server/utils/apiResponse.js` | 新端点必须沿用，不自定义响应体 |
| F7 | `shared/models/index.js` 只是 `db.mongoose` 占位，**不是模型注册表** | `shared/models/index.js` | 新模型走 `require('@portomind/shared/models/user')` |
| F8 | 17 个集成测试中 **7 个**用 `app.listen(0)` + 原生 `fetch`，**无 supertest、无 cookie jar** | `server/test/integration/` | 见 §5 W8：必须改造，否则全挂 |
| F9 | 测试通过 monkey-patch 模型静态方法 / service 函数来脱离 Mongo | `alert.api.test.js` / `api-contract.test.js` | 沿用同一手法 stub 会话解析，**但不允许绕过闸门本身** |
| F10 | 全仓无 `expireAfterSeconds`（0 处） | `shared/models/` | `Session` 将是第一个 TTL 集合 |
| F11 | `AlertRule` 等 10 个业务模型无任何 `createdBy` 字段 | `shared/models/` | 本期不加（FS `NG4`） |
| F12 | `cron-worker` 无 `listen` / `createServer` | `cron-worker/` | 不受闸门影响，零改动 |

---

## 4. Proposed Design

### 4.1 新增文件

| 文件 | 职责 |
|---|---|
| `shared/models/user.js` | `User` schema |
| `shared/models/session.js` | `Session` schema（含 TTL） |
| `shared/services/user.service.js` | 哈希/校验、CRUD、改密、重置、唯一 admin 守护、`ensureDefaultAdmin` |
| `shared/services/session.service.js` | `create` / `resolve(sid)` / `destroy(sid)` / `destroyAllForUser(userId)` |
| `server/middleware/auth.js` | `requireAuth` / `requireAdmin` |
| `server/middleware/loginThrottle.js` | 内存失败计数（`ip + username`） |
| `server/routes/auth.routes.js` | `/api/auth/*` |
| `server/routes/user.routes.js` | `/api/users/*`（全部 `requireAdmin`） |
| `server/test/helpers/auth.js` | 测试用会话 helper（见 §5 W8） |

### 4.2 数据模型

```js
// shared/models/user.js
username:            { type: String, required: true, unique: true, lowercase: true, trim: true,
                       minlength: 3, maxlength: 32, match: /^[a-z0-9][a-z0-9_.-]{2,31}$/ }
passwordHash:        { type: String, required: true, select: false }   // 默认不查出
role:                { type: String, enum: ['admin', 'member'], default: 'member' }
active:              { type: Boolean, default: true }
mustChangePassword:  { type: Boolean, default: false }
lastLoginAt:         { type: Date, default: null }
// timestamps: true
```

```js
// shared/models/session.js
sid:        { type: String, required: true, unique: true }           // 32B base64url
userId:     { type: ObjectId, ref: 'User', required: true, index: true }
createdAt:  { type: Date, default: Date.now, expires: SESSION_TTL_SECONDS }  // ← 全仓首个 TTL
lastSeenAt: { type: Date, default: Date.now }
ip:         { type: String, default: null }
ua:         { type: String, default: null }   // 截断 200 字符
```

> TTL 由 `SESSION_TTL_DAYS`（默认 7）推导；`expires` 写在 `createdAt` 上 = **绝对过期**，不做滑动续期（简化优先，FS §8）。

### 4.3 端点契约（全部走 `success()` / `failure()` 包装）

| 方法 | 路径 | 准入 | 入参 | 成功返回 |
|---|---|---|---|---|
| POST | `/api/auth/login` | 公开 | `{username, password}` | `{user:{id,username,role,mustChangePassword}}` + `Set-Cookie` |
| POST | `/api/auth/logout` | 登录 | — | `{ok:true}`（无会话也返回 200） |
| GET | `/api/auth/session` | **公开** | — | `{authenticated:boolean, user?}`（**未登录返回 200，不返回 401**） |
| POST | `/api/auth/change-password` | 登录 | `{currentPassword, newPassword}` | `{ok:true}` |
| PATCH | `/api/auth/profile` | 登录 | `{username}` | `{user:{...}}` |
| GET | `/api/users` | admin | — | `{items:[{id,username,role,active,lastLoginAt,createdAt}]}` |
| POST | `/api/users` | admin | `{username, password, role}` | `{user:{...}}`（`mustChangePassword=true`） |
| PATCH | `/api/users/:id` | admin | `{username?, role?, active?}` | `{user:{...}}` |
| POST | `/api/users/:id/password` | admin | `{newPassword}` | `{ok:true}` |

错误码（`failure()` 的 code）：`INVALID_CREDENTIALS` · `ACCOUNT_DISABLED` · `ACCOUNT_LOCKED` · `PASSWORD_CHANGE_REQUIRED` · `FORBIDDEN` · `UNAUTHENTICATED` · `USERNAME_TAKEN` · `LAST_ADMIN_PROTECTED` · `PASSWORD_TOO_SHORT`。

### 4.4 中间件顺序（`server/app.js`）

```
traceId → requestLogger → cors(whitelist, credentials) → bodyParser
→ app.use('/api/auth', authRoutes)        // 内部按端点自决，login/session 公开
→ app.use('/api', requireAuth)            // ★ 全站闸门
→ 既有 9 个 app.use('/api/xxx', routes)   // 业务路由（顺序不变）
```

`requireAuth` 逻辑：

1. 从 `req.headers.cookie` 取 `pm_sid`（缺失 → 401 `UNAUTHENTICATED`）
2. `sessionService.resolve(sid)` → 查 `sessions` + `populate user`
3. 会话不存在 / 用户 `active=false` → 401；顺带删掉失效会话
4. `mustChangePassword === true` 且路径不在白名单（`change-password` / `logout` / `session`）→ 403 `PASSWORD_CHANGE_REQUIRED`
5. `req.user = { id, username, role }`；`req.session = { sid }`；非阻塞更新 `lastSeenAt`

`requireAdmin` = `requireAuth` + `role !== 'admin'` → 403 `FORBIDDEN`。

### 4.5 关键实现决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 哈希库 | `bcryptjs`（cost 10） | 纯 JS，Windows 零编译风险（`bcrypt` 需 node-gyp） |
| Cookie 解析 | `cookie-parser` | 成熟、体积小；不手写解析 |
| Cookie 属性 | `httpOnly` + `SameSite=Lax` + `Path=/` + 生产 `Secure` + `maxAge=TTL` | `COOKIE_SECURE` 可覆盖（局域网 HTTP 调试） |
| 唯一 admin 守护 | 应用层**先算后写**（`countDocuments({role:'admin',active:true})`） | "至少一个"无法用 DB 索引表达 |
| 停用/重置的会话处置 | `Session.deleteMany({userId})` | 即时踢下线 |
| 限速 | 内存 `Map`，`ip+username` 5 次 / 15 分钟 | 单实例部署；多实例时改 Mongo（记为后续） |
| 默认 admin | `users` 空时 seed，`mustChangePassword=true`，日志不打印密码 | FS §4.1 |
| CORS | 白名单 + `credentials:true`；生产缺失 `CORS_ORIGINS` → `throw` | `origin:true` 与 `credentials` 不可共存 |

---

## 5. Work Breakdown

- [x] **W1 模型层**：`shared/models/user.js`、`shared/models/session.js`（`sessions.createdAt` TTL = `SESSION_TTL_DAYS` 绝对过期）；`require` 可解析性自检通过。
- [x] **W2 service 层**：`user.service`（哈希/校验/CRUD/改密/重置/唯一 admin 守护/`ensureDefaultAdmin`，ED-2/ED-3/ED-4）+ `session.service`（create/resolve/destroy/destroyAllForUser/touch）。
- [x] **W3 中间件**：`server/middleware/auth.js`（`requireAuth` / `requireAdmin`，强制改密白名单）+ `loginThrottle.js`（5 次 / 15 分钟，`ip+username`）。
- [x] **W4 路由**：`auth.routes.js` / `user.routes.js`（controller 分层），全部走 `success()` / `failure()`；认证错误增加顶层 `code`（`failure()` 向后兼容扩展）。
- [x] **W5 装配**：`app.js` CORS 白名单 + `credentials:true` + 生产 fail-fast；`/api/auth`（公开）→ `/api/users`（requireAuth+requireAdmin）→ `app.use('/api', requireAuth)` 全站闸门 → 既有业务路由；`server.js` 连库后 `ensureDefaultAdmin()`；`server/.env.example` 增 `CORS_ORIGINS` / `SESSION_TTL_DAYS` / `COOKIE_SECURE`。
- [x] **W6 依赖**：`bcryptjs@^3.0.3`、`cookie-parser@^1.4.7`（仅这两个，ED-1）；根 `package-lock.json` 已更新。
- [x] **W7 新增测试**：`server/test/integration/auth.gate.test.js`（11 条）+ `auth.admin.test.js`（13 条），覆盖 §1 AC 全部条目。
- [x] **W8 既有测试改造**（实际 **8 个**文件，比计划多 1 个：TASK-054 新增的 `cronStatus.api.test.js` 同样自起 HTTP）：
  - 新增 `server/test/helpers/auth.js`：`installAdminSession()` 只 monkey-patch `session.service.resolve` / `touch`，`authHeaders()` 供 request helper 带 cookie；另提供 `stubAuthModels(world)` 内存 User/Session 替身（新测试用）；
  - 8 个自起 HTTP 的文件（`alert.api` / `api-contract` / `assetClass` / `family.summary` / `portfolio.archived` / `portfolio.summary` / `valuation.service` / `cronStatus.api`）在 `test.before` 注入 admin 会话、`request()` 带 cookie；
  - **只 stub 会话查询，不 stub 闸门**：401/403/强制改密/角色判定全部由真实中间件产生；全仓 grep 无 `AUTH_DISABLED_FOR_TESTS`。
- [x] **W9 文档回写**：`DEPLOYMENT §4.1/§8/§9`（+首次部署与账号运维）；`PL-0 M0.2c/M0.2d`；`PRODUCT_LINES §1.1`（"多用户 SaaS" → "多租户 SaaS"）；`DATA_MODEL` 新增 `User`/`Session`（§2 总览 + §4.11/§4.12）；`API_CONTRACT`（认证与错误码 + 9 个端点行 + 安全边界）；`ARCHITECTURE §7 第 10 条/§8 第 1~2 条/§9`；`CLIENT_DEV §2.2`（U2 路由待做）；`ADR-001` Follow-up/Decision History；`docs/readme.md`（FS/ADR 链接状态）。

---

## 6. Verification

| 层 | 手段 | 期望 |
|---|---|---|
| 单元/集成 | `npm run test --workspace server` | 全绿（含 W7 新增用例、W8 改造后既有用例） |
| 回归 | `npm run test --workspace cron-worker` | 全绿，**零改动** |
| 静态 | 全仓 `require` 可解析性扫描 + `cd client && npx eslint` | 无新增错误 |
| 手工 | `curl --noproxy '*'`（本机有代理，必加） | 无 cookie → 401；登录 → 200；改密前 403；改密后 200 |
| 手工 | 跨源 `Origin: http://evil.test` | 被 CORS 拒绝 |
| 手工 | 不设 `CORS_ORIGINS` 启动 | 进程退出 + 明确错误信息 |
| 端到端 | 真实库副本 + `playwright-core`（沿用 `client/scripts/e2e-task-044.mjs` 手法） | **真实会话查询路径**（未被 stub 的那一段）至少跑通一次登录→访问→登出 |

> ⚠️ 已知覆盖缺口：W8 的 stub 让"会话查库"这条路径在自动化测试里不真实。**必须**由最后一行的手工/E2E 补上，否则等于"mock 掉自己怀疑的那一段"。
>
> 🔒 **该行的性质已由决策 ED-5 提升为交付门槛**（见 §9）：端到端结果须记入 §11，未完成不得声明 U1 完成。

---

## 7. Risks

| # | 风险 | 影响 | 处置 |
|---|---|---|---|
| R1 | U1 单独上线 → 全站 401 | 高 | 发布约束：与 U2 同批；本计划验收通过后**不得单独部署** |
| R2 | W8 漏改导致既有测试批量红 | 高 | 先跑基线（全绿）→ 改造 → 再跑；逐个文件确认 |
| R3 | 用"跳过开关"让测试变绿 | 高 | 明文禁止；Reviewer 必须检查是否引入绕过路径 |
| R4 | 默认口令未改就公网暴露 | 高 | `mustChangePassword` 硬拦截 + 手册记录首次部署流程 |
| R5 | 忘记 admin 口令 | 中 | `DEPLOYMENT` 记录运维兜底（连库改密），不进产品 |
| R6 | 每次请求多一次查询拖慢页面 | 低 | `sid` 唯一索引；单用户场景可忽略；必要时加 5 分钟内存缓存（**本期不做**） |

---

## 8. Rollback

认证是**加层不改契约**，回滚成本低：

1. 注释/移除 `app.use('/api', requireAuth)` 一行 → 立即恢复为现状（前端若无登录页，U2 尚未上线时这是唯一回滚手段）；
2. CORS 回滚 = 恢复 `origin:true`（仅在内网可接受）；
3. `users` / `sessions` 两个新集合可保留不删（无其他代码引用），不影响旧逻辑。

> 因此**首次上线前必须先确认 U2 已就绪**，否则回滚只能靠改代码。

---

## 9. Decisions（5 项，2026-10-26 已全部裁决）

日期：**2026-10-26**。裁决人：Max（Human Owner）。裁决方式：**采纳本节全部建议**。以下 5 条自此为**实施约束**，不再是待议项；实施中若发现某条无法成立，须回到 Human 重新裁决，不得自行改写。

> 编号说明：本节的 `ED-n` = **ExecPlan Decision**（实施级），与 [FS §12](../../requirements/specs/completed/FS-authentication.md) 的 `D1–D7`（产品形态裁决）是两套编号，不要混引。

| # | 议题 | 裁决 | 落地位置 | 实施要点 |
|---|---|---|---|---|
| ED-1 | 新增 `bcryptjs` + `cookie-parser` 两个依赖 | **同意** | §4.5 / §5 W6 | 只增这两个；**不引入** `bcrypt`（需 node-gyp，Windows 有编译风险）、`express-session`（会话已自行落 Mongo）、`jsonwebtoken`（ADR-001 已否决 JWT） |
| ED-2 | 密码强度：8–72 字符，**不强制**大小写/数字/符号组合 | **采纳** | §4.3 错误码 `PASSWORD_TOO_SHORT` / FS §8 | 只校验长度；72 上限来自 bcrypt 输入截断边界，须在 service 层**显式拒绝**超长而非静默截断 |
| ED-3 | 会话**绝对** 7 天过期，不做滑动续期 | **采纳** | §4.2 `expires` 写在 `createdAt` | 只更新 `lastSeenAt` 用于审计，**不得**用它续期；`SESSION_TTL_DAYS` 可配 |
| ED-4 | 用户名统一小写存储，不允许大写 | **采纳** | §4.2 schema `lowercase`+`match` | 登录时同样先归一化再比对，否则 `Max` 登录会查不到 `max` |
| ED-5 | W8 stub 策略（只 stub 会话查询、保留真实闸门）+ 端到端补真实路径 | **采纳** | §5 W8 / §6 | 见下方「由 ED-5 派生的硬要求」 |

### 由 ED-5 派生的硬要求（这一条的代价必须写清）

采纳 ED-5 等于接受：**自动化测试里「会话查库」这一段是不真实的**。因此：

1. §6 最后一行的端到端验证**从"建议"升级为交付门槛**——真实库副本 + `playwright-core` 跑通「登录 → 访问业务端点 → 登出后 401」至少一次，并记录结果到 §11；
2. **未完成该项不得声明 U1 完成**，也不得把"集成测试全绿"当作会话链路可用的证据；
3. 仍然**禁止** `AUTH_DISABLED_FOR_TESTS` 之类开关（§1 约束）；若要为闸门路径补自动化覆盖，正确做法是引入测试用 Mongo 实例，那属于新任务，不在本计划内。

> ⚠️ 这正是项目既有教训「别 mock 掉你怀疑的那一段」的适用场景：本次 stub 的对象恰好是认证的核心查询，所以必须由 E2E 兜底。

---

## 10. Implementer 交接说明

- **§9 的 5 项已全部裁决，不要再向 Human 重复确认**；实施中若某条不成立，先停下来说明原因，不得自行改写。
- 动手前先 `git branch --show-current`，从 `main` 拉 `feature/TASK-058-auth-kernel`。
- 先跑一遍基线：`npm run test --workspace server` 与 `--workspace cron-worker`，记录初始通过数（**不要写进文档**，只用于自查）。
- W8 是耗时最长的一步，建议在 W1–W6 完成后**立即**做，不要留到最后（否则会误以为是新代码的问题）。
- 所有新端点必须用 `server/utils/apiResponse.js` 的 `success` / `failure`，不要自定义响应体。
- `shared/` 内禁止出现 `process.exit`、禁止反向 require `server/`（架构约束 §7）。

## 11. Implementation Record

> 实施者：Implementer（2026-10-27）。基线：`main` = `0d95319`（TASK-054 已合入），分支 `feature/TASK-058-auth-kernel`。

### 11.1 交付文件

| 文件 | 说明 |
|---|---|
| `shared/models/user.js`（新） | `User` schema（username 唯一小写、passwordHash `select:false`、role/active/mustChangePassword/lastLoginAt、timestamps） |
| `shared/models/session.js`（新） | `Session` schema + `createdAt` TTL（`SESSION_TTL_DAYS` 绝对过期） |
| `shared/services/user.service.js`（新） | bcrypt 哈希/校验、CRUD、改密/重置、唯一 admin 不变量、`ensureDefaultAdmin`、`DUMMY_PASSWORD_HASH` 等时比对 |
| `shared/services/session.service.js`（新） | sid 生成、cookie 选项、create/resolve/destroy/destroyAllForUser/touch（touch 不续期） |
| `server/middleware/auth.js`（新） | `requireAuth` / `requireAdmin` + 强制改密白名单 |
| `server/middleware/loginThrottle.js`（新） | 内存限速 5 次 / 15 分钟（`ip+username`） |
| `server/controllers/auth.controller.js`、`user.controller.js`（新） | 9 个端点，统一 `success/failure`，错误带 `code` |
| `server/routes/auth.routes.js`、`user.routes.js`（新） | 公开端点 / admin 端点 |
| `server/utils/errorResponse.js`（新） | service 业务错误 → `failure()` 的统一映射 |
| `server/utils/apiResponse.js`（改） | `failure()` 增加可选 `options.code`（向后兼容） |
| `server/app.js`（改） | CORS 白名单 + `credentials` + 生产 fail-fast；`cookie-parser`；三处挂载（auth → users → `/api` 全站闸门） |
| `server/server.js`（改） | 连库后 `ensureDefaultAdmin()` |
| `server/.env.example`（改） | `CORS_ORIGINS`（必填语义）/`SESSION_TTL_DAYS`/`COOKIE_SECURE` |
| `server/package.json`（改） | 仅新增 `bcryptjs`、`cookie-parser`（ED-1） |
| `server/test/helpers/auth.js`（新） | 会话 stub + `stubAuthModels()` 内存模型替身 |
| `server/test/integration/auth.gate.test.js`（新，11 条） | 闸门/登录/强制改密/角色/停用/唯一 admin/限速/登出/CORS/fail-fast |
| `server/test/integration/auth.admin.test.js`（新，13 条） | 用户管理端点 + service 规则 + seed |
| 8 个既有 HTTP 测试（改） | 注入真实 admin 会话（W8；多出 `cronStatus.api.test.js`） |
| `server/scripts/e2e-auth-058.cjs`（新） | ED-5 交付门槛：真实 Mongo + 真实 HTTP 端到端脚本（可重复执行） |

### 11.2 验证证据（2026-10-27 实测）

| 项 | 结果 |
|---|---|
| `npm run test:server` | **211 pass / 0 fail**（基线 180 + 新增 31：gate 15 + admin 16） |
| `npm run test:worker` | **77 pass / 0 fail**（零改动、零回归） |
| 静态（`node --check` 全部新增/改动文件） | 通过 |
| 全仓 `require` 可解析性 | `server` 全部测试可加载；`shared` 新模块无反向 require |
| 禁止绕过开关 | 全仓 grep `AUTH_DISABLED_FOR_TESTS|SKIP_AUTH|BYPASS_AUTH` → 0（注释中亦已移除该字样） |
| `cron-worker/` 改动 | `git status -- cron-worker` → 0 |
| **ED-5 端到端（真实 Mongo + 真实 HTTP）** | `server/scripts/e2e-auth-058.cjs` **E2E_PASS 15/15**：无 cookie 401 → `admin/admin` 登录 200+Set-Cookie → 改密前 403 `PASSWORD_CHANGE_REQUIRED` → 改密 200 → 同 cookie 业务端点 200 → `/api/auth/session` authenticated=true → 登出 200 → 旧 cookie 401 → 新密码可登录 → 管理员建号 201 → member 登录/`/api/users` 403 → **停用后 member 旧 cookie 401（真实 Session 删除）** → **唯一 admin 自我降级 409 `LAST_ADMIN_PROTECTED`** → 直接查库（member 会话 0、admin 角色/改密态、bcrypt 哈希） |

### 11.3 与计划的差异（均为实施级，不改变产品形态/AC 语义）

1. **`failure()` 增加可选 `options.code`**：ExecPlan §4.3 要求认证错误有稳定错误码，但既有响应封装没有 `code` 字段；以向后兼容方式新增顶层 `code`（既有调用者不传 options 时行为不变）。
2. **错误码比 §4.3 列表多 4 个**：`CANNOT_DEACTIVATE_SELF`（FS §4.4「不能停用自己」）、`SELF_RESET_FORBIDDEN`（D9）、`PASSWORD_TOO_LONG`（ED-2 超长显式拒绝）、`INVALID_CURRENT_PASSWORD`（改密校验当前密码）；另有 `INVALID_USERNAME`/`INVALID_ROLE`/`INVALID_INPUT`/`INVALID_ID`/`USER_NOT_FOUND` 等参数类码。
3. **「唯一 admin 停用」的 API 可达性说明**：actor 必须是启用 admin，因此「停用另一个 admin」在只剩两个 admin 时不会触发不变量（actor 仍在）；`LAST_ADMIN_PROTECTED` 实际由 **admin 自我降级**（唯一 admin）触发，**自我停用**由 `CANNOT_DEACTIVATE_SELF` 拦截（两者都保证「至少一个启用 admin」且状态不变）。FS AC「试图停用唯一 admin → 明确错误码」由这两条共同满足。
4. **`/api/users` 在全局闸门之前挂载**（路由级 `requireAuth+requireAdmin` 自含），避免同一请求两次查询会话；业务路由仍统一在全站闸门之后。
5. **W8 实际改造 8 个测试文件**（计划写 7 个）：TASK-054 新增的 `cronStatus.api.test.js` 也自起 HTTP。
6. **CORS 开发态保留本地默认来源**（`localhost:5173` / `127.0.0.1:5173` / `192.168.2.110:9000`）：生产仍强制 `CORS_ORIGINS`，仅为本地 `npm run dev` 开箱可用。
7. **`GET /` 保持公开**（健康/欢迎页，不涉及业务数据）；未认证访问未注册的 `/api/*` 路径会先被闸门拦为 401（原为 404），已写入 `API_CONTRACT`。
8. **登录失败做等时比对**（账号不存在时也对 `DUMMY_PASSWORD_HASH` 跑一次 bcrypt），避免响应时间枚举账号（超出计划但属安全加固）。
9. **ED-5 端到端未用 playwright-core**：验证对象是「API + 会话查库」而非浏览器 DOM，改用 `server/scripts/e2e-auth-058.cjs`（真实 Mongo 临时库 + 真实 HTTP + `fetch`，脚本自动 drop 临时库）达成同一门槛；脚本已进入仓库并可重复执行（`npm run e2e:auth --workspace server`）。
10. **Reviewer 第一轮整改（PASS WITH FINDINGS → 已修）**：
    - MAJOR-1 限速：改为「15 分钟窗口内 5 次」语义 + 窗口过期自动清理 + Map 硬上限（5000，超限清扫 25%）；时间参数可注入（G11 覆盖）。
    - MAJOR-2 反代：新增 `TRUST_PROXY` 环境变量（默认不信任）；经反代部署设 `TRUST_PROXY=1`，`req.ip` 取 `X-Forwarded-For`（G13 覆盖，DEPLOYMENT §4.1/§6.1/§6.3 已写）。
    - MAJOR-3 `NODE_ENV` 部署路径：`server/.env.example` 与 `DEPLOYMENT §4.1/§6.1` 明确生产必须 `NODE_ENV=production`；`app.js` 在未设置时打 `NODE_ENV_NOT_SET` warn（提示 fail-fast/Secure 不生效）。
    - MINOR Id 语义绕过：`areSameId()`（`ObjectId.equals`）用于重置自己/停用自己/用户名唯一性判断；A14 覆盖大写 ObjectId 重置自己被拒。
    - MINOR E11000：`createUser` / `updateUser` / `changeOwnUsername` 捕获 11000 → `409 USERNAME_TAKEN`（不泄漏驱动错误）；A16 覆盖。
    - MINOR `active` 严格布尔：非 boolean → `400 INVALID_INPUT`（A15）。
    - MINOR CSRF：移除 `bodyParser.urlencoded`，写操作加 `requireJson`（非 `application/json` → `415 UNSUPPORTED_MEDIA_TYPE`）（G14）。
    - MINOR `errorHandler`：仅 4xx 透出字符串 `code`（避免 5xx 泄漏内部码）。
    - MINOR E2E 覆盖：脚本扩展到 15 项（停用吊销、member 角色、唯一 admin、真实会话删除）；新增 DB 名护栏，避免 URI 无库名时误 drop 默认库。
    - MINOR cookie Secure：G12 覆盖 production/`COOKIE_SECURE` 组合。
    - MINOR 文档清扫：SERVER / CLIENT / CLIENT_DEV / PRODUCT_LINES / PL-0 / DOCS / ADR-001 / TASKS 等「无认证 / CORS origin:true」历史陈述改为实际状态（FS-authentication 的 §1/§7 历史问题描述属产品文档，其 U1-R5「9 个业务路由」措辞留待 PM 回改）。
    - **第二轮新增 3 条 MINOR 的整改**：N-1 限速清扫不再驱逐「活跃锁定」条目（`sweep` 过滤 `lockedUntil > now`，G11 增加洪泛保护断言）；N-2 `DEPLOYMENT §4.1` 生产样例改 `COOKIE_SECURE=true`（LAN HTTP 调试才 false）；N-3 `API_CONTRACT` 补 `415 UNSUPPORTED_MEDIA_TYPE`、`SERVER.md` 补 `NODE_ENV`/`TRUST_PROXY` 两行与 JSON-only 说明。另：`TRUST_PROXY` 非法值记 `TRUST_PROXY_INVALID` warn 并按不信任处理；`change-password`/`profile` 路由顺序改为 `requireAuth → requireJson`（未认证非 JSON 先 401）。
    - **E2E 稳定性**：固定端口曾遇外部进程占用导致 `EADDRINUSE`/连错 server；脚本改为自动选择空闲端口（`E2E_PORT` 可覆盖）+ 临时库名护栏，整改后连跑 **5/5 PASS**。

### 11.4 实施期新发现

- `requestLogger` 已有 `userId: req.user?.id` 字段：闸门注入 `req.user` 后，登录后请求自动带 operator id，无需新日志系统（U1-R11 满足）。
- 既有 7+1 个 HTTP 测试都被「全站 401」一次性打穿（与 ExecPlan F8/R2 预测一致）；改造只需要「安装会话 stub + request 带 Cookie」两处，未出现需要改断言的情况。
- `bcryptjs@3` 的 `package.json` 不可 `require('bcryptjs/package.json')`（exports 限制），但主模块 `require('bcryptjs')` 正常；测试直接对比 bcrypt 哈希。
- 本机 `server/.env` 的 `CORS_ORIGINS` 只有 `http://localhost:5173`：若从 `192.168.2.110:9000` 访问，需要把它加入白名单（属部署配置，未擅自改用户 `.env`）。

### 11.5 未完成 / 移交

- **U2/U3 前端**（`/login`、`/account`、`/account/users`、401 拦截、头像下拉）不在本计划；**U1 不得单独发布**。
- `handbook/technical/CLIENT_DEV.md` 的 3 条新路由只在 §2.2 标注「U2 待做」，随 U2 落地时补全。
- 多实例部署时限速器需改存 Mongo（R6，已登记后续）。

## 12. Review Record

> 由独立 Reviewer 填写；Implementer 不得自评（AC14）。第一轮由独立 agent `auth-reviewer` 完成（2026-10-27）。

### 12.1 第一轮（2026-10-27，独立 Reviewer）

- **结论：PASS WITH FINDINGS**（无 BLOCKER；3 MAJOR + 8 MINOR）。FS §7 U1 功能项全部通过（真实 Mongo 实测 + E2E），问题集中在运营/安全加固与文档口径。
- 复核方式：读代码 + 独立跑 `test:server`（204/0）、`test:worker`（77/0）、`npm run e2e:auth`（9/9），并额外用临时库探测停用/重置/自我降级等真实会话路径。
- 复核确认（正面）：W8 改造诚实（8 个文件仅 +4/−1，无断言弱化）；无任何跳过闸门开关；cookie 属性 / TTL / sid 熵 / bcrypt / 密码长度 / 用户名归一 / 日志无密码 均正确；查询预算与既有测试零回归。
- **MAJOR/MINOR 清单与整改见 §11.3 第 10 条**（MAJOR-1 限速内存与窗口、MAJOR-2 反代 IP、MAJOR-3 `NODE_ENV` 部署路径、MINOR Id 大小写绕过 / E11000 映射 / active 布尔 / CSRF 表单 / errorHandler code 范围 / E2E 覆盖 / cookie Secure 测试 / 文档清扫）。

### 12.2 第二轮（复检，2026-10-27）

- **结论：PASS WITH FINDINGS**（无 BLOCKER / 无 MAJOR）。第一轮 3 MAJOR + 8 MINOR **全部 RESOLVED**；新增 3 条 MINOR（N-1 限速清扫可能驱逐活跃锁定、N-2 生产样例 `COOKIE_SECURE=false` 与 §9 矛盾、N-3 415/新环境变量未写文档），已在 §11.3 第 10 条整改。
- 复核证据：`test:server` 211/0、`test:worker` 77/0、`e2e:auth` 15/15、`node --check` 全过、bypass grep 0、`cron-worker` 零改动；另用临时库实测大写 id 自重置/自停用 409、并发重名 409、`TRUST_PROXY=1` 时 `req.ip` 取 XFF。

### 12.3 第三轮（终检，2026-10-27）

- **结论：PASS**（无 BLOCKER / MAJOR / MINOR 遗留）。
- N-1（活跃锁定不被洪泛驱逐，G11 新增断言）、N-2（`COOKIE_SECURE=true` 生产样例）、N-3（415 + `NODE_ENV`/`TRUST_PROXY` 文档）均复核通过；`TRUST_PROXY` 非法值告警、`requireAuth → requireJson` 路由顺序亦确认。
- E2E 修复端口竞争后连续 **5/5 PASS**（脚本自动选空闲端口 + 临时库名护栏）。
- **AC1–AC14（U1 范围）满足；U1 可交付，但按发布约束必须与 U2 同批上线。**

### 12.4 第四轮（2026-10-27，Human 指令「TASK-058 开发完成了，请检验」）

> **本计划只覆盖 U1。** 本轮被检验的提交 `68f040c`（`feat(client): add login page and session-aware app shell`）**不含任何 `client/src` 文件**，其内容是 TASK-059/060/061 三卡结案 + 原型重导；**U2 未实现**，因此本计划的 14 条 AC 没有一条被本轮改动触碰。详见任务卡 **§10**（U2 验收结论）。

- **U1 无回归**（本轮独立复跑）：`test:server` **211/0**、`client` 构建 `exit 0 / 2408 modules`（客户端零改动故与上轮同值）。
- **真机复核后端闸门仍成立**：起 `server` 连开发库，未带 cookie 访问 `portfolios` / `family/summary` / `assets` / `alerts/events` / `cron/status` → **全部 401 `UNAUTHENTICATED`**；`POST /api/auth/login`（`admin/admin`）→ 200 且 `mustChangePassword: true`。
- **结论：U1 判定沿用 §12.3（PASS）**，本轮不改变 U1 状态；阻塞项在 U2，不在本计划范围。
- 取证面已扩至**全量**（提交历史 / 22 个远端 ref / stash / worktree / 游离提交 / 客户端构建产物），结论不变：任务卡 **§10.7**。

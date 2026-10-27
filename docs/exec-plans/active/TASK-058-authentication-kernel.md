# TASK-058 — 账号与访问控制（U1：后端认证内核）

## Status

Current status:

`Approved`（2026-10-26，Human 在对话中完成 Plan Review 并采纳 §9 全部建议）—— **可开始实施**；发布约束不变：**U1 与 U2 必须同批发布**

Owner:

`Planner`（已交付）→ `Implementer`（待指派）→ 独立 `Reviewer`

Priority:

`Critical`

Related task:

`TASK-058`（`docs/tasks/active/TASK-058-authentication-and-accounts.md`）

Related spec / ADR:

`docs/product/specs/FS-authentication.md` · `docs/architecture/adr/ADR-001-authentication.md`

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

以 `FS-authentication.md §7 U1` 为准，此处不复制。补充本单元的硬性项：

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

- 产品形态：`FS-authentication.md`（单租户多账号、`admin`/`member`、`mustChangePassword`、不可删除只停用）。
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

- [ ] **W1 模型层**：新增 `user.js` / `session.js`；`require` 可解析性自检。
- [ ] **W2 service 层**：`user.service`（哈希、校验、CRUD、改密、重置、`assertAdminInvariant`、`ensureDefaultAdmin`）+ `session.service`（create/resolve/destroy/destroyAllForUser）。
- [ ] **W3 中间件**：`auth.js`（`requireAuth` / `requireAdmin`）+ `loginThrottle.js`。
- [ ] **W4 路由**：`auth.routes.js` / `user.routes.js`，全部走 `success()` / `failure()`。
- [ ] **W5 装配**：`app.js` 恢复 CORS 白名单（含 fail-fast）+ 插入两个挂载点；`server.js` 插入 `ensureDefaultAdmin()`；`server/.env.example` 增 `CORS_ORIGINS` / `SESSION_TTL_DAYS` / `COOKIE_SECURE`。
- [ ] **W6 依赖**：`server/package.json` 增 `bcryptjs`、`cookie-parser`（根 `npm install`）。
- [ ] **W7 新增测试**：`server/test/integration/auth.gate.test.js` + `auth.admin.test.js`（覆盖 §1 AC 全部条目）。
- [ ] **W8 既有测试改造**（**最容易漏、影响最大**）：
  - 新增 `server/test/helpers/auth.js`：`stubSession(user)` 用 monkey-patch 替换 `session.service.resolve`（沿用 F9 既有手法），`cookieFor(user)` 返回 `Cookie` 头字符串；
  - 7 个自起 HTTP 的测试文件（`alert.api` / `api-contract` / `assetClass` / `family.summary` / `portfolio.archived` / `portfolio.summary` / `valuation.service`）在 `test.before` 里注入 admin 会话，并在各自的 `request()` helper 中带上 cookie；
  - **只 stub 会话查询，不 stub 闸门**：401/403/强制改密/角色判定必须由真实中间件产生。
- [ ] **W9 文档回写**：`DEPLOYMENT §9` + 环境变量表 + 首次部署流程；`PL-0 §4 M0.2d`；`PRODUCT_LINES §1.1`（"多用户 SaaS" → "多租户 SaaS"）；`DATA_MODEL`（2 个模型）；`ARCHITECTURE §7/§8`；`docs/readme.md` 死链。

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

> 编号说明：本节的 `ED-n` = **ExecPlan Decision**（实施级），与 [FS §12](../../product/specs/FS-authentication.md) 的 `D1–D7`（产品形态裁决）是两套编号，不要混引。

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

（未开始）

## 12. Review Record

（未开始）

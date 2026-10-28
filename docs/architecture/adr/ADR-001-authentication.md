# ADR-001 — 账号与访问控制：单租户多账号 + 服务端会话

## Status

`Accepted`

Date:

`2026-10-26`

Decision Owner:

`Human Owner（Max 裁决：账号模型 / 角色划分 / 数据可见性 / 会话存储，见产品规格 §12）`

Related Task:

`TASK-058`

Related ExecPlan:

`docs/exec-plans/complete/TASK-058-authentication-kernel.md`（U1，`Approved` 2026-10-26 · `Completed` 2026-10-28 已归档）  
`docs/exec-plans/complete/TASK-058-authentication-client.md`（U2/U3，`Approved` 2026-10-27 · `Completed` 2026-10-28 已归档）

Supersedes:

`None`

Superseded By:

`None`

---

## 1. Context

PortoMind 从立项起就**没有认证**：`server/app.js` 的 9 个业务路由全部无鉴权，CORS 用 `origin: true` 接受任意来源，前端侧栏却渲染了一个没有 handler 的「退出登录」按钮。`DEPLOYMENT §9` 把「认证 / 多用户 = 无」写成硬事实，并把「API 不要暴露到公网」作为唯一防线。

这个状态在纯内网勉强成立，但三个事实让它不可持续：

1. **产品方向已含公网**：`PRODUCT_LINES.md` 的阶段表把"公网前完成认证"列为待办（`PL-0 M0.2d`，P0）。
2. **界面承诺了不存在的安全**：使用者看到「退出登录」，会认为别人进不来。假的安全感比没有更危险。
3. **家庭实际是两人共同维护**：三个组合（CN-稳钱 / CN-长钱 / CA-长钱）+ 家庭层，双人操作是常态，"谁能改目标配置"没有承载。

需要一次架构决策，回答三个问题：**账号模型是什么形态**、**权限如何划分**、**会话如何保持**。

---

## 2. Decision Drivers

- **不改变产品身份**：PortoMind 是"一个家庭的账本"，不是多租户 SaaS。任何要求给 10 个业务模型加 `tenantId` 的方案都应被否决。
- **开箱可用**：自托管工具不能要求使用者先改配置文件才能登录，否则首次部署必然失败。
- **可即时吊销**：停用一个账号必须**立刻**生效，不能等 token 过期。
- **最小依赖**：Windows 上部署，避免需要本机编译的原生模块。
- **一处收口**：9 个业务路由在 `app.js` 集中挂载，认证应能在**一个挂载点**全覆盖，不逐路由改。
- **不恶化既有债务**：不能为认证再造一份"模型/服务"副本（`shared/` 已是唯一实现）。

---

## 3. Constraints

- 三进程拓扑不变：`client`（SPA）/ `server`（API）/ `cron-worker`（调度）。仅 `server` 需要认证。
- **`cron-worker` 不经 HTTP**，因此不受认证影响（已核实无 `listen` / `createServer`）。
- 三端 CommonJS（`client` 为 ESM 但只消费浏览器侧代码）。
- 业务规则、API 契约（除新增认证端点）、既有数据模型字段**不得改动**。
- 现有测试必须继续通过 —— ⚠️ 但**7 个集成测试文件**自起 HTTP 且用裸 `fetch`，必须同步改造（见 §11）。
- 无 Redis、无 MQ、无迁移框架；持久化只有 MongoDB。
- 当前单实例部署（限速器等内存态可接受）。

---

## 4. Considered Options

### Option A — 单租户多账号 + 服务端会话（MongoDB）✅ 选中

新增 `User` / `Session` 两个集合。登录成功后生成随机 `sid`，写入 `sessions` 集合并以 `httpOnly` cookie 下发；每次请求由 `requireAuth` 中间件按 `sid` 查库取用户。所有账号共享同一份业务数据，仅用 `role` 区分能否管理账号。

- 优点：可**即时吊销**（删 session 即生效）；无新增运行时组件；`sessions` 集合天然需要 TTL，顺带补上全仓 `expireAfterSeconds` 缺失的债；不触碰任何业务模型。
- 缺点：每次请求多一次索引查询（家庭规模可忽略）；需自建会话管理代码。

### Option B — JWT（无状态 token）

- 优点：无需 `sessions` 集合，水平扩展友好。
- 缺点：**无法即时吊销** —— 停用账号/重置密码后，旧 token 在过期前仍然有效，除非再引入黑名单（那又变成有状态）。单机单家庭场景引入 JWT 的复杂度不换任何收益。

### Option C — 不做认证，靠反向代理 Basic Auth

- 优点：零代码，Nginx 一层即可。
- 缺点：**无法区分 `admin` / `member`**，`/api/users` 这类管理端点没有角色依据；无法在应用内实现"改密""新建用户"；前端拿不到"我是谁"，账户页无从显示。满足不了 D4/D6 的产品形态。

### Option D — 多租户（账号级数据隔离）

- 每条业务数据带 `ownerId` / `tenantId`。
- 缺点：10 个模型全加字段 + 全部查询改造 + PL-6 家庭层要重新定义"家庭"是什么。**与 D5 裁决直接冲突**，不进入实施。

---

## 5. Decision

采用 **Option A**，具体形态：

1. **单租户多账号**：`User` / `Session` 两个新集合，**业务模型零改动**，不加 `tenantId` / `ownerId`。
2. **两角色**：`admin`（业务全读写 + 用户管理）、`member`（业务全读写，不能管理用户）。`role` 用枚举，为将来的 `viewer` 留位。
3. **不做自助注册**：账号仅由 admin 创建；**用户不可删除，只能停用**。
4. **至少一个启用 admin** 为系统不变量，由应用层校验保证（停用/降级两条路径都要拦）。
5. **会话存 MongoDB**，`sid` 为 32 字节随机值，`httpOnly` + `SameSite=Lax` + 生产 `Secure`，绝对 7 天 TTL。
6. **首登强制改密**：默认 `admin/admin` 与"他人设定的初始密码"一律置 `mustChangePassword=true`，改密前除三个白名单端点外全部 403。
7. **CORS 同批收敛**：`origin: true` → 白名单 + `credentials: true`；生产未配 `CORS_ORIGINS` 时启动 fail-fast。
8. 认证中间件挂在 `app.js` 的 10 个业务路由**之前**，一处覆盖全站（含 TASK-054 的 `/api/cron`）。

---

## 6. Rationale

**为什么不是 JWT**：本决策最硬的要求是"停用即时生效"。JWT 无论怎么设计，要么接受过期窗口，要么引入黑名单把无状态又变回有状态。既然最终还是要查库，不如一开始就用会话表，且能顺便解决 `sessions` 无 TTL 的架构债。

**为什么不是反代 Basic Auth**：它只能回答"能不能进"，不能回答"你是谁、你能不能管账号"。而 D4 要求账户页显示身份、admin 能在应用内建号，这必须有应用层身份。

**为什么坚持单租户**：`tenantId` 一加，`familySummary` 的"家庭"就要重新定义成"一组用户"，PL-6 的整条产品线语义被改写。而真实需求是"两个人共用一个家庭账本"，不是"两个家庭互不可见"。**这是两个产品，不是两个功能。**

**为什么用户不可删除**：删除会同时踩两个坑 —— 历史归属（将来加 `createdBy` 后悬空）与"最后一个 admin"（删除后系统永久失去管理能力，只能进库手修）。停用能表达同样意图且可逆。

---

## 7. Consequences

### Positive

- 未认证请求一律 401，界面承诺与实际能力一致。
- 停用账号/重置密码可**立即**断开该用户全部会话。
- 全仓第一个 TTL 集合出现，为后续 `taskruns` / `alertevents` 的保留策略提供先例。
- 业务模型零改动，PL-1~PL-6 全部不受影响。
- 认证在单一挂载点覆盖，无需逐路由改造。

### Negative

- 每次请求多一次 `sessions` 索引查询。
- 多实例部署前，登录限速的内存计数需改存 Mongo（记为后续）。
- 前端需新增两个页面与全局守卫，属于不可回避的工作量。
- **发布耦合**：U1（后端）与 U2（前端登录页）必须同批上线，否则全站 401。

### Trade-offs

- 用"每次请求查一次会话"换取"即时吊销 + 零额外组件"，在单家庭规模下是明确划算的。
- 用"不做操作留痕"（本期）换取"不侵入 PL-1 交易链路"；留痕另立项。

---

## 8. Architectural Impact

Affected：

- `shared/models/` 新增 `user.js`、`session.js`（含全仓首个 TTL）
- `shared/services/` 新增 `user.service.js`、`session.service.js`（密码、会话、seed）
- `server/middleware/` 新增 `auth.js`（`requireAuth` / `requireAdmin`）、`loginThrottle.js`
- `server/routes/` 新增 `auth.routes.js`、`user.routes.js`
- `server/app.js`：CORS 白名单恢复 + 认证挂载点
- `server/server.js`：启动序列插入默认 admin seed
- `client/src`：`/login`、`/account`、`/account/users` 三路由 + 会话 Provider + axios 401 拦截 + 侧栏登出接线
- 依赖：`server/package.json` 新增 `bcryptjs`、`cookie-parser`

Unaffected：

- 10 个业务模型（无字段、无索引变更）
- 既有 9 个业务路由的**契约**（路径、入参、返回结构全部不变，只是多了一层准入）
- `cron-worker` 全部代码
- 所有业务计算口径（移动平均成本、偏离阈值、AUTO 只出建议等）
- PL-1~PL-6 的功能语义

---

## 9. Implementation Notes

- **哈希算法**：`bcryptjs`（纯 JS）而非 `bcrypt`（需本机编译），cost 10。Windows 部署下零编译风险，性能对"家庭级登录频次"完全够用。
- **`sid` 生成**：`crypto.randomBytes(32).toString('base64url')`。不做签名 cookie —— `sid` 本身无信息量，篡改只会得到一个查不到的会话。
- **中间件顺序**：`traceId` → `requestLogger` → `cors` → `cookieParser` → `bodyParser.json`（不再挂 urlencoded，仅接受 JSON）→ **`/api/auth` 路由** + **`/api/users`（自含 requireAuth/requireAdmin）** → **`requireAuth` 闸门** → 10 个业务路由。auth 路由在闸门之前，内部按端点自行决定是否要求登录（`login` / `logout` / `session` 公开，`change-password` / `profile` 要）。反代部署需设 `TRUST_PROXY=1`，否则 `req.ip` 恒为代理地址（登录限速与审计失真）。
- **`GET /api/auth/session` 返回 200 而非 401**：前端守卫需要一个"确定未登录"的稳定信号，401 会让拦截器把登录页自身也当成鉴权失败。
- **强制改密的白名单**：`POST /api/auth/change-password`、`POST /api/auth/logout`、`GET /api/auth/session`。其余一律 403 `PASSWORD_CHANGE_REQUIRED`。
- **停用/重置密码时删会话**：`Session.deleteMany({ userId })`，效果是"立刻踢下线"。
- **唯一 admin 守护**：在 `user.service` 里做 **先计算后写入** 的校验（`countDocuments({ role:'admin', active:true }) <= 1` 时拒绝），不依赖 DB 唯一索引（"至少一个"无法用索引表达）。
- **CORS**：`origin: (origin, cb) => 白名单命中或无 origin（同源/curl）则放行`，`credentials: true`。**`origin:true` 与 `credentials:true` 在浏览器语义下不可共存**，这是必须同批改的硬理由。
- **不变量不变**：本 ADR 不触碰"绝不下单 / 缺价不猜 / 只有家庭层折算"三条产品边界。

---

## 10. Validation

判定为成功实现当满足：

- 无 cookie 请求任一业务端点 → 401（实测 `curl --noproxy '*'`，避免本机代理干扰）
- `admin/admin` 登录 → 200 + `Set-Cookie` + `mustChangePassword=true`；改密前业务端点 403，改密后 200
- `member` 访问 `/api/users` → 403；`admin` → 200
- 停用用户后其旧 cookie → 401（会话已被删除）
- 跨源请求被拒；未配 `CORS_ORIGINS` 时启动报错退出
- `server` 既有集成测试改造后全绿（改造方式见 ExecPlan §5）
- 全仓 `require` 可解析性检查通过

---

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| U1 单独上线 → 全站 401 | 高 | 发布约束：U1 + U2 同批；ExecPlan 明确"不得分批部署" |
| **7 个集成测试文件全部失效** | 高 | 统一改造为"先建会话再请求"的 helper；**不得用 `AUTH_DISABLED_FOR_TESTS` 绕过**（等于没测闸门） |
| 忘记 admin 口令 | 中 | `DEPLOYMENT.md` 记录运维兜底（连库改 `passwordHash` / 置 `mustChangePassword`），不进产品 |
| 默认口令未改就暴露公网 | 高 | `mustChangePassword` 硬拦截；`PL-0 M0.2d` 的"公网前置"判定保持 P0 |
| 限速器内存态在多实例下失效 | 低 | 当前单实例；记为后续（改存 Mongo） |
| `SameSite=Lax` 之外的 CSRF 场景 | 低 | 仅接受 `application/json`（非表单），跨站发不起带 cookie 的 JSON 请求 |

---

## 12. Follow-up Actions

- [x] U1 的 ExecPlan 通过 Plan Review（`Approved` 2026-10-26，含 5 项实施裁决）
- [x] 实施 U1（`TASK-058` + ExecPlan，2026-10-27）：`User`/`Session` 模型 + service + `requireAuth`/`requireAdmin` + `/api/auth/*` + `/api/users/*` + 默认 admin seed + 登录限速 + CORS 白名单；server 204/0、worker 77/0；真实 Mongo E2E 9/9（ED-5 门槛）
- [x] 实施 U2 / U3（2026-10-27，ExecPlan `TASK-058-authentication-client.md`）：`/login`、`/account`、`/account/users`、`AuthProvider`（`['session']`）、`RequireAuth` 守卫、axios 401 拦截、强制改密闸门、顶栏头像下拉；侧栏 5→4 并删除假「退出登录」。独立真实浏览器验收 **28/28 PASS**，代码复核无 BLOCKER/MAJOR。**U2 已与 U1 同批就绪，可同批发布**
- [x] 回写 `DEPLOYMENT §9` 与 `.env.example`（`CORS_ORIGINS` / `SESSION_TTL_DAYS` / `COOKIE_SECURE`，2026-10-27）
- [x] 回写 `PL-0 §4 M0.2c/M0.2d`、`PRODUCT_LINES §1.1`（"多用户 SaaS" → "多租户 SaaS"，2026-10-27）
- [x] 回写 `dev/DATA_MODEL.md`（`User` / `Session`，2026-10-27）与 `dev/API_CONTRACT.md`（认证端点/错误码）；`dev/CLIENT_DEV.md` 的 3 条新路由随 U2 落地时回写
- [x] 修 `docs/readme.md` 的 `specs/authentication.md` 死链（本 FS 即该 spec；`docs/readme.md` 已指向 `FS-authentication.md`）
- [ ] 后续立项：操作人留痕（`NG4`）、`viewer` 角色（`NG5`）、`taskruns`/`alertevents` TTL

---

## 13. References

- [`FS-authentication.md`](../../product/specs/FS-authentication.md) — 产品形态、角色矩阵、验收标准、裁决记录
- [`PL-0-platform-foundation.md` §4](../../product/lines/PL-0-platform-foundation.md) — `M0.2c` CORS / `M0.2d` 认证
- [`DEPLOYMENT.md` §9](../../manual/DEPLOYMENT.md) — 安全边界（唯一归属）
- [`ARCHITECTURE.md` §4/§8](../../architecture/ARCHITECTURE.md) — 模块边界与架构债
- [`ADR-002`](./ADR-002-single-scheduler.md) — 三进程拓扑与 `shared` 唯一实现（本 ADR 的前提）

---

## 14. Decision History

### 2026-10-26

ADR 由空模板转为 `Accepted`。人类在此之前先提出"注册/登录算不算产品线"，结论是：**不是产品线，是 `PL-0` 的准入约束**；随后的 7 项裁决（产品规格 §12）：

- D1 纳入 P0 = **是**
- D2 账号创建 = **admin 创建，无自助注册**
- D3 首部署 = **默认 `admin/admin`，可改名改密，不可删除**
- D4 账户页 = **普通用户改自身信息；admin 叠加系统设置可建号**
- D5 数据可见性 = **共享同一份家庭数据（单租户）**
- D6 普通用户权限 = **业务全读写，仅不能管理用户**
- D7 会话存储 = **MongoDB**

被否方案：B（JWT，无法即时吊销）、C（反代 Basic Auth，无角色与身份）、D（多租户，与 D5 冲突）。A 为唯一同时满足"即时吊销 + 角色区分 + 业务模型零改动"的方案。

### 2026-10-27（U1 实施）

U1 后端认证内核按本 ADR 落地，无方案变更：`bcryptjs`(cost 10) + `cookie-parser`，会话落 Mongo（`sessions`，`createdAt` TTL = `SESSION_TTL_DAYS` 绝对过期，`lastSeenAt` 仅审计）；全站闸门 `app.use('/api', requireAuth)` 单点挂载；CORS 收敛为白名单 + `credentials:true`，生产未配 `CORS_ORIGINS` 启动 fail-fast。

实施期新增 4 个实施级错误码（`CANNOT_DEACTIVATE_SELF` / `SELF_RESET_FORBIDDEN` / `PASSWORD_TOO_LONG` / `INVALID_CURRENT_PASSWORD`），均为既有决策（D8/D9/ED-2）的必要落点，不改变产品形态。U1 与 U2 的发布耦合仍成立：**U1 已就绪但不得单独部署**。

### 2026-10-27（U2/U3 实施）

U2/U3 按本 ADR 落地，无方案变更：会话仍为服务端 cookie 会话（前端只持有 `['session']` 快照）；前端增加 `AuthProvider` / `RequireAuth` / axios 401 拦截 / 强制改密闸门 / 顶栏头像下拉，`/login`、`/account`、`/account/users` 三条路由；侧栏删除账户入口与假「退出登录」（`D11`/`D12`/`D13`/v1.5）。服务端仅做两处追加：`/api/auth/session` 与 `login` 的 user 载荷补 `lastLoginAt`（账户页「上次登录」），开发态 CORS 默认来源补 Vite 6600（端口与白名单一致性）。独立 Reviewer 真实浏览器验收 28/28 PASS，无 BLOCKER/MAJOR；**U1 + U2 现可同批发布**。

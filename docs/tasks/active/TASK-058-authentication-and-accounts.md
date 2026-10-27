# TASK-058 — 账号与访问控制（用户模块）

## Metadata

**Status:**  
`APPROVED`（2026-10-26 立项；同日 U1 的 ExecPlan 经 Human Plan Review 通过并**采纳全部 5 项实施裁决**）—— **可开始实施 U1**；发布仍受「U1 与 U2 同批」约束。

**Priority:**  
`Critical`（P0 安全闸门。当前任何人访问 IP 即可看到全部家庭资产，且侧栏存在一个无 handler 的「退出登录」假按钮）

**Owner:**  
`—`（待指派 Implementer → 独立 Reviewer；Planner 已交付）

**Created:**  
`2026-10-26`

**Updated:**  
`2026-10-26`（立项 + 实码核查；同日 U1 ExecPlan 通过 Plan Review → `Approved`）

**Type:**  
`Feature + Security`（`shared` + `server` + `client` 三端）

**Related Product Spec:**  
`docs/product/specs/FS-authentication.md`（**基线**：G1–G7 / NG1–NG8 / §4 产品形态 / §5 角色矩阵 / §7 AC）

**Related ADR:**  
`docs/architecture/adr/ADR-001-authentication.md`（`Accepted`，2026-10-26）

**Execution Plan:**  
U1 → `docs/exec-plans/active/TASK-058-authentication-kernel.md`（**`Approved` 2026-10-26**，§9 的 5 项实施裁决已全部确认）  
U2 / U3 → 待 U1 实施后拆分（U2 须与 U1 同批发布）

**来源：**  
Human 2026-10-26 直接立项（议题起点：「注册、登录算不算产品线」→ 结论：不是产品线，是 `PL-0 M0.2d` 的准入约束）

---

## 1. 问题

系统当前**没有任何认证**：

- 9 个业务路由在 `server/app.js:41-49` 裸奔，任何人访问 IP 即可查看/修改全部家庭资产；
- CORS 用 `origin: true`（`app.js:34`）——`CORS_ORIGINS` 在 `:21-24` 被读成 `allowedOrigins`，但使用它的白名单 `cors()` 整段注释，**读了不生效**；
- `Sidebar.jsx` 底部渲染「退出登录」按钮，**无 onClick、无登录态**；
- `ADR-001` 是空模板，`DEPLOYMENT §9` 把「认证 / 多用户 = 无」写成硬事实。

最危险的不是"没做"，而是**界面给了安全感、实际零防护**。同时家庭是两人共同维护，缺少"谁在用系统"的承载。

## 2. 目标（详见 FS §2）

未认证请求一律 401；首部署开箱可登录（`admin/admin`）且**强制改密**；管理员可建号/停用/重置；普通用户可自助改用户名密码；系统永不失管（至少一个启用 admin）；CORS 与认证**同批**收敛为白名单。

## 3. 范围

| 单元 | 内容 | 端 | 依赖 |
|---|---|---|---|
| **U1** | `User` / `Session` 模型 · 密码哈希 · 会话 · `requireAuth` / `requireAdmin` · `/api/auth/*` · `/api/users/*` · 默认 admin seed · 登录限速 · **CORS 白名单同批** | `shared` + `server` | 无（前置） |
| **U2** | `/login` · `/account`（改用户名/密码/登出）· 会话 Provider · 路由守卫 · axios 401 拦截 · 侧栏登出接线 | `client` | U1 |
| **U3** | `/account/users` 系统设置 Tab：列表 / 新建 / 停用启用 / 重置密码 / 改角色 | `client` | U1 |

## 4. Out of Scope

自助注册 · 多租户/账号级数据隔离（不加 `tenantId` / `ownerId`）· 邮箱或手机找回密码 · 操作人留痕（`createdBy`）· `viewer` 等细分角色 · 第三方登录 · 用户删除（只停用）· 2FA。

## 5. 约束

- **业务模型零改动**：10 个 `shared/models/*.js` 一个字段都不加（单租户前提）。
- **凭证零改动**：既有 9 个业务路由的路径/入参/返回结构全部不变，只多一层准入。
- 认证必须在 `app.js` 的**单一挂载点**覆盖全站，不逐路由改。
- **发布耦合**：U1 与 U2 必须同一次上线；U1 单独上线 = 全站 401。
- **禁止测试绕过开关**：不得引入 `AUTH_DISABLED_FOR_TESTS` 之类环境变量跳过闸门（等于不测）。既有 7 个自起 HTTP 的测试文件必须改为"先建会话再请求"。

## 6. Acceptance Criteria

以 `FS-authentication.md §7` 为准，不在本卡重复。交付前至少满足：

- [ ] 无 cookie 请求业务端点 → 401；`admin/admin` 登录 → 200 + 改密前业务端点 403、改密后 200
- [ ] `member` 访问 `/api/users` → 403；`admin` → 200
- [ ] 停用用户后其旧 cookie 立即 401
- [ ] 唯一 admin 不可停用/降级（明确错误码 + 状态不变）
- [ ] 跨源被 CORS 拒绝；未配 `CORS_ORIGINS` 时生产启动 fail-fast
- [ ] `server` 既有集成测试改造后全绿；`cron-worker` 测试零回归

## 7. 已登记风险

| # | 风险 | 处置 |
|---|---|---|
| R1 | U1 单独上线 → 全站不可用 | 与 U2 同批发布 |
| R2 | **7 个集成测试文件失效**（`alert.api` / `api-contract` / `assetClass` / `family.summary` / `portfolio.archived` / `portfolio.summary` / `valuation.service`） | 统一 auth helper，禁绕过开关 |
| R3 | 默认口令未改即公网暴露 | `mustChangePassword` 硬拦截 + `PL-0 M0.2d` 保持 P0 |
| R4 | 忘记 admin 口令 | `DEPLOYMENT.md` 记录运维兜底（连库重置），不进产品 |

## 8. 备注

- 本卡**不含**文档回写动作，回写清单见 `FS-authentication.md Appendix B`，须随实施一并完成（`DEPLOYMENT §9`、`PL-0 §4`、`PRODUCT_LINES §1.1`、`DATA_MODEL`、`CLIENT_DEV`、`ARCHITECTURE`、`docs/readme.md` 死链）。
- `PRODUCT_LINES.md §1.1` 现有「它不是多用户 SaaS」一句在本任务后需改为「不是**多租户** SaaS」——本期确实有了账号概念。

## 9. 实施裁决（2026-10-26，Human 采纳全部建议）

明细与实施要点见 [ExecPlan §9](../../exec-plans/active/TASK-058-authentication-kernel.md)。摘要：

| # | 裁决 |
|---|---|
| ED-1 | 新增 `bcryptjs` + `cookie-parser` 两个依赖（不引入 `bcrypt` / `express-session` / `jsonwebtoken`） |
| ED-2 | 密码 8–72 字符，**不强制**复杂度组合；超 72 显式拒绝，不静默截断 |
| ED-3 | 会话**绝对** 7 天过期，`lastSeenAt` 仅作审计，不用于续期 |
| ED-4 | 用户名强制小写存储，登录时同样先归一化 |
| ED-5 | 测试只 stub 会话查询、保留真实闸门；**端到端真实路径验证成为交付门槛**（未做不得声明 U1 完成） |

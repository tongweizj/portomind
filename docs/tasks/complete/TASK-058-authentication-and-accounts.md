# TASK-058 — 账号与访问控制（用户模块）

## Metadata

**Status:**  
`COMPLETED`（2026-10-28）—— **U1（后端认证内核）+ U2（前端登录 / 账户 / 守卫 / 401 / 顶栏下拉）+ U3（管理员系统设置页）全部实施并复核通过，本卡归档 `complete/`**。结案证据：U1 三轮复核 PASS（`211/0` + `77/0` + 真实 Mongo E2E 15/15）；U2/U3 四轮真实浏览器验收（19→25→28→28 PASS）+ 2026-10-28 对 `dd388ac` 全量复验（build 0 / `211-0` / `77-0` / eslint `0-0` / E2E 28/28 + 2 条负向对照成立，见 §12）；本轮结案独立复跑 `211-0` · `77-0` · build exit 0 · eslint `0-0`（见 §13）。**⚠️ 代码仍在分支 `feature/TASK-058-auth-kernel` = `dd388ac`，未合入 `main`**（`git merge-base --is-ancestor dd388ac main` = 否）—— 与 `TASK-054` 同样按「实现+复核完成即归档、合入单列」处理。**发布约束不变：U1 与 U2 必须同批发布**（U1 单独上线 = 全站 401）

> ℹ️ **历史记录（2026-10-27 首次 U2 验收 `FAIL`）**：提交 `68f040c` 的 message 声称 `feat(client)` 已加 `/login` 与会话外壳，但 `client/` **零文件**（实为 TASK-059/060/061 结案 + 原型重导）——取证见 §10。U2/U3 已于同日晚按 `docs/exec-plans/active/TASK-058-authentication-client.md` 重新实施，实施与验收记录见 §11。

**Priority:**  
`Critical`（P0 安全闸门。当前任何人访问 IP 即可看到全部家庭资产，且侧栏存在一个无 handler 的「退出登录」假按钮）

**Owner:**  
`Planner`（已交付）→ `Implementer`（U1 2026-10-27；U2/U3 由 Lead + `users-admin` 于 2026-10-27 晚实施）→ 独立 `Reviewer`（U1 三轮 PASS；U2/U3 `ui-verify` 真实浏览器 28/28 PASS ×2）→ `Human`（**合入动作待执行**；卡已结案）

**Created:**  
`2026-10-26`

**Updated:**  
`2026-10-26`（立项 + 实码核查；同日 U1 ExecPlan 通过 Plan Review → `Approved`）· `2026-10-27`（U1 实施完成 → `REVIEWED`；U2 首次验收 `FAIL`，见 §10；同日晚按 Human 指令「继续完成未完成代码」补 U2/U3 ExecPlan 并实施完成，独立验收 28/28 PASS → `REVIEWED`，见 §11）· **`2026-10-28`（第二轮全量复验 `dd388ac` PASS → `COMPLETED` 并归档，见 §12 / §13）**

**Type:**  
`Feature + Security`（`shared` + `server` + `client` 三端）

**Related Product Spec:**  
`docs/product/specs/FS-authentication.md`（**基线**：G1–G7 / NG1–NG8 / §4 产品形态 / §5 角色矩阵 / §7 AC）

**Related ADR:**  
`docs/architecture/adr/ADR-001-authentication.md`（`Accepted`，2026-10-26）

**Execution Plan:**  
U1 → [`docs/exec-plans/complete/TASK-058-authentication-kernel.md`](../../exec-plans/complete/TASK-058-authentication-kernel.md)（`Approved` 2026-10-26，§9 的 5 项实施裁决已全部确认；**`Completed`，2026-10-28 已归档**）  
U2 / U3 → [`docs/exec-plans/complete/TASK-058-authentication-client.md`](../../exec-plans/complete/TASK-058-authentication-client.md)（`Approved` 2026-10-27；授权依据＝Human 同日指令「检查完成了多少，把没有完成的代码继续完成」，范围严格等于 FS §6.2 / §6.3；**`Completed`，2026-10-28 已归档**，实施记录见其 §11）

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
| **U2** | `/login` · `/account`（改用户名/密码）· 会话 Provider · 路由守卫 · axios 401 拦截 · **顶栏头像下拉（账户设置 + 退出登录，`D11`/`D12`）** | `client` | U1 |
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

- [x] 无 cookie 请求业务端点 → 401；`admin/admin` 登录 → 200 + 改密前业务端点 403、改密后 200（G1–G3 + E2E）
- [x] `member` 访问 `/api/users` → 403；`admin` → 200（G4）
- [x] 停用用户后其旧 cookie 立即 401，且库中会话被删除（G5 / A7）
- [x] 唯一 admin 不可停用/降级（`LAST_ADMIN_PROTECTED` / `CANNOT_DEACTIVATE_SELF`，状态不变）（G6 / G6b）
- [x] 跨源被 CORS 拒绝；未配 `CORS_ORIGINS` 时生产启动 fail-fast（G9 / G10）
- [x] `server` 既有集成测试改造后全绿（211/0）；`cron-worker` 测试零回归（77/0）
- [x] 登录限速：连续 5 次错密后第 6 次 → 429 `ACCOUNT_LOCKED`（G7）
- [x] ED-5 交付门槛：真实 Mongo + 真实 HTTP E2E **15/15**（`npm run e2e:auth --workspace server`）

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

明细与实施要点见 [ExecPlan §9](../../exec-plans/complete/TASK-058-authentication-kernel.md)。摘要：

| # | 裁决 |
|---|---|
| ED-1 | 新增 `bcryptjs` + `cookie-parser` 两个依赖（不引入 `bcrypt` / `express-session` / `jsonwebtoken`） |
| ED-2 | 密码 8–72 字符，**不强制**复杂度组合；超 72 显式拒绝，不静默截断 |
| ED-3 | 会话**绝对** 7 天过期，`lastSeenAt` 仅作审计，不用于续期 |
| ED-4 | 用户名强制小写存储，登录时同样先归一化 |
| ED-5 | 测试只 stub 会话查询、保留真实闸门；**端到端真实路径验证成为交付门槛**（未做不得声明 U1 完成） |

---

## 10. U2 验收结论（2026-10-27，独立 Reviewer）

**结论：`FAIL` — U2「客户端认证」在 `client/` 中零实现，属 BLOCKER，不可合入。** U1 判定不变（ExecPlan §12.3 PASS）。

被检验对象：分支 `feature/TASK-058-auth-kernel` 最新提交 `68f040c`，message 为 `feat(client): add login page and session-aware app shell`，body 逐条声明「加 `/login`、会话守卫、`safeNext`、顶栏头像下拉、首登强制改密」。

### 10.1 决定性证据：提交里没有一个客户端文件

| 核查 | 命令 | 结果 |
|---|---|---|
| 本次提交的 `client/` 改动 | `git show --name-only 68f040c -- client/` | **空**（44 个文件全是 docs / 原型 / 截图 / memory） |
| 分支相对 `main` 的客户端改动 | `git diff --stat main...HEAD -- client/` | **空** |
| 全部分支是否有登录页 | 7 个本地分支 + **22 个远端分支**逐个 `git grep -l "auth/login\|mustChangePassword\|safeNext" <ref> -- client/src` | **每个 ref 都是 0** |
| 客户端认证代码 | `grep -rn "useAuth\|AuthContext\|AuthProvider\|/login" client/src` | **0 命中**（`client/src` 唯一的 `interceptors` 是 `api.js` 的通用错误映射，不处理 401） |
| 页面清单 | `ls client/src/pages/` | `Alerts / Asset / Dashboard.jsx / LogViewer.jsx / Portfolio / Prices / Transaction` —— **无 `Login`、无 `Account`** |
| stash / 其它 worktree | `git stash list` · `git worktree list` | 均为空 |

### 10.2 运行时实拍（vite 6600 + server 8080，真实浏览器）

| 场景 | 结果 |
|---|---|
| 打开 `/` | 渲染完整外壳，但两块内容区均为红条 **「数据加载失败，请稍后重试」**（截图为证） |
| 打开 `/portfolios` | 同样「数据加载失败 / 加载组合失败」 |
| 打开 `/login` | **被重定向到 `/portfolios`**；全页 `input[type=password]` 计数 **0** —— 路由表里没有 `/login`，落到 `*` 兜底 |
| 经 vite 代理 `GET /api/portfolios` | **401 `UNAUTHENTICATED`**（不是代理故障，是闸门正常拒绝） |
| 顶栏右上 `User` 图标 | `AppLayout.jsx:133` 仅有 `title="账户"`，**无 `onClick`**，不是下拉 |
| 侧栏底部「退出登录」 | `Sidebar.jsx:252` **仍是假按钮**（无 handler）—— 本卡 §1 列出的原始症状之一，未处理 |

即：**当前分支是一个"后端要求登录、前端无处可登"的状态**。用户在浏览器里永远只能看到错误条，无法自救。后端侧确认可用（`admin/admin` 登录 200 + `mustChangePassword:true`），问题纯粹在前端缺失。

### 10.3 这次提交实际是什么

内容 = **TASK-059 / 060 / 061 三卡结案 + `portomind-prototype.html` 重导**（44 文件，含 28 张 PNG；59/60/61 从 `active/` → `complete/`，`_audit.cjs` 37→48 条断言、`_audit-auth.cjs` 现 59 条）。这批文档改动本身**质量是好的**，但它不是 U2。

而且同一提交内的 `.workbuddy/memory/2026-10-27.md` 自己写着：「**U2 真实前端登录页零代码**：… 全仓 `grep -r "login|AuthContext|useAuth" client/src` **0 命中**；`docs/ui/2.0` 里的登录页只是原型」，并明确「**不应混进 058 的 PR**」。**提交信息与提交内容、以及与其自带的记忆条目三者互相矛盾。**

### 10.4 其它发现

| # | 级别 | 内容 |
|---|---|---|
| B-1 | **BLOCKER** | U2 零实现（上文）。按 §5「发布耦合」，**本分支现状不可合入 `main`**：合入即全站 401。 |
| M-1 | MAJOR | `68f040c` 提交信息与内容不符（`feat(client)` 却零 client 文件），且把 059/060/061 结案混进 058 分支。该提交**已推送**（`origin/feature/TASK-058-auth-kernel` = `68f040c`），不宜改写历史；建议在 PR 描述里更正，并追加一个只含本次文档批次的说明性提交。 |
| M-2 | MAJOR | **U2 无 Approved ExecPlan**。本卡 §3/§6 明写「U2/U3 待 U1 实施后拆分」；按 `AGENTS.md §5/§6`（安全敏感、多文件、涉发布形态）U2 必须先出计划并经 Human 批准才能动代码。 |
| m-1 | MINOR | 原型层的 auth 能力是**齐的**（`portomind-prototype.html` 内已有 login / `safeNext` / 强制改密 / 顶栏下拉，`_audit-auth.cjs` 59 条），说明设计侧已到位 —— 缺的是把它落到 `client/src`。这一点值得肯定，也意味着 U2 实施时不必再重新设计。 |
| m-2 | MINOR | 文档侧**没有跟着吹**：`TASKS.md:5,13` 与 readme 仍写「U2 尚未拆分」、卡 Status 仍是 U1 `REVIEWED`。事实未被污染，问题只在提交信息。 |

### 10.5 通过项（U1 无回归）

- `npm run test:server` → **211 pass / 0 fail**
- `npm run build --workspace client` → **exit 0 / 2408 modules**
- 未带 cookie 访问 5 个业务端点 → 全 **401**；`POST /api/auth/login` → **200**
- `client/src` 零改动 → 不存在「顺手改坏」的回归面

### 10.6 放行条件

1. **先补 U2 计划**：Planner 产出 U2 ExecPlan（范围＝本卡 §3 的 6 项：`/login`、`/account`、会话 Provider、路由守卫、axios 401 拦截、顶栏头像下拉 + 首登强制改密），Human 批准后再动 `client/`。
2. U2 实施后按 ED-5 同等标准验收：**真实浏览器端到端**（未登录深链 → 跳 `/login?next=` → 登录 → 回落原页；首登强制改密；401 自动跳登录；退出登录真的清会话）。
3. 在此之前，`feature/TASK-058-auth-kernel` **只能作为"U1 后端待命分支"**，不得作为发布候选；`main` 保持现状（无闸门）反而是当前唯一可用的形态。

### 10.7 全量复核（2026-10-27 补充，Human 提示「已提交，须查全量」）

> 起因：Human 指出本轮不应只看未提交改动。**上文 10.1–10.6 的结论本身即基于已提交内容**（`68f040c` / `c571f91` 均已 push）；本节把取证面再扩到「提交历史 + 所有 ref + 游离对象 + 构建产物」，确认结论不因查漏而变。**结论不变：`FAIL`（B-1 仍成立）。**

| 取证面 | 命令 | 结果 |
|---|---|---|
| 工作区（含未跟踪/被忽略） | `git status --short --ignored` · `find client/src -iname "*auth*" -o -iname "*login*"` | 未提交仅 5 个 `.md`（Reviewer 自己的审查记录）；`client/` 下被忽略项只有 `.env` / `dist/` / `node_modules/`；**无 auth/login 文件** |
| 已提交内容（本轮两个提交） | `git show --name-only 68f040c` · `git show --name-only c571f91` | `68f040c` = 44 文件（docs/原型/PNG/memory）；`c571f91` = 44 文件（server/shared/docs）。**两者 `client/` 均为 0** |
| 分支相对 `main` | `git diff --stat main...HEAD -- client/` | **空** |
| 全部 ref（本地 + 远端） | 逐个 ref `git grep -l "auth/login\|mustChangePassword\|safeNext" -- client/src` | **22 个远端 + 7 个本地分支，全部 0 命中** |
| 历史是否出现过登录文件 | `git log --all --diff-filter=A --name-only -- "client/src/**" \| grep -Ei "login\|auth"` | **历史上从未出现**（不只是当前分支没有） |
| stash / worktree / 游离提交 | `git stash list` · `git worktree list` · `git fsck --lost-found` | stash 空、单 worktree；仅 2 个 dangling commit：`ac6e9e1`（TASK-054 文档 amend 前身）、`9058982`（U1 初版，被 reset 后重提为 `c571f91`）—— **`client/` 均为 0** |
| 远端是否有更新 | `git fetch --all --prune` + `for-each-ref --format='%(upstream:track)'` | 全部分支 **无 ahead/behind**，`origin/feature/TASK-058-auth-kernel` = `68f040c`，无「本地落后」 |
| **构建产物**（最硬证据） | 构建后 `grep -o` 检索 `client/dist/assets/*.js` | `auth/login` **0**、`mustChangePassword` **0**、`用户名/使用密码登录` **0**；`登录` 仅 1 处且来自 `退出登录`（同一个假按钮）。**即打出来的包在物理上不具备登录能力** |

补充判读：

- **不是"忘记提交"**：如果只是漏 commit，工作区或 stash 里会有痕迹；实测所有面都是零，说明 U2 从未被写出来。
- **不是"分支搞错"**：22 个远端分支全查过，历史上也从未新增过 `client/src` 下的 auth 文件；不存在「代码在别的分支」这种可能。
- **`68f040c` 的真实内容**（44 文件）：`docs/tasks/complete/TASK-059|060|061` 三卡结案 + `docs/ui/2.0/portomind-prototype.html`（+328/−159）+ 28 张 PNG + `_audit*.cjs` 断言扩容 + `docs/readme.md`/`TASKS.md`/`FS-*` 的同步。**这批原型与文档工作本身质量过关**（原型内 login / `safeNext` / 强制改密 / 顶栏下拉齐备，`_audit-auth.cjs` 59 条），问题只在"它不是 U2、却署名 U2"。
- **对 Human 的直接提示**：若您记忆中是"提交过 U2 代码"，请核对是否在**另一台机器/另一个 clone** 上提交；本仓库（`D:/projects/portomind`，单 worktree，无 stash，已 fetch 全部远端）确认不存在该代码。若代码在别处，请先把该分支推上来再重验。

---

## 11. U2/U3 实施与验收记录（2026-10-27 晚）

**结论：U2 / U3 已实施完成，独立 Reviewer 真实浏览器验收 28/28 PASS、代码复核无 BLOCKER/MAJOR（6 条 MINOR 不阻塞）。待 Human 合入 `main`（U1 + U2 必须同批）。**

ExecPlan：[`docs/exec-plans/complete/TASK-058-authentication-client.md`](../../exec-plans/complete/TASK-058-authentication-client.md)（`Completed` 2026-10-27，**2026-10-28 随本卡归档**；实施记录见 §11、复核记录见 §12）。

### 11.1 交付（21 个文件：13 新增 / 8 修改）

- **U2 地基与页面**：`services/auth.service.js`、`services/authSession.js`、`utils/safeNext.js`、`components/auth/{authContext.js,AuthProvider.jsx,RequireAuth.jsx,ForcedChangeScreen.jsx,ForbiddenUsersScreen.jsx}`、`pages/Login.jsx`、`pages/Account.jsx`；改 `router.jsx`（`/login` 公开 + `RequireAuth` 保护组 + 两条账户路由）、`services/api.js`（透传 `code`；401→清缓存跳登录，排除 auth 端点；403 `PASSWORD_CHANGE_REQUIRED`→刷新会话）、`constants/routes.js`。
- **布局与导航**：`components/layout/UserMenu.jsx`（身份行 + 账户设置 + 系统设置〔仅 admin〕+ 提醒规则 + 退出登录）；改 `AppLayout.jsx`（用户下拉 + 强制改密闸门 + 强制期停未读轮询）、`Sidebar.jsx`（5→4，删假「退出登录」）、`hooks/useAlerts.js`（`enabled`）。
- **U3（`users-admin` 实施）**：`pages/AccountUsers.jsx`、`components/users/{CreateUserModal.jsx,ResetPasswordModal.jsx}`、`hooks/useUsers.js`、`constants/enums.js`（追加 `USER_ROLES`/`USER_ROLE_LABELS`）。
- **服务端最小补充**：`controllers/auth.controller.js`（D-2：`lastLoginAt`）、`app.js` + `server/.env.example`（D-3：开发态 CORS 补 6600）；`client/.env*`（同源 `/api` 默认 + 文档化跨源前提）。
- **验收资产**：`client/scripts/e2e-task-058-u2.mjs`（独立 Reviewer 编写）。

### 11.2 FS §7 U2 / U3 验收标准（全部满足）

**U2**

- [x] 未登录直访 `/portfolios` → 跳 `/login?next=/portfolios`，登录后回原页；无 `next` 落 `/`（`D10`）
- [x] 密码错误文案不泄露账号是否存在（「用户名或密码错误」）；停用账号刻意例外「该账号已停用，请联系管理员」（`D8`）
- [x] 改用户名后**顶栏头像下拉身份行立即**显示新名（无整页刷新；侧栏已无用户区，`D12`）
- [x] 改密码后，另一浏览器同名会话下一次请求被登出（401 → 登录页，保留 `next`）
- [x] 顶栏下拉真实可用：「账户设置」→ `/account`、「退出登录」→ `/login`（回退键无法回到已登录页）；侧栏**无任何**账户入口（用户名区 / 账户设置 / 退出登录全无）

**U3**

- [x] admin 可见「系统设置」**独立页面**（下拉入口），member 下拉无此项且直访 `/account/users` 显示 403 屏
- [x] 新建用户后可用该账号登录，且被判为需改密（首登强制改密闸门生效）
- [x] 唯一 admin 的「停用」「降级」按钮为禁用态，且有文字说明原因（`title`），后端 409 兜底展示

**本卡 §1 / §6 的 U2 相关硬性项**

- [x] 侧栏 5→4 项，假「退出登录」删除；「提醒规则」移入下拉（v1.5）
- [x] 强制改密闸门：`mustChangePassword=true` 时除 `/account` 外一律显示「需要修改密码后才能继续」，无可跳过入口；下拉仍可用，仅「系统设置」禁用 + `title`（`D13`）
- [x] 任意业务接口 401 → 清业务缓存 → 跳 `/login?next=<当前路径>`
- [x] `safeNext` 拒绝 `//host`、`/\`、控制字符、含 `next=`、`/login` 自嵌套（无开放重定向）
- [x] 首次登录开箱可用 `admin/admin` + 强制改密；登录页**不提示**默认账号（FS §4.1）

### 11.3 验证证据（2026-10-27）

| 项 | 命令 / 方式 | 结果 |
|---|---|---|
| 真实浏览器 E2E（**交付门槛**） | `node client/scripts/e2e-task-058-u2.mjs`（真实 Chrome + 真实 server 8080 + 真实 Mongo 临时库 + vite dev 6600） | **28/28 PASS，EXIT=0**；三轮 19→25→28，失败均先归因 Reviewer 脚本 bug/时序（详见 ExecPlan §12.1）；`pageerror=0` |
| 构建 | `npm run build --workspace client` | **exit 0 / 2423 modules**；`dist` 中实测含 `auth/login` / `auth/session` / `mustChangePassword` / `账户菜单` / `设定新密码并进入` / `无权访问用户管理` 等字符串（物理证据） |
| 静态 | `npx eslint src`（client/src 全量） | **0 error / 0 warning**（全量 `npm run lint` 仍有 2 个既有 error：`client/scripts/verify-price-display.cjs`、`client/vite.config.js`，非本卡文件、改动前已存在） |
| 回归 | `npm run test:server` / `npm run test:worker` | **211 pass / 0 fail** · **77 pass / 0 fail** |
| 独立代码复核 | Reviewer 对照 FS §7 + `D1–D13` 审 `git diff -- client server` | **PASS（无 BLOCKER / 无 MAJOR）**；6 条 MINOR（强制改密后不回收 `next`、login `lastLoginAt` 毫秒差异、banner 不自动消失、强制态铃铛可点、本地 `.env` 同步、仅 Chrome 验证）记入 ExecPlan §12.4 |
| 环境清理 | Reviewer 独立复核 | 8080/6600 已停；临时库 `portomind_u2_e2e` 已 drop（未触碰 `portomind_dev`） |

### 11.4 实施级裁决与偏差（详见 ExecPlan §4.4 / §11.2）

D-1 强制改密态仍要求「当前密码」（服务端强校验，原型曾省略）；D-2 `/api/auth/session` 与 login 补 `lastLoginAt`；D-3 开发态 CORS 补 Vite 6600；D-4 401 拦截排除 auth 端点；D-6 member 不渲染「系统设置」；D-7 强制态下拉可用、系统设置禁用；D-8 侧栏 4 项；D-9 唯一 admin 按服务端列表事实禁用；D-10 弹窗受控实现。验收期新增：axios `withCredentials: true` + `client/.env*` 改为同源 `/api`（U1 认证暴露的配置债）。

### 11.5 遗留与发布

- **MINOR（不阻塞，ExecPlan §12.4）**：强制改密成功后不回收登录时的 `next`；login `lastLoginAt` 毫秒差异；banner 不自动消失；强制态铃铛可点；`server/.env` 需本地同步 6600；仅 Chrome 验证。
- **发布**：本分支现为 U1+U2 发布候选；**U1 与 U2 必须同批上线**。首次部署 `admin/admin` 首登强制改密；生产需配 `CORS_ORIGINS`（缺省 fail-fast）；开发态推荐 `VITE_API_URL` 留空走同源 proxy。
- **合入后**：本卡 `git mv` → `complete/`，两份 ExecPlan 归档，并同步 `TASKS.md` / `readme`。

---

## 12. 第二轮独立复核（2026-10-28，Reviewer 全量复验 `dd388ac`）

**结论：`PASS` — U2/U3 满足 FS §7 与卡内 §1 硬性项，可交 Human 合入（U1 + U2 必须同批）。** 与 §10 的关系：§10 判定针对的是提交 `68f040c`（当时确无 `client/` 代码，全量取证见 §10.7）；实施方随后以 `dd388ac` 补齐 U2/U3，本节为对**该提交**的独立复验，不推翻 §10 的方法论结论。

### 12.1 复验对象与范围

| 项 | 内容 |
|---|---|
| 提交 | `dd388ac feat(auth): implement client login, session guards and user management`（39 文件，+4461/−123） |
| 工作区 | `git status` 空；`git diff --quiet HEAD` = 0（复验全程未改动实现代码） |
| 范围 | 全量：提交内容 + 工作树 + 构建产物 + 真实浏览器端到端 |

### 12.2 静态与回归（本轮独立复跑）

| 项 | 命令 | 结果 |
|---|---|---|
| 构建 | `npm run build --workspace client` | **exit 0** |
| Lint | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | **0 error / 0 warning** |
| 服务端回归 | `npm run test:server` | **211 pass / 0 fail** |
| Worker 回归 | `npm run test:worker` | **77 pass / 0 fail** |
| 构建产物物理证据 | `grep -o` 检索 `client/dist/assets/*.js` | `auth/login` 2 · `auth/session` 2 · `mustChangePassword` 9 · `账户菜单` 3 · `无权访问用户管理` 1 · `设定新密码并进入` 1 —— 与 §10.7 的「零命中」形成正反对照 |

### 12.3 真实浏览器端到端（本轮独立执行）

- 命令：`node client/scripts/e2e-task-058-u2.mjs`（自起 server 8080 + vite dev 6600 + 本机 Chrome + 真实 Mongo 临时库 `portomind_u2_e2e`，脚本 finally 已 drop）
- 结果：**`28/28 PASS`，EXIT=0**，`pageerror=0`，24 张截图
- 关键观察值（摘）：`/login?next=%2Fportfolios` 深链回跳成功；错误密码 URL 不变（无重定向循环）；强制改密态下拉 4 项且「系统设置」`title=请先完成密码修改`；侧栏 `Dashboard/组合管理/今日行情/日志` 4 项无登出；member 下拉 3 项无「系统设置」；唯一启用 admin 的停用/降级 `title` 均给出原因；改密后另一会话下一次请求 401 → `/login?next=/portfolios`；停用账号文案「该账号已停用，请联系管理员」

### 12.4 负向对照（证明断言可失败，非恒真）

| # | 注入缺陷 | 期望 | 实测 | 还原 |
|---|---|---|---|---|
| N-1 | 删除 `utils/safeNext.js` 中 `//` 与 `/\` 的拒绝分支（开放重定向） | AC8 变红 | **27/28，AC8 FAIL** | `cp` 还原，md5 与提交一致 |
| N-2 | `AppLayout` 的强制改密闸门改为 `false`（可跳过改密访问业务页） | AC4b 变红 | **25/28，AC4b/AC4d/AC9b FAIL** | `cp` 还原，`git diff --quiet HEAD` = 0 |

两条对照说明：E2E 的安全类断言确实落在**运行时行为**上，不是形式断言。

### 12.5 本轮新增发现（MINOR，不阻塞）

| # | 级别 | 内容 |
|---|---|---|
| R-1 | MINOR | `login` 返回的 `lastLoginAt` 是**本次**登录时间（`markLogin` 刚落库），账户页标为「上次登录」，实测显示的就是刚刚；语义上更像「本次登录」。若要真「上次」，需在 `markLogin` **之前**取值。 |
| R-2 | MINOR | E2E `AC5b` 的「成功提示」未真正断言（脚本记为「未捕获到提示文案，以会话状态为准」）—— 该条 AC 目前只验到会话状态，未验 UI 反馈。 |
| R-3 | MINOR | `safeNext` 只拦 `/login`、`/login?`、`/login/` 三种形态，`/login/foo` 会放行（落到 `*` → `/portfolios`，无开放重定向风险，仅语义不严）。 |
| R-4 | MINOR | 验收脚本由实施方一侧编写、由 Lead 会话执行（ExecPlan §12 已声明独立性受限）。本轮由 Reviewer 独立重跑 + 负向对照补强，结论可信度已提升，但**脚本本身仍是实现方资产**。 |
| R-5 | MINOR | `RequireAuth` 在会话查询**网络失败**（非 401）时也按未登录处理，弱网下会闪回登录页；当前 `retry:false` 放大了该行为。 |

### 12.6 放行与后续

1. **可合入**：`feature/TASK-058-auth-kernel`（U1 `c571f91` + `dd388ac`）作为**同一批**发布候选；单独合入 U1 会造成全站 401，禁止。
2. 合入后按 §11.5 收尾：本卡 `git mv` → `complete/`，两份 ExecPlan 归档，同步 `TASKS.md` / `readme` / 交叉引用。
3. R-1 / R-3 / R-5 建议并入后续「认证体验优化」小任务；R-2 建议在下一轮 E2E 补断言。

---

## 13. 完成记录（Completion Record · 2026-10-28）

**结论：`COMPLETED`。** U1 + U2 + U3 全部交付并通过独立复核，本卡归档 `complete/`，两份 ExecPlan 一并归档。**代码未合入 `main`**——与 `TASK-054` 同构：归档依据是「实现 + 独立复核完成」，合入与发布是 Human 的独立动作。

### 13.1 结案前本轮独立复跑（不采信历史记录）

| 项 | 命令 | 结果 |
|---|---|---|
| 服务端回归 | `LOG_DIR=$TEMP npm run test --workspace server` | **`tests 211` · `pass 211` · `fail 0`** |
| Worker 回归 | `LOG_DIR=$TEMP npm run test --workspace cron-worker` | **`tests 77` · `pass 77` · `fail 0`** |
| 前端构建 | `npm run build --workspace client` | **exit 0**，`✓ built in 3.72s`（969.59 kB / gzip 279.56 kB） |
| 前端 Lint | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | **exit 0，0 error / 0 warning** |
| 合并状态 | `git merge-base --is-ancestor dd388ac main` | **否（未合入）** —— `main` = `0d95319`，分支 = `dd388ac` |

产物存在性核对（非仅看日志）：`shared/models/{user,session}.js` · `shared/services/{user,session}.service.js` · `server/middleware/{auth,loginThrottle}.js` · `server/routes/{auth,user}.routes.js` · `server/test/helpers/auth.js` · `client/src/components/auth/{AuthProvider,RequireAuth}.jsx` · `client/src/pages/{Login,Account,AccountUsers}.jsx` · `client/src/utils/safeNext.js` · `client/src/services/auth.service.js` · `client/scripts/e2e-task-058-u2.mjs` 全部存在；`server/package.json` 含 `bcryptjs ^3.0.3` + `cookie-parser ^1.4.7`；`client/src/router.jsx` 的 `/login` 公开 + `RequireAuth` 包裹其余路由均已在位。

> 真实浏览器 E2E（`28/28`）与两条负向对照未在本轮重跑——今天（2026-10-28）Reviewer 已对**同一提交 `dd388ac`**独立执行并记录于 §12.3 / §12.4，工作树自那之后未改动实现代码（`git status` 中仅文档改动）。

### 13.2 归档动作（三处同步）

| # | 动作 | 结果 |
|---|---|---|
| 1 | 本卡 `git mv` → `docs/tasks/complete/` | ✅ |
| 2 | `docs/exec-plans/active/TASK-058-authentication-kernel.md` → `complete/` | ✅ |
| 3 | `docs/exec-plans/active/TASK-058-authentication-client.md` → `complete/` | ✅ |
| 4 | 卡内 `Status` → `COMPLETED`；本 §13 为完成记录 | ✅ |
| 5 | `docs/tasks/TASKS.md`：Active 段移除 058、Done 表新增一行；「`Approved` ExecPlan 现有 2 份」改写为已归档 | ✅ |
| 6 | `docs/readme.md`：058 由「活跃任务」移入「已完成任务」 | ✅ |
| 7 | 交叉引用：`ADR-001` 的 ExecPlan 链接、`CLIENT.md` / `PL-0` 中「U2/U3 待做 / 尚未上线」的陈旧陈述 | ✅ |

### 13.3 遗留（不阻断结案，均已有归属）

| # | 项 | 处置 |
|---|---|---|
| 1 | **合入 `main` 与发布** | Human 动作。U1 `c571f91` + U2/U3 `dd388ac` **必须同批**；单独合 U1 = 全站 401 |
| 2 | `R-1`~`R-5`（§12.5，5 条 MINOR） | R-1/R-3/R-5 建议并入后续「认证体验优化」小任务；R-2 在下一轮 E2E 补「成功提示」断言 |
| 3 | 真实前端仅 Chrome，未覆盖 Firefox/WebKit、多实例与反代部署 | 已记为已知限制（U2 ExecPlan §12.4-6） |
| 4 | 限速为单实例内存 `Map` | 多实例部署时须改 Mongo，已在 U1 ExecPlan §4.5 登记 |

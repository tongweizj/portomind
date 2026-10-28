# TASK-058 — 账号与访问控制（U2：前端登录与账户页；U3：管理员用户管理）

## Status

Current status:

`Completed`（2026-10-27 实施完成；**2026-10-28 随 `TASK-058` 结案归档 `complete/`**）—— 实施完成（§11）；独立 Reviewer 真实浏览器验收 **28/28 PASS**、EXIT=0，代码复核 **PASS（无 BLOCKER / 无 MAJOR，6 条 MINOR 不阻塞）**（§12），2026-10-28 对 `dd388ac` 全量复验再次 28/28 + 2 条负向对照成立（见任务卡 §12）；**代码仍在分支 `dd388ac`，未合入 `main`**（合入属 Human 动作；U1+U2 必须同批）。**授权依据**：Human 2026-10-27 直接指令「请阅读 task58 任务卡以及相关的文档！检查当前完成了多少，把没有完成的代码继续完成」。本计划范围严格等于 `FS-authentication.md §6.2 / §6.3` 与任务卡 `§3` 的 U2 / U3，不含任何新增产品裁决；U1（`docs/exec-plans/complete/TASK-058-authentication-kernel.md`）判定不变。

Owner:

`Planner`（2026-10-27）→ `Implementer`（Lead + `users-admin`）→ 独立 `Reviewer`（`ui-verify`，真实浏览器验收 + 代码复核）→ `Human`（**合入动作待执行**；本计划已 `Completed` 归档）

Priority:

`Critical`（U1 已使全站要求登录；U2 未上线 = 浏览器无登录入口，全站 401，**不可发布**）

Related task:

`docs/tasks/complete/TASK-058-authentication-and-accounts.md`

Related spec / ADR:

`docs/product/specs/FS-authentication.md`（v1.5）· `docs/architecture/adr/ADR-001-authentication.md`

---

## 1. Intent

### Goal

把 U1 的后端认证内核接到前端：`/login` 登录页、`/account` 账户页（改用户名 / 改密码 / 强制改密态）、`/account/users` 系统设置页（admin）、会话 Provider、路由守卫、axios 401 拦截、顶栏头像下拉（身份行 + 账户设置 + 系统设置〔admin〕+ 提醒规则 + 退出登录），并删除侧栏假「退出登录」与侧栏账户入口。

### Why

U1 已让全部业务端点要求会话（未登录 401），但 `client/` 无任何登录入口：

- 浏览器打开任何页面只会看到「数据加载失败」红条，用户无法自救；
- 侧栏「退出登录」（`Sidebar.jsx:242-253`）仍是无 handler 的假按钮——这正是任务卡 §1 立项时的原始危险症状；
- 顶栏 `User` 图标（`AppLayout.jsx:123-136`）只有 `title="账户"`，不可点击。

即「后端要登录、前端无处可登」。U2 是 U1 的**同批发布前置**（FS §10 / 任务卡 §5），不做 U2 则 TASK-058 无法交付。

### Scope

| 单元 | 内容 |
|---|---|
| **U2** | `client/src`：`/login`、`/account`、会话 Provider（TanStack Query `['session']`）、路由守卫（未登录 → `/login?next=`、强制改密闸门）、axios 401 → 清缓存 → 跳登录、`safeNext`、顶栏头像下拉、侧栏 5→4 项且删除假退出登录 |
| **U2 配套（最小服务端改动）** | `/api/auth/session` / `login` 的用户载荷补 `lastLoginAt`（账户页「上次登录」唯一数据源，见 D-2）；开发态 CORS 白名单补 Vite 端口（见 D-3） |
| **U3** | `/account/users` 系统设置页：用户列表、新建、停用/启用、重置密码、改角色、唯一启用 admin 守护的禁用态与提示、非 admin 直访 403 屏 |

### Out of Scope

- 不改 U1 认证语义、错误码、会话/限速/CORS 策略（除 D-2 / D-3 两处最小补充）；
- 不改任何业务页面、业务模型、业务 API 契约；
- 不做自助注册 / 找回密码 / 操作留痕 / 多租户 / 用户删除 / 2FA（FS §3 NG1–NG8）；
- 不重做 TASK-059/060/061 的原型；不改 `docs/ui/2.0/*`；
- 不做顶栏「位置标题」语义（TASK-060 原型整改项，不在本卡 §3）；
- 不引入新的状态库 / 表单库 / 组件库（沿用 TanStack Query + 内联 token 样式 + 原生表单）。

### Constraints

- 遵循 `client/AGENTS.md`：所有请求走 `services/api.js` 统一 Axios 实例；新页面直接用 Query hooks；错误统一 `getApiErrorMessage`；纯 JS/JSX、无 TS、文案与注释简体中文。
- 登录失败文案**不得**泄露账号是否存在（FS `D8`：停用账号是唯一例外）。
- 禁止 `AUTH_DISABLED_FOR_TESTS` 之类绕过；禁止把真实口令/演示账号写进登录页（FS §4.1）。
- 401 拦截必须排除 `/auth/login`、`/auth/session`、`/auth/logout`，否则登录失败会被误判为会话失效并造成重定向循环（D-4）。
- 强制改密态：除 `/account` 外一律拦到「需先修改密码」屏，**无可跳过入口**；顶栏下拉仍可用（登出 / 账户设置不被挡），「系统设置」保留但禁用并提示原因（FS §4.2 / §13.3-8 / `D13`）。
- 角色守卫：member 下拉**不渲染**「系统设置」（不是置灰）；直访 `/account/users` 显示 403 屏（FS U3-R5）。

### Acceptance Criteria

以 `FS-authentication.md §7 U2 / U3` 为准，不复制。补充实现级硬性项：

- [ ] 未登录直访 `/portfolios` → `/login?next=/portfolios`；登录后回原页；无 `next` 落 `/`（`D10`）
- [ ] 错误密码 → 同一文案「用户名或密码错误」；停用账号 → 「该账号已停用，请联系管理员」（`D8`）
- [ ] `admin/admin` 登录 → 强制改密态：业务路由显示「需要修改密码后才能继续」屏；改密后恢复，`mustChangePassword=false`
- [ ] 顶栏下拉：身份行（用户名 + 角色同一行、角色弱化）+ 分隔线 + 账户设置 + 系统设置（仅 admin）+ 提醒规则 + 退出登录（末位）；member 恰 3 动作项 / admin 恰 4；点击外部与 `Esc` 关闭；`aria-expanded` 正确
- [ ] 退出登录 → 库中会话删除、cookie 清空、跳 `/login`；回退键不能回到已登录页
- [ ] 改用户名后顶栏身份行即时刷新（无需刷新页面）；旧用户名不再能登录，新用户名可登录
- [ ] 改密码后其他浏览器同账号会话在下一次请求被登出（401 → 跳登录）
- [ ] 侧栏恰 4 项、无账户入口、无「退出登录」假按钮
- [ ] `/account/users`：列表（用户名/角色/状态/上次登录/创建时间/待改密）、新建（对方首登强制改密）、停用/启用（即时踢下线）、重置密码（不可对自己）、改角色；唯一启用 admin 的「停用」「降级」按钮禁用并提示原因
- [ ] member 下拉无「系统设置」；直访 `/account/users` 显示 403 屏
- [ ] 任意业务接口 401 → 清 Query 缓存 → 跳 `/login?next=<当前路径>`
- [ ] `npm run build --workspace client` 0；`npx eslint` 无新增错误；`test:server` 211/0；`test:worker` 77/0
- [ ] 真实浏览器 E2E（真实 Mongo + 真实 server + vite）全绿（交付门槛，见 §6）

---

## 2. Context

- U1 已交付：`User` / `Session`、`requireAuth` / `requireAdmin`、`/api/auth/*`（5）、`/api/users/*`（4）、默认 `admin/admin` seed、登录限速、CORS 白名单。契约见 `docs/dev/API_CONTRACT.md:63-71`。
- 产品形态与屏幕设计：`FS-authentication.md §4 / §13`（v1.5：`D11` 退出登录入下拉、`D12` 账户入口入下拉、`D13` 系统设置独立页、v1.5 提醒规则移出侧栏）。
- 行为标尺：`docs/ui/2.0/portomind-prototype.html` 的 `#/login`、`#/account`、`#/account/users`、`vForcedChange`、`vForbiddenUsers`、`safeNext`、用户下拉。**原型带演示登录态与 `data-demo` 文案，落地不得保留**。
- 现状客户端：路由集中 `client/src/router.jsx`、唯一 Axios 实例 `services/api.js`、`main.jsx` 的 QueryClient（`retry:1` / `staleTime:60s`）、布局 `AppLayout` + `Sidebar`、设计 token `constants/design-tokens.js`。

---

## 3. Repository Findings（2026-10-27 实码核查）

| # | 事实 | 位置 | 影响 |
|---|---|---|---|
| F1 | `client/` 零认证代码：无 `/login`、`/account`、`useAuth`、`AuthProvider`、401 拦截 | `grep -rn "useAuth\|AuthContext\|/login" client/src` = 0 | 本计划范围 |
| F2 | 侧栏底部「退出登录」无 `onClick`；侧栏仍有 5 项（含「提醒规则」） | `Sidebar.jsx:31-46, 242-253` | 按 FS v1.5 改 4 项并删除假按钮 |
| F3 | 顶栏 User 图标无 `onClick`，不是下拉 | `AppLayout.jsx:123-136` | 替换为 `UserMenu` |
| F4 | `router.jsx` 全部路由嵌套在 `<AppLayout/>`，无公开路由 | `router.jsx:37-81` | 需拆 `/login`（无布局）与守卫组 |
| F5 | `api.js` 响应拦截器只解包 `response.data`、挂 `apiMessage/traceId/status`，**不处理 401**，也不透传业务 `code` | `services/api.js:14-23` | 需扩拦截器（排除 auth 端点） |
| F6 | `main.jsx` 的 `QueryClient` 在 `App` 外层，`App` 内只有 `BrowserRouter` | `main.jsx:6-15`、`App.jsx` | Provider 需放在 Router 内（要用 `useNavigate`），QueryClient 已在更外层 |
| F7 | 服务端 `/api/auth/session` 的 `user` 只有 `{id,username,role,mustChangePassword}`，**无 `lastLoginAt`** | `server/controllers/auth.controller.js:90-106`、`API_CONTRACT.md:65` | 账户页「上次登录」无数据源 → D-2 最小补充 |
| F8 | Vite dev 端口 = **6600**（`strictPort`），但 `server/.env` 的 `CORS_ORIGINS` 只含 5173，`app.js` 的 `DEV_DEFAULT_ORIGINS` 也只含 5173/9000 | `client/vite.config.js:8-10`、`server/app.js:31-38`、`server/.env` | 浏览器经代理发 POST 会带 `Origin: http://localhost:6600` → 可能 403 CORS → D-3 |
| F9 | 无客户端测试框架（无 vitest）；既有交付验证靠 `client/scripts/e2e-task-*.mjs`（playwright-core + 本机 Chrome） | `client/package.json`、`scripts/` | E2E 沿用同手法 |
| F10 | 根 `node_modules/playwright-core` 已存在；`C:/Program Files/Google/Chrome/Application/chrome.exe` 存在；`server/.env` 的 Mongo 远端可达（192.168.2.140:27017） | 本机实测 | 真实浏览器验收可行 |
| F11 | 服务端 `changeOwnPassword` **强制校验 `currentPassword`**，无「首登免旧密」旁路 | `shared/services/user.service.js` | 强制改密态表单**必须**含「当前密码」（与原型演示表单不同，D-1） |
| F12 | 服务端错误体：`{success:false,message,traceId,code?,details?}`；`toPublicUser(forAdmin)` 含 `active/lastLoginAt/createdAt` | `utils/apiResponse.js`、`shared/services/user.service.js` | 前端按 `error.code` 而非 message 分流 |

---

## 4. Proposed Design

### 4.1 新增文件（`client/src`）

| 文件 | 职责 |
|---|---|
| `services/auth.service.js` | 全部认证 / 用户管理端点（login/logout/getSession/changePassword/updateProfile/listUsers/createUser/updateUser/resetUserPassword） |
| `services/authSession.js` | 401 / 强制改密事件桥（拦截器 → Provider 解耦，避免 service 依赖 React） |
| `utils/safeNext.js` | `safeNext(raw)` + `buildLoginPath(next)`（拒绝 `//`、`/\`、控制字符、含 `next=`、`/login` 自身） |
| `components/auth/AuthProvider.jsx` | 会话 Query（`['session']`）+ `useAuth()`；登录/登出/更新会话缓存；注册 401 处理器 |
| `components/auth/RequireAuth.jsx` | 未登录守卫（loading 屏 / `Navigate` 到 `/login?next=`） |
| `components/auth/ForcedChangeScreen.jsx` | 「需要修改密码后才能继续」屏 |
| `components/auth/ForbiddenUsersScreen.jsx` | member 直访 `/account/users` 的 403 屏 |
| `components/layout/UserMenu.jsx` | 顶栏头像下拉（身份行 + 4 个动作项） |
| `hooks/useUsers.js` | `useUsers()` + 新建/更新/重置密码 mutation（`['users']` 失效） |
| `pages/Login.jsx` | 登录页（无 AppLayout） |
| `pages/Account.jsx` | 账户页（身份卡 + 改用户名 + 改密码 + 强制改密态） |
| `pages/AccountUsers.jsx` | 系统设置页（admin） |
| `components/users/CreateUserModal.jsx` / `ResetPasswordModal.jsx` | 两个弹窗 |
| `scripts/e2e-task-058-u2.mjs` | 真实浏览器验收脚本（由独立 Reviewer 编写，从 FS AC 出发） |

### 4.2 修改文件

| 文件 | 改动 |
|---|---|
| `constants/routes.js` | `ROUTE_PATTERNS/ROUTES` 增 `LOGIN` / `ACCOUNT` / `ACCOUNT_USERS` |
| `router.jsx` | `<BrowserRouter><AuthProvider>…`；`/login` 公开路由；受保护组 `<Route element={<RequireAuth/>}>`；`/account`、`/account/users` |
| `services/api.js` | 透传 `error.code`；401（排除 auth 端点）→ `notifyUnauthorized()`；403 `PASSWORD_CHANGE_REQUIRED` → `notifyPasswordChangeRequired()` |
| `components/layout/AppLayout.jsx` | User 假按钮 → `<UserMenu/>`；主体按强制改密态渲染 ForcedChangeScreen 或 `<Outlet/>` |
| `components/layout/Sidebar.jsx` | 删「提醒规则」项（5→4）；删底部（假）「退出登录」及 `LogOut`/`Bell` 引用 |
| `constants/enums.js` | 增 `USER_ROLES` / `USER_ROLE_LABELS`（管理员 / 成员） |
| `server/controllers/auth.controller.js` | login / session 的 `user` 载荷补 `lastLoginAt`（D-2） |
| `server/app.js` | `DEV_DEFAULT_ORIGINS` 补 `http://localhost:6600` / `http://127.0.0.1:6600`（D-3） |
| `server/.env.example` | 开发默认来源注释同步 6600（D-3；`.env` 本地同步，不入库） |

### 4.3 会话与数据流

```
main.jsx（QueryClientProvider）
└ App → BrowserRouter
   └ AuthProvider                     ← useQuery(['session'], getSession)
      ├ /login  → Login              （已登录访问 → Navigate '/'）
      └ RequireAuth                  （未登录 → /login?next=<path+search>）
         └ AppLayout                 （Sidebar + Topbar[UserMenu] + main）
            ├ mustChangePassword && pathname!=/account → ForcedChangeScreen
            └ Outlet
               ├ /portfolio…（既有业务路由，零改动）
               ├ /account       → Account
               └ /account/users → AccountUsers（非 admin → ForbiddenUsersScreen）
```

- `login()` 成功后：`queryClient.setQueryData(['session'], {authenticated:true,user})` → `mustChangePassword` 落 `/account`，否则落 `safeNext(next) ?? '/'`（`D10`）。
- `logout()`：调 `POST /auth/logout`（幂等）→ `queryClient.clear()` → `navigate('/login', {replace:true})`。
- 401 拦截：`notifyUnauthorized()` → Provider `queryClient.clear()` + `navigate(buildLoginPath(currentPath), {replace:true})`，并跳过 `/login` 自身与 auth 端点（D-4）。
- 强制改密：改密成功后 `setQueryData` 更新 `user.mustChangePassword=false` → 守卫解除 → `navigate('/', {replace:true})`。

### 4.4 关键实现裁决（实施级）

| # | 裁决 | 理由 |
|---|---|---|
| D-1 | **强制改密态表单仍要求「当前密码」** | 服务端 `changeOwnPassword` 强制校验（F11），删除旁路会降低安全性；原型强制态省略旧密仅为演示，落地以服务端语义为准。文案说明「首次登录也需填写管理员给你的初始密码」 |
| D-2 | `/api/auth/session` 与 `login` 的 `user` 补 `lastLoginAt`（服务端 1 行级改动 + 契约文档） | FS §4.3 身份区要求「上次登录」；U1 契约未含该字段（F7）。属**追加字段**，不破坏既有消费者 |
| D-3 | 开发态 CORS 默认来源补 Vite 端口 6600（`app.js` + `.env.example`；本地 `.env` 同步） | Vite 端口与 U1 写的白名单不一致（F8）；不改则开发态浏览器 POST login 可能 403。生产行为不变（生产必须显式配 `CORS_ORIGINS`） |
| D-4 | 401 拦截排除 `/auth/login`、`/auth/session`、`/auth/logout` | 密码错误本身是 401；不排除会误跳登录页并可能循环 |
| D-5 | `next` 只编码 `pathname+search`；`safeNext` 拒绝 `//` / `/\` / 控制字符 / 含 `next=` / 指向 `/login` | TASK-060 `safeNext` 已定规则（开放重定向防护），直接复用 |
| D-6 | member 下拉**不渲染**「系统设置」；直访 URL 由页面级 403 屏承接 | FS U3-R5 / `D13`：不是置灰而是不存在 |
| D-7 | 强制改密态下 `UserMenu` 仍可用，「系统设置」`disabled` + `title="请先完成密码修改"` | FS §13.3-8 |
| D-8 | 侧栏保持 4 项、文案沿用客户端现状（Dashboard / 组合管理 / 今日行情 / 日志）；不做「自选行情」改名 | 改名属 TASK-060 原型对齐，不在本卡 §3 范围 |
| D-9 | 唯一启用 admin 的禁用判断在**服务端事实**上计算（`GET /api/users` 结果），按钮 `disabled` + `title` 说明；服务端 409 `LAST_ADMIN_PROTECTED` 仍要兜底展示 | FS §4.4 核心不变量：不静默失败 |
| D-10 | 用户管理弹窗用受控 `div` 遮罩（无第三方库），`role="dialog"` + `aria-modal`；Confirm 类操作仍用 `window.confirm` 作二次确认 | 沿用客户端零依赖风格 |

### 4.5 U3 行内操作规则（照 FS §4.4 / `D9`）

| 行 | 条件 | 行为 |
|---|---|---|
| 重置密码 | 自己那一行 | **不提供**；改「改密码」→ `/account`（`D9`） |
| 重置密码 | 他人 | 弹窗设新密码 → 200；目标全部会话失效 + `mustChangePassword=true` |
| 停用/启用 | 自己 | 停用按钮禁用，`title="不能停用自己"` |
| 停用/启用 | 唯一启用 admin | 停用按钮禁用，`title="最后一个启用管理员，不可停用"` |
| 改角色 | 唯一启用 admin 那一行 | 下拉禁用，`title="最后一个启用管理员，不可降级"` |
| 新建用户 | — | 用户名 + 初始密码 + 角色；成功提示「对方首次登录需改密」 |

---

## 5. Work Breakdown

- [ ] **W1 地基**：`routes.js` 三路由；`services/auth.service.js`；`utils/safeNext.js`；`services/authSession.js`；`services/api.js`（透传 code + 401/403 事件）。
- [ ] **W2 会话层**：`AuthProvider` + `useAuth`；`RequireAuth`；`Login.jsx`；`router.jsx` 重排（`/login` 公开 + 受保护组）。
- [ ] **W3 布局**：`UserMenu`；`AppLayout`（用户菜单 + 强制改密闸门）；`Sidebar`（5→4、删假退出登录）。
- [ ] **W4 账户页**：`Account.jsx`（身份卡 / 改用户名 / 改密码 / 强制改密态 / 成功与错误反馈）。
- [ ] **W5 用户管理（委派 `users-admin`）**：`enums.js` + `hooks/useUsers.js` + `pages/AccountUsers.jsx` + `CreateUserModal` / `ResetPasswordModal`；403 屏接入。
- [ ] **W6 服务端最小补充**：`auth.controller.js` 的 `lastLoginAt`；`app.js` / `.env.example` 开发来源 6600；`API_CONTRACT.md` 同步。
- [ ] **W7 验证**：build / lint / `test:server` / `test:worker`；`client/scripts/e2e-task-058-u2.mjs` 真实浏览器全绿（独立 Reviewer 执行并出证）。
- [ ] **W8 文档回写**：`CLIENT_DEV`（路由表 / hooks / §8.1）、`TASKS.md`、任务卡（U2/U3 AC 勾选 + §11 完成记录）、`docs/readme.md`、memory。

---

## 6. Verification

| 层 | 手段 | 期望 |
|---|---|---|
| 静态 | `npm run build --workspace client` | exit 0 |
| 静态 | `npm run lint --workspace client` | 无新增 error |
| 回归 | `npm run test:server` | 211/0（D-2 改动不破坏） |
| 回归 | `npm run test:worker` | 77/0 |
| 端到端（**交付门槛**） | `client/scripts/e2e-task-058-u2.mjs`：临时库 `portomind_u2_e2e` + 真实 `server`（8080）+ 真实 `vite`（6600）+ 本机 Chrome | 覆盖 §1 AC 全部条目，逐条 PASS/FAIL |

E2E 数据护栏：临时库名改写，仅当连接串确实指向 `portomind_u2_e2e` 时才允许 drop（沿用 `server/scripts/e2e-auth-058.cjs` 做法）；不得指向 `portomind_dev`。

> **验证独立性**：脚本由独立 Reviewer（`ui-verify`）依据 FS §7 AC 编写与执行，不采信实现方自述；实现方（Lead / `users-admin`）只跑 build/lint/服务端测试。这是 TASK-059/060「不采信执行方审计脚本」教训的延续。

---

## 7. Risks

| # | 风险 | 影响 | 处置 |
|---|---|---|---|
| R1 | 401 拦截把「密码错误」当会话失效 → 登录页自我重定向循环 | 高 | D-4 排除 auth 端点；E2E 专门断言错误密码仍停留 `/login` |
| R2 | 强制改密态下 `AppLayout` 仍挂载业务页 → 页面并行发请求全部 403，界面报错噪声 | 中 | 闸门放在 `<Outlet/>` 之前，业务页根本不渲染 |
| R3 | 下拉在强制改密态被整块禁用 → 用户无法登出 / 改密 | 高 | D-7：下拉可用，仅「系统设置」禁用 |
| R4 | 开发态 CORS 与 Vite 端口不一致 → 登录 POST 403 | 高 | D-3；E2E 用真实浏览器经代理验证 |
| R5 | 停用/降级唯一 admin 的按钮判断与后端口径漂移 | 中 | 前端按列表数据禁用 + 后端 409 兜底展示（D-9） |
| R6 | `queryClient.clear()` 把 session 查询也清掉 → 守卫闪烁 | 低 | 先 `setQueryData(['session'], {authenticated:false})` 再清其它 key；E2E 观察无闪烁即可 |
| R7 | 多 agent 同时改 `client/src` 冲突 | 中 | 写作用域互斥：`users-admin` 只碰 §4.1 中 U3 文件 + `enums.js`；其余文件由 Lead 独占 |

---

## 8. Rollback

- U2 是纯前端加层：回滚 = 还原 `client/src` 并撤回 `router.jsx` / `api.js` 改动；
- D-2 / D-3 是服务端**追加字段**与**开发来源扩充**，回滚无数据风险；
- 若 U2 未完成或失败，**不得**把 U1 分支作为发布候选（FS §10 发布约束）。

---

## 9. Decisions Log

见 §4.4 D-1 ~ D-10（均为实施级，不改变 FS 已批准的产品形态）。任何一条若被判定越界，须回 Human 重新裁决。

---

## 10. Implementer 交接说明

- 动手前 `git branch --show-current`（应为 `feature/TASK-058-auth-kernel`）；工作区已有上一轮复核留下的 5 个文档改动，**不得丢弃**。
- 不碰 U1 已交付的 `shared/`、`server/middleware/`、`server/routes/`、测试文件；服务端只允许 §4.2 列的 2 个文件。
- 文案以 §4.4 + FS §13 为准；E2E 断言依赖这些文案，改文案必须同步 §11 并通知 Reviewer。
- 提交前 `npm run build --workspace client` 与 `npm run lint --workspace client` 必须为 0。

## 11. Implementation Record

> 实施者：Lead（U2 地基/登录/账户/守卫/布局/服务端最小补充）+ `users-admin`（U3 系统设置页，task-1，写作用域互斥）+ `ui-verify`（独立 E2E，只写 `client/scripts/e2e-task-058-u2.mjs`）。基线：`feature/TASK-058-auth-kernel` HEAD `68f040c`（工作区含上一轮复核留下的 5 个文档改动，未丢弃）。

### 11.1 交付文件

| 文件 | 说明 |
|---|---|
| `client/src/services/auth.service.js`（新） | 9 个认证/用户端点；与既有 service 一致取内层 `.data` |
| `client/src/services/authSession.js`（新） | 401 / `PASSWORD_CHANGE_REQUIRED` 事件桥（拦截器 → Provider 解耦） |
| `client/src/utils/safeNext.js`（新） | `safeNext` / `buildLoginPath`（拒绝 `//`、`/\`、控制字符、含 `next=`、`/login`） |
| `client/src/components/auth/authContext.js`（新） | `AuthContext` + `useAuth`（与 Provider 分文件，满足 react-refresh） |
| `client/src/components/auth/AuthProvider.jsx`（新） | `['session']` Query、`login/logout/updateSessionUser/refresh`、401 处置与清缓存 |
| `client/src/components/auth/RequireAuth.jsx`（新） | 未登录守卫（`/login?next=…`） |
| `client/src/components/auth/ForcedChangeScreen.jsx`（新） | 「需要修改密码后才能继续」屏 |
| `client/src/components/auth/ForbiddenUsersScreen.jsx`（新） | member 直访 `/account/users` 的 403 屏 |
| `client/src/components/layout/UserMenu.jsx`（新） | 顶栏头像下拉（身份行 + 账户设置 + 系统设置〔admin〕+ 提醒规则 + 退出登录；外部点击/`Esc` 关闭） |
| `client/src/pages/Login.jsx`（新） | 登录页（无 AppLayout；错误文案取后端 message；`safeNext` 回跳） |
| `client/src/pages/Account.jsx`（新） | 身份卡 + 改用户名 + 改密码（强制改密态含「当前密码」按 D-1；改密后其他会话失效提示） |
| `client/src/pages/AccountUsers.jsx`（新，`users-admin`） | 系统设置页（表格/新建/停用启用/重置密码/改角色/唯一启用 admin 禁用态 + 403 屏） |
| `client/src/components/users/CreateUserModal.jsx` / `ResetPasswordModal.jsx`（新，`users-admin`） | 两个弹窗（受控 `role="dialog"`，无新依赖） |
| `client/src/hooks/useUsers.js`（新，`users-admin`） | `['users']` Query + 3 个 mutation（成功失效） |
| `client/src/constants/enums.js`（改） | 追加 `USER_ROLES` / `USER_ROLE_LABELS` |
| `client/src/constants/routes.js`（改） | 追加 `LOGIN` / `ACCOUNT` / `ACCOUNT_USERS` |
| `client/src/router.jsx`（改） | `AuthProvider` 入 Router；`/login` 公开；受保护组 + `/account`、`/account/users` |
| `client/src/services/api.js`（改） | 透传 `error.code`；401 → `notifyUnauthorized`（排除 auth 端点）；403 `PASSWORD_CHANGE_REQUIRED` → 失效 session |
| `client/src/components/layout/AppLayout.jsx`（改） | 假 User 按钮 → `UserMenu`；强制改密闸门包 `<Outlet/>`；强制改密期间停掉未读轮询 |
| `client/src/components/layout/Sidebar.jsx`（改） | 5→4 项（提醒规则入下拉）；删除底部假「退出登录」 |
| `client/src/hooks/useAlerts.js`（改） | `useUnreadAlertCount({ enabled })`（强制改密期间不请求） |
| `server/controllers/auth.controller.js`（改，D-2） | `login` / `session` 的 user 载荷补 `lastLoginAt` |
| `server/app.js` + `server/.env.example`（改，D-3） | 开发默认来源补 Vite 6600（生产行为不变） |
| `client/.env.example` + `client/.env`（改，验收期发现） | `VITE_API_URL` 默认留空（同源 `/api`），写清绝对地址跨源模式的两个前提；配合 axios `withCredentials` |
| `client/scripts/e2e-task-058-u2.mjs`（新，`ui-verify`） | 真实浏览器验收脚本（独立编写，只观察不断言实现） |

### 11.2 与计划的差异

| # | 差异 | 原因 |
|---|---|---|
| 1 | 新增 `components/auth/authContext.js` 拆分 `useAuth` | Provider 文件同时导出 hook 会触发 `react-refresh/only-export-components` 警告；拆分后 `npx eslint src` 0 warning |
| 2 | `useUsers({ enabled })` + `useUnreadAlertCount({ enabled })` | 非 admin / 强制改密期间不做必然 403 的请求（减少噪声，不改变语义） |
| 3 | U3 停用 title 在「唯一启用 admin 且是自己」时合并两条原因 | 两条约束同时成立，合并展示避免漏提示（D-9 不静默） |
| 4 | U3 未加 `window.confirm` | FS/原型未要求二次确认；且 E2E 自动 dismiss 会导致操作被取消（计划 D-10 仅规定「如需确认」） |
| 5 | U3「启用」按钮始终可点 | 原型把停用账号的「启用」也禁用，与 U3-R3「停用/启用切换」冲突，按 FS 修正 |
| 6 | `client/.env*` 默认值改为 `VITE_API_URL=`（同源 /api），axios 增 `withCredentials: true` | 原 `.env/.env.example` 默认写死 `http://localhost:8080/api`（跨源）；U1 认证上线后跨源请求若不带 credentials，浏览器不会保存/发送会话 cookie → 登录 200 后下一次请求 401。属认证暴露的配置债（Reviewer 验收时发现），同源 proxy 为推荐配置 |

### 11.3 验证证据（Lead 侧，2026-10-27）

- `npm run build --workspace client` → **exit 0 / 2423 modules**（TASK-054 基线 2408，+15 为 U2/U3 新增文件）。
- `npx eslint src`（client/src 全量）→ **0 error / 0 warning**。
- `npm run lint --workspace client` 仍有 **2 个既有 error**（`scripts/verify-price-display.cjs` 的 `import/no-dynamic-require` 规则缺失、`vite.config.js` 的 `process` no-undef），均非本计划文件、改动前即存在。
- `npm run test:server` → **211 pass / 0 fail**；`npm run test:worker` → **77 pass / 0 fail**（D-2/D-3 无回归）。
- 真实浏览器 E2E（`client/scripts/e2e-task-058-u2.mjs`，独立 Reviewer 执行）→ 见 §12；**本节不给结论**。

## 12. Review Record

> 独立 Reviewer：`ui-verify`（2026-10-27）。执行方式说明：Reviewer 子代理所在沙箱禁止启动 Chrome（`chromium.launch → spawn EPERM`；手工 CDP 启动报 `FATAL:mojo ... Access denied`），因此按 Reviewer 要求**由 Lead 会话原样执行其脚本**（脚本 hash 前后一致、未改一行），结果由 Reviewer 独立判读。脚本、期望值（FS §7 / 任务卡 §3 / 本计划 §1）、断言均由 Reviewer 独立编写，未采信实现方自述。

### 12.1 三轮验收演进（每轮失败均先归因为脚本 bug / 时序，修复未放宽任何 AC）

| 轮 | 脚本 SHA256（前 8 位） | 结果 | 失败归因 |
|---|---|---|---|
| 1 | `13BBAB04…` | **19/28**（EXIT=1） | 脚本 bug 2 处：`page.evaluate` 内引用 Node 侧 `squash`（→ 建号步骤崩溃，级联 6 条）；`rowByUsername` 用 `split(' ')[0]` 匹配，而实现自己行首格 `innerText` 为 `admin你`（无空格） |
| 2 | `40BB2E61…` | **25/28**（EXIT=1） | 脚本时序：`gotoPath` 用 `domcontentloaded` 后立刻 `findButton/openUserMenu`，React 尚未 mount → member 三段（AC9b/9c/10）失败；实现侧经定向探针证明正常 |
| 3 | `CDE7AABA…` | **28/28 PASS（EXIT=0）** | 无失败；Reviewer 新增 `waitForReactMount` + 按钮/触发器/表头 deadline 轮询后全绿 |

### 12.2 最终执行证据（第 3 轮）

- 命令：`node client/scripts/e2e-task-058-u2.mjs`；脚本 SHA256 `CDE7AABA7401085E26B9DF9349565EA39FD1211A34F6484D5E8496CA2F440626`（83738 B，`node --check` OK）。
- 环境：外部 vite dev `6600`（`VITE_API_URL=''`，同源 `/api` + proxy）+ 脚本自起 server `8080`（临时库 `portomind_u2_e2e`，护栏校验库名；远端 Mongo 192.168.2.140）+ 本机 Chrome；4 个浏览器 context。
- 结果：**`===== TASK-058 U2/U3 E2E：28/28 PASS =====`，EXIT=0**；`pageerror=0`，`console.error` 3 条均为 401/403 预期网络日志。
- 覆盖清单：ENV、AC1a/AC1b、AC2、AC3、AC4a–d、AC5a–c、AC6、AC7、AC8、AC9a–c、AC10、AC11a/AC11b、AC12、AC13、AC14、AC15、D8、DB 直查、运行时无异常（详见 Reviewer 报告与 `%TEMP%\portomind-e2e-058-run3.log`）。
- 清理：脚本 finally 已 kill 8080 + drop 临时库（Reviewer 独立连接确认库不存在）；6600 由 Lead 停止；未触碰 `portomind_dev`；Reviewer 未修改任何实现源码。

### 12.3 代码复核分级

**PASS（无 BLOCKER / MAJOR）**。逐块确认：路由与守卫（`/login` 公开 + `RequireAuth` + 强制改密闸门在 `<Outlet/>` 之前）；`AuthProvider` 单一 `['session']` 数据源 + 401/403 桥接；`safeNext` 开放重定向防护；登录页（不泄露账号是否存在/不提示默认账号）；账户页（D-1 强制态含当前密码、改密后其他会话失效提示）；`UserMenu`（`D11`/`D12`/`D13` 项序与数量、身份行同行弱化、`D-7` 禁用 + title、`Esc`/外部关闭、aria 属性）；`Sidebar` 5→4 且删除假「退出登录」；U3 表格/新建/停用启用/重置（`D9` 自己行改「改密码」）/改角色/唯一启用 admin 禁用 + 原因/403 屏/待改密 chip；服务端仅 `lastLoginAt`（D-2）与 CORS 6600（D-3），无越界；`withCredentials` + `.env` 同源默认修复到位。

### 12.4 MINOR（记录，不阻塞交付）

| # | 内容 | 处置 |
|---|---|---|
| 1 | 强制改密成功后固定 `navigate('/')`，登录时携带的 `next` 在强制路径下不再回收 | 符合 §4.3 明示行为，仅记录 |
| 2 | login 响应 `lastLoginAt: new Date()` 与库内 `markLogin` 落库值有毫秒级差异 | 账户页/会话以 `/api/auth/session` 为准，无功能影响 |
| 3 | `AccountUsers` 成功/错误 banner 不自动消失（下次操作覆盖） | 可用性细节，后续可并入体验优化 |
| 4 | 强制改密态顶栏铃铛仍可点击（落到强制屏，无越权） | 非 AC 要求；可选择在后续禁用视觉入口 |
| 5 | `server/.env`（未入库）需开发者本地同步 `CORS_ORIGINS` 含 6600 | 本机已同步；`.env.example` 已修 |
| 6 | 真实浏览器仅 Chrome（本机唯一），未跑 Firefox/WebKit；未覆盖多实例/反代部署 | 记录为已知限制 |

### 12.5 独立性说明

三轮 FAIL 全部先归因为 Reviewer 脚本 bug / 时序问题并修复脚本，**未放宽任何 AC、未修改实现源码**；实现缺陷由 Lead 修复后重跑。Reviewer 独立确认 8080/6600 已停、临时库已 drop、`git status` 中其唯一新增为 E2E 脚本。



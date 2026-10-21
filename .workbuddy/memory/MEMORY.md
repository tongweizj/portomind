# PortoMind 长期备忘（精简版）

## 结构与纪律

- 唯一索引 `docs/readme.md`；单一归属：每主题只详述一处。手册四份 `manual/{CLIENT,SERVER,CRON_WORKER,DEPLOYMENT}.md`。功能文档 = `product/PRODUCT_LINES.md` + `product/lines/PL-0~PL-6.md`（跨线参考集中在 PL-0）。
- 不写会漂移的硬数字（测试数/覆盖率），用「以实际输出为准」；改文档前先与源码对账。
- 流程硬纪律：业务代码改动必须先有 `Approved` ExecPlan；需求批准 ≠ 方案批准；实现与审查不得同角色同轮；build/lint 通过不能作为交付依据；验证期望值不得从实现反推；数字自评须实测（`grep -c`）。
- 结案三处同步：文件位置（`git mv` 到 `complete/`）、文件内 Status（任务卡 + ExecPlan 均改并补 Completion Record）、索引与全部交叉引用。TASK-043/044/049 均因此踩坑。
- **分支模型（2026-10-19 发现，重要）**：项目用 `feature/TASK-xxx` 分支累积，分支是**堆叠**的（`feature/TASK-049` 建在 `feature/TASK-044` 之上），`main` 长期落后（停在 `891d0f7` = TASK-043）。截至 2026-10-20：`feature/TASK-048-family-dividend-label` = 044+049+**048（未提交）**，是当前最全的分支；`feature/TASK-050` 是从 `main` 拉出的**空基线**，开工前必须 rebase 到 048 之上。**做任何任务前先 `git branch --show-current` + `git log --graph --all`**：旧任务的文件/代码可能只存在于某分支，切错分支会看到「文件消失」。结案归档必须在**该任务自己的分支**上做。
- 审查方法（TASK-044/049 验证有效）：① 期望值取自接口而非实现；② 断言要能失败（负向对照 / 脚本内置「自检项」）；③ **「X 失败不得拖垮 Y」这类约束用 `page.route(..., r => r.abort())` 实测**，别只读代码；④ 优先问「实现者没验什么」，而不是「验了多少条」。

## 架构

- 三进程 + 一代码库：`client`(Vite SPA) / `server`(Express，不注册 cron) / `cron-worker`(唯一调度所有者) + `shared/`(全部业务内核，唯一实现)。npm workspaces，根目录一次 `npm ci`。
- 跨包引用必须 `require('@portomind/shared/...')`，禁止 `../models` 式相对引用。
- 5 类 cron 全在 worker（价格 0 3 / 完整性 30 3 / 提醒 0 4 / 汇率 30 9 / 再平衡 0 0）。AUTO 再平衡为单日分发，`SCHEDULE_DUE_RULES` 硬编码——新增频率必须补规则，否则静默不触发。
- CORS 当前 `origin: true` 全开，`CORS_ORIGINS` 未被读取；无认证 → API 不可暴露公网。
- `ASSET_*` 枚举两份复制（`shared/constants/asset.constants.js` 与 `client/src/constants/enums.js`），改动双向同步。
- 硬约束：AUTO 再平衡只生成建议+提醒，绝不自动交易。缺价时估值字段为 `null`，不按零价误算。

## 关键实现事实

- 行情：`Price` 无 `change/prevClose`（涨跌幅客户端派生）；`getTodayPrices` 只返回当日，不能判缺口；价格 cron 只同步 `active` 资产。
- 缺口判定 = 相对基准法（按 market 分组取最新日期，仅判个别标的落后 ≥3 工作日）：`client/src/utils/priceDisplay.js`，验证 `node client/scripts/verify-price-display.cjs`。盲点：全市场同时停更不告警。
- 家庭汇总：`shared/services/familySummary.service.js` 一次返回 totalCny/buckets/portfolioContributions/recentTransactions/recentRebalanceRecords；**排除 archived**（`/portfolios` 有显示归档开关，口径须显式标注）。
- 前端孤儿页：`Portfolio/TargetAllocation.jsx`、`Basic.jsx` 零引用。
- **首页已改「家庭总览」**（TASK-049，2026-10-19 评审通过）：`/` 顶部 `components/Household/TotalAssetsCard.jsx`（内部 `useFamilySummary()`，错误态自吞不拖垮提醒列表）+ `h2 待处理提醒`；侧栏标签 `Dashboard`（去掉「· 提醒」）。`/family` 仍在（TASK-050 才删），过渡态两页都显示总资产，**不算缺陷**。
- `formatCny` 单一源头 = `client/src/utils/priceDisplay.js`；`pages/Family.jsx:20-23` 仍有本地副本（R7 禁改，随 TASK-050 删页去重）。
- **已裁决（TASK-049，2026-10-19，均「不改」）**：首屏总资产卡沿用 `blue-600→indigo-600`（**不**改成 token 主色 `#635BFF`，首屏「紫导航+蓝卡」两套主色为既定状态）；首页 `h1`「家庭总览」保持 `Bell` 图标（**不**换 `LayoutDashboard`）。后续任务不要顺手改，要改须另立卡。
- **交易类型中文标签单一来源**（TASK-048，2026-10-20 评审通过并结案）= `client/src/constants/enums.js` 的 `TRANSACTION_ACTION_LABELS`（由 `TRANSACTION_ACTIONS` 派生、冻结）。**禁止**再就地 `Object.fromEntries`；检测式 `grep -rn "Object.fromEntries(TRANSACTION_ACTIONS\b" client/src` 期望恰好 1 行。**残留**：`AddTransaction.jsx:130` / `EditTransaction.jsx:139` 的 `<option>` 仍硬编码中文（Human 裁定不改）→ 新增第 5 种类型要改 3 处。
- 分红在 Family 页用 token 浅紫 `#EEEDFF`/#635BFF 底字，买红 `bg-red-50`、卖绿 `bg-emerald-50`、未知/空退灰；不要再回到「非 buy 即绿」的二元染色。

## 审查方法（可复用）

- **不要往库里插数据来验展示层**：`page.route` 拦截接口 + `route.fulfill` 喂构造数据，一次覆盖全部分支，且零写入。TASK-048 用此法覆盖 buy/sell/两种分红/未知枚举/null。
- **颜色/样式断言不要硬编码色值串**：Tailwind v4 输出 `oklch()` 而非 `rgb()`，硬编码会把工具差异误报成产品缺陷。做法：页面内注入同 class 的参照片，取 `getComputedStyle` 实际值作基准。
- 「X 失败不得拖垮 Y」用 `page.route(..., r => r.abort())` 实测（TASK-049 验 R-4）。
- 「页面不含 undefined」这类断言几乎恒真（React 渲染 `{undefined}` 为空串）——验收要写「文本非空且 ∈ 允许值集合」。

## 未修复缺陷 / 欠账

- **CSV 幂等失效**（TASK-046，P0）：`transaction.service.js:233` 的 `select()` 漏 `portfolioId` → 键恒 `undefined` → `skipped` 恒 0，二次导入整份重复写入。测试 mock 无视 `select()` 造成假阳性（12/12 绿）。修复须同时修 mock，并加「两连导入」用例先在旧实现上验红。
- **归属不可变已裁定**（TASK-047 方案②：后端拒绝改写）。`EditTransaction.jsx:82` 恒带 `portfolioId` → 守卫判「值是否变化」而非「字段是否存在」；不可从 `WRITABLE_FIELDS` 删该字段（create 共用）。
- `FS-asset-price-consolidation.md` 的 R6 与验收标准仍写旧口径（≥3 天标红），与实现不一致 → 待 PM/Human 改措辞。
- 文档缺口：`docs/agents/REVIEWER.md` 仍空；`docs/architecture/ARCHITECTURE.md` 是未填充英文模板（含本项目不存在的 PostgreSQL/Prisma 示例）；`EXECUTION_PLANS.md §3` 写 `completed/` 实际是 `complete/`；`docs/readme.md` 有两条死链（`product/ROADMAP.md`、`product/specs/authentication.md`）。
- **`readme.md` 活跃任务行反复失真**（TASK-049、TASK-048 连续两次）：状态词写进 readme 后没人同步，与 `TASKS.md` 矛盾。**建议机制修法**：readme 活跃任务行只留链接 + 负责人，**不写状态词**，状态唯一来源 `TASKS.md`。待 Human 裁决后统一改（TASK-048 结案时已按事实改正该行，但机制仍未采纳）。
- **任务卡症状描述未与实现对账**（TASK-048，2026-10-20 已结案但仍未改写）：卡 §1 写「页面渲染出 `undefined` 文本」，实为**空白 badge**（React 渲染 `{undefined}` 为空）→ 由此推出的 AC「任何类型均不出现 undefined」是恒真断言。属 Human Intent 文档，`TASK-048` 归档时登记为遗留 **F-6/R-2**，待裁决改写。
- **`docs/exec-plans/` 新文件默认 untracked**：TASK-048 的 ExecPlan 从未进版本库，归档时 `git mv` 会失败，且 `git commit -am` 会**静默丢掉**它（TASK-049 结案时也提过同一点 N-4）。归档 ExecPlan 一律先确认 `git ls-files` 有它，否则用 `mv` 后再 `git add`。

## 本机环境

- 真实库 `portomind` @ `192.168.2.140:27017`（**可连**，73ms）；`portomind_dev` 是开发库，`server/.env` 的 MONGO_URI 已直接指向它。两库同实例、同凭据，只差库名。
- **开发验收用真实数据**：`npm run sync:db`（`scripts/sync-db.cjs`）整库镜像真实库 → 开发库，引擎是官方 `mongodump`/`mongorestore`（`--nsFrom/--nsTo` 改名 + `--drop`），脚本只补**安全守卫**（目标库名必须 `_dev/_test/_e2e`，源=目标拒绝）与**事后校验**（集合清单 + 条数 + 索引 + `_id` 哈希）。文档见 `manual/DEPLOYMENT.md §5.5`。
- MongoDB Database Tools 已用 scoop 装（100.14.0，服务端 8.0.32）。**scoop 清单未声明 bin → 没有 shim**，`mongodump` 不在 PATH，实际路径 `C:/Users/maxto/scoop/apps/mongodb-database-tools/current/bin/`。**参数必须写 `--opt=value`**，`--opt value` 会被当位置参数报「provide only one MongoDB connection string」；`--nsFrom/--nsTo` 必须配 `--nsInclude` 否则「0 条还原但退出码 0」；还原统计写在 **stderr**。
- `client/.env` 有 `VITE_API_URL=http://localhost:8080/api`。curl 必须 `--noproxy '*'`（环境带 HTTP_PROXY，否则假 502）；vite 仅监听 `[::1]:5173`（用 localhost）；改 vite 配置需重启 dev server。
- **客户端 eslint 必须** `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"`（二进制提升到根 `node_modules/.bin`；`npx eslint` 会拉 v10 崩溃）。
- E2E：复制真实库到副本 + `playwright-core` 驱动本机 Chrome，脚本示例 `client/scripts/e2e-task-044.mjs`。

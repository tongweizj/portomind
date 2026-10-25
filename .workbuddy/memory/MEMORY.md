# PortoMind 长期备忘（精简版）

## 结构与纪律

- 唯一索引 `docs/readme.md`；单一归属：每主题只详述一处。手册四份 `manual/{CLIENT,SERVER,CRON_WORKER,DEPLOYMENT}.md`。功能文档 = `product/PRODUCT_LINES.md` + `product/lines/PL-0~PL-6.md`（跨线参考集中在 PL-0）。
- 不写会漂移的硬数字（测试数/覆盖率），用「以实际输出为准」；改文档前先与源码对账。
- 流程硬纪律：业务代码改动必须先有 `Approved` ExecPlan；需求批准 ≠ 方案批准；实现与审查不得同角色同轮；build/lint 通过不能作为交付依据；验证期望值不得从实现反推；数字自评须实测（`grep -c`）。
- 结案三处同步：文件位置（`git mv` 到 `complete/`）、文件内 Status（任务卡 + ExecPlan 均改并补 Completion Record）、索引与全部交叉引用。TASK-043/044/049 均因此踩坑。
- **分支模型（2026-10-19 发现，重要）**：项目用 `feature/TASK-xxx` 分支累积，分支是**堆叠**的（`feature/TASK-049` 建在 `feature/TASK-044` 之上），`main` 长期落后（停在 `891d0f7` = TASK-043）。截至 2026-10-21：`TASK-048` 已由 Human 提交（`fb5fdaf`/`c463c85`）；`feature/TASK-050` 已 `git rebase` 到 `c463c85`，**当前最全分支 = `feature/TASK-050`（044+049+048，工作区干净）**。**判断能否安全重建分支用 `git log main..<branch>` 是否为空**（空 = 无自有提交，rebase 零风险），别看 sha 是否相同。**做任何任务前先 `git branch --show-current` + `git log --graph --all`**：旧任务的文件/代码可能只存在于某分支，切错分支会看到「文件消失」。结案归档必须在**该任务自己的分支**上做。
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
- 家庭汇总：`shared/services/familySummary.service.js` 一次返回 totalCny/buckets/portfolioContributions/recentTransactions/recentRebalanceRecords；**排除 archived**（`/portfolios` 有显示归档开关，口径须显式标注）。**`RECENT_LIMIT = 10`——交易与再平衡都返回 10 条**，前端要 5 条必须自己 `slice`（改服务端属越界）。
- 前端孤儿页：`Portfolio/TargetAllocation.jsx`、`Basic.jsx` 零引用。
- **`/family` 是「三处就地复制」的宿主**（TASK-050 正在拆）：① `formatCny` 本地副本（`priceDisplay.js:199` 已有唯一实现，随删页消失）；② 币种符号两套（家庭 `US$`/`CA$` vs 行情 `$`/`C$`，Human 2026-10-21 裁决**沿用 `US$`/`CA$`**，在 `CURRENCY_META` 加 `householdSymbol` 字段而非改 `symbol`）；③ 再平衡状态中文映射只有这页有，而 `Portfolio/RebalanceHistory.jsx:94` 直出英文 `EXECUTED`（同口径第二处不同 → TASK-050 OD-2 决定顺带修）。另：`Family.jsx` 因 TASK-048 改动已整体行号漂移（现 300 行），FS/AC 里的旧行号不可直接当导航用。
- `pages/Portfolio/List.jsx` 的 `isLoading`/`isError` 是**整页早退**（`:13-14`）——往该页加独立数据源区块时必须把状态下沉到区块级，否则一个接口慢会让整页空白。
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
- **断言失败时先怀疑选择器，再怀疑产品**：先用一个「已知必须存在」的样本（如 `h1`）自检选择器。TASK-050 我第一版脚本 3 个 FAIL 全是自己写错——`PortfolioCard` 根元素是 `div[role="button"][tabindex="0"]`（`onClick`）而非 `<a>`，差点把「卡片没渲染」误报成缺陷。
- **「恒显示」类要求必须构造空态**：正常数据下恒显示与条件显示无法区分。TASK-050 的 AC14（口径说明恒显示）就是仅当 `portfolioContributions: []` 时才暴露——组件在空态 `return <EmptyState />` 把说明一起吞了。凡 AC 写「恒 / 始终 / 任何情况下」，就要喂空数组、空字符串、null 各跑一遍。**返修复验再加一次「形态②」负向对照**：只把说明移回 `{length > 0 && …}` 而保留标题，若断言仍 PASS 说明它锚错了目标（TASK-050 R-1 用此法证明断言精确锚定「说明」）。`ContributionBar` 已是单出口结构（`SCOPE_NOTE` 在条件分支之外），**不要写回早退**。
- **别 mock 掉你怀疑的那一段**：TASK-051 的汇率方向错了一整年没被发现，正因为 `family.summary.test.js` 手填 `rateToCny: 7.2`（正确方向）绕过采集端 —— 测试用的是「理想输入」，生产用的是「采集输出」，中间那段没人测。**排查「数据全绿但页面数字不对」时，先找测试里被 mock / 手填的那一层**。

## 未修复缺陷 / 欠账

- **汇率方向反了**（TASK-051，High，2026-10-21 立项）：`fxRate.service.fetchFromProvider` 取 `open.er-api.com/v6/latest/CNY`（返回 `1 CNY = X 外币`）却直接当 `rateToCny`（语义 `1 外币 = X 人民币`）入库，`familySummary` 再 `amount * rate` → **双向失真**：USD/CAD 被严重低估（存值仅为正确值 2.23% / 4.42%），HKD 反被**高估 37.6%**。实测同批持仓 `totalCny` 3,151 vs 汇率取倒数后 76,128（**24 倍**）。`fxRate.service` **零单测**，`family.summary.test.js:132,160` 手填 `rateToCny: 7.2/5.3/0.92`（正确方向）绕过采集端故全绿。手动录入 `7.2` 能修但次日 09:30 cron 按新 `date` 覆盖回错值。**待 Human 裁决 OQ1（修采集端存倒数 / 改折算端 / 双字段）与 OQ2（历史数据处置）**。详见 `docs/tasks/active/TASK-051-fx-rate-direction.md`。
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

## 家庭视图搬迁后的现状（TASK-049 + TASK-050，2026-10-21 完成实施）

- `/family` **已下线**（页面/路由/侧栏项全删），书签由 `*` 通配落到 `/portfolios`，**无显式重定向**。侧栏顶层 **5 项**：Dashboard / 组合管理 / 今日行情 / 提醒规则 / 日志。
- 总资产卡在 `/`（`components/Household/TotalAssetsCard.jsx`，自取数据）；其余五块在 `/portfolios`：`CurrencyBuckets` / `ContributionBar`（堆叠条+图例）/ `RecentTransactions`（`slice(0,5)`）/ `RecentRebalance`（10 条）/ `FxPanel`（默认收起，展开才请求 `fx-rates`）。五者均为**纯 props 组件**，数据由 `pages/Portfolio/List.jsx` 取一次——**不要改回组件自取**，否则会出现 5 个加载块/错误块。
- `List.jsx` 的 loading/error 已**下沉到卡片区**（原 `:13-14` 整页早退已删）：家庭汇总失败只显示 1 个 ErrorState，卡片照常渲染。
- 口径单一来源（**新增两条**）：`enums.js` 的 `CURRENCY_LABELS`（币种中文，派生自 `ASSET_CURRENCIES`）、`REBALANCE_STATUS_LABELS`（再平衡状态中文，组合详情历史表 + 首页最近再平衡共用）；`priceDisplay.js` 的 `formatMoney(value, currency)`（外币金额，`householdSymbol` = `US$`/`CA$`）。`fmtPrice` 的 `$`/`C$` **不要改**（行情页单价口径）。
- **已知未修 P0 级疑点（F-1）→ 已立项 `TASK-051`（2026-10-21，High）**：家庭折算汇率方向反了 —— 采集端存的是「1 CNY = X 外币」却当 `rateToCny` 用乘法折算 → USD/CAD 严重低估、HKD 反被高估 37.6%，实测 `totalCny` 3,151 vs 修正后 76,128（**24 倍**）。`fxRate.service` 零单测，既有测试手填 `7.2`（正确方向）绕过采集端故全绿。**别被"测试全绿"骗过：先找测试里被 mock / 手填的那一层**。待 Human 裁决 OQ1/OQ2。
- **AC14 / OD-3 空态陷阱（TASK-050 R-1，2026-10-21 已修复并复验通过）**：原 `ContributionBar` 用 `if (list.length === 0) return <EmptyState />` 整块早退，把口径说明 `SCOPE_NOTE` 与 `h2` 一起吞掉；现为**单出口结构**（`h2` 与 `SCOPE_NOTE` 在条件分支外，空态只替换中间内容），空态下标题/占位/说明三者齐在。复验：Reviewer 自写 25 断言 25 PASS + 两轮注入负向对照（整块早退 16/25、精确 R-1 形态 20/25）。**遗留观测**：`list.length > 0` 但 `ratio` 全 `null` 时轨道为 0 段空白灰条（修复前即如此，非回归）。

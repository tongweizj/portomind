# PortoMind 长期备忘（压缩版 2026-10-26 夜）

> 详细过程看 `.workbuddy/memory/YYYY-MM-DD.md` 日志；本文件只留跨会话仍需用的结论。

## 纪律与流程
- 唯一索引 `docs/readme.md`；**单一归属**：每主题只详述一处，别造第二份拷贝。手册 `manual/{CLIENT,SERVER,DEPLOYMENT}.md` + cron-worker 四件套（`CRON_WORKER.md` 总览 / `_OPS` 运维 / `_PRODUCT` 产品介绍 / `dev/CRON_WORKER_DEV.md` 开发）。功能文档 = `product/PRODUCT_LINES.md` + `product/lines/PL-0~PL-6.md`。
- 改文档前先与源码对账；不写会漂移的硬数字（行数/测试数/导出数）。
- 业务代码改动必须先有 `Approved` ExecPlan；需求批准 ≠ 方案批准；实现与审查不同角色不同轮；build/lint 通过不能当交付依据；验证期望值不得从实现反推。
- 结案三处同步：`git mv` 到 `complete/`、文件内 Status + Completion Record、索引与交叉引用。
- 任务编号**立项才占号**（写进 `docs/tasks/active/` 才算），FS 里不预写 `TASK-0xx`。
- `docs/exec-plans/` 新文件默认 untracked，归档前先 `git ls-files` 确认，否则 `git commit -am` 会静默丢。
- 动手前先 `git branch --show-current` + `git log --oneline -3 main`；`main` 即最全基线，新任务从 `main` 拉，别在旧 feature 分支上看到「文件消失」就以为被回滚。

## 架构（硬事实）
- 三进程一库：`client`(Vite SPA) / `server`(Express，不注册 cron、**也不暴露调度/TaskRun 接口**) / `cron-worker`(唯一调度) + `shared/`(业务内核唯一实现)。npm workspaces。
- 跨包引用必须 `require('@portomind/shared/...')`；`shared/` 内 0 处反向 require 进程、0 处 `process.exit`。
- 5 类 cron 全在 worker（价格 0 3 / 完整性 30 3 / 提醒 0 4 / 汇率 30 9 / 再平衡 0 0）。AUTO 再平衡单日分发，`SCHEDULE_DUE_RULES` 硬编码——新增频率必须补规则，否则静默永不触发。
- **安全边界**（唯一归属 `DEPLOYMENT §9`）：CORS `origin:true` 全开、**`CORS_ORIGINS` 读了不生效**（`app.js:21-24` 构造了 `allowedOrigins`，但用它的白名单 `cors()` 整段注释，`:34` 走 `origin:true`——**别说成"未读取"**）、**当前无认证无多用户**、侧栏还有**无 handler 的「退出登录」假按钮** → API 不可暴露公网。
- **账号与访问控制已裁决（2026-10-26，`FS-authentication` + `ADR-001` + `TASK-058`）**：单租户多账号（**共享同一份家庭数据，不加 `tenantId`/`ownerId`**，业务模型零改动）× `admin`/`member` 两角色（member 业务全读写、仅不能管用户）× **admin 建号、无自助注册** × 用户**只停用不删除** × 首登强制改密 × 会话存 **Mongo**（`sessions` 为全仓首个 TTL）。**多用户 ≠ 多租户**，注册属 Non-goal。⚠️ 实施铁律：**U1（后端闸门）与 U2（前端登录页）必须同批发布**（U1 单独上线=全站 401）；**7 个自起 HTTP 的集成测试会全失效**（显式列在 ExecPlan W8），只 stub 会话查询、**禁止** `AUTH_DISABLED_FOR_TESTS` 绕过闸门。**U1 的 ExecPlan 已于 2026-10-26 `Approved`**（全仓首份），§9 的实施级裁决编号为 **`ED-1~ED-5`**（区别于 FS §12 的 `D1–D7` 产品裁决）：bcryptjs+cookie-parser / 密码 8–72 无复杂度且超长显式拒绝 / 会话绝对 7 天不滑动 / 用户名强制小写且登录前归一化 / 只 stub 会话查询→**E2E 真实路径升为交付门槛**（未做不得声明 U1 完成）。
- 持久化：Mongo + Mongoose 6；**无事务**（0 处 `startSession`/`withTransaction`）· **无 TTL**（taskruns/alertevents 只增不减）· **无迁移框架/migrations 目录**。
- `server/` 无 `express.static`（生产静态由 Nginx）；中间件在 `server/middleware/`（单数）；9 个 controller 中 3 个直接 require `shared/models/*` 自行查询（分层未完全下沉，新功能走 `shared/service`）。
- 测试只在 `server/test/` 与 `cron-worker/test/`；**`shared/` 与 `client/` 无 test 脚本** → 共享内核无独立单测。
- 外部数据源（唯一判定处 `priceFetch.service.js`）：Yahoo（美股/加股 `.TO`/港股 `.HK`，`query1`+`query2`）· 东方财富（A 股场内，`push2`+`push2delay` 主备；`push2his` 仅 K 线）· 天天基金（`CN-FUND`，真实 API `api.fund.eastmoney.com/f10/lsjz`，`fund.eastmoney.com` 只是 Referer）· er-api（汇率）。容错统一 `withMarketDataTimeout` + `fetchWithRetry`（3 次 + 指数退避 + 抖动）。
- `ASSET_*` 枚举两份复制（`shared/constants/asset.constants.js` / `client/src/constants/enums.js`），双向同步。
- 硬约束：AUTO 再平衡只生成建议+提醒，绝不自动交易；缺价时估值字段 `null`，不按零价误算；跨币种只在家庭层折算。

## 关键实现事实（易踩）
- **TaskRun 契约残缺**（详见 `dev/DATA_MODEL.md §5`）：无 `result` 字段（strict 静默丢弃）；`normalizeCounts()` 白名单只留 total/success/failure/failures；status 无 `SKIPPED`；再平衡无父级 taskrun（只有逐组合 `rebalance-suggestions:<pid>`，未到期=零记录）。
  - ⚠️ `SKIPPED` 落库与唯一索引 `(taskName,runKey) unique`（真实存在于库）冲突：`DUPLICATE_RUN_KEY` 成因就是 key 已存在→必撞 11000；`ALREADY_RUNNING` 同 key upsert 会把正在跑的记录改成 SKIPPED。方案须 4 选 1，**未裁不得开工**。
  - 汇率「各币种成功标志」信息量≈0（`fetchFromProvider` 全或无）；要暴露方向错误，`result` 必须记**实际 `rateToCny` 数值**。
- **任务输出真实字段名**（FS 常写错）：完整性 = `{totalCount, checkedCount, skippedCount, successCount, failureCount, assets[], totals:{expectedCount,actualCount,missingCount}}`（无 `ok/gap`；逐资产 `status='GAP'|'SKIPPED_NO_LAUNCH_DATE'`）；提醒 = `{evaluated, created, archived, failed}`（`created` 才是命中数）；汇率 = `{fxCount}`。落库 taskName = `daily-price-sync` / `price-integrity-check` / `alert-evaluate` / `fx-rate-sync` / `rebalance-suggestions:<pid>`；`price-sync`、`health-check` 只是日志 scope 不落库。
- **`successCount` 语义**：在 `persistPrice()` 后计数 → **任务全绿 ≠ 有新数据**；完整性检查里缺口资产既不计成功也不计失败 → 全组合有缺口仍 SUCCEEDED、CLI 退出码 0。主因是缺 `newCount`/`duplicateCount`/`dataDate`。
- **任务输出的可见性缺口**：完整性检查的截断（`INTEGRITY_REPAIR_TRUNCATED`）与延迟回补（`..._DEFERRED`）**只写 taskLogger**，不进 `TaskRun`/`AlertEvent` → 日志层有痕迹、界面层不可见。`AlertRule.ruleType` 8 种全是价格/估值类，「数据陈旧」「任务连续失败」无模型承载。
- 前端**无「再平衡提醒详情页」**：Dashboard `EventCard` 落 `/portfolios/view/:id/rebalance`，`Rebalance.jsx` 子 Tab 是 `useState` 不读 URL → 永远是「最新建议」。`alertCenter.notify` 已写 `snapshot.recordId`，前端零引用（缺 `?record=` 锚点，不缺页面）。
- `Price` 无 `change/prevClose`（涨跌幅客户端派生）；`getTodayPrices` 只返回当日；价格 cron 只同步 `active` 资产；唯一键 `(symbol,timestamp)` → 同一交易日抓两次会落两条。
- 缺口判定 = 相对基准法（按 market 分组取最新日期，只判个别标的落后 ≥3 工作日）：`client/src/utils/priceDisplay.js`，验证 `node client/scripts/verify-price-display.cjs`。盲点：全市场同时停更不告警。
- 家庭汇总 `familySummary.service.js` 一次返回 totalCny/buckets/portfolioContributions/recentTransactions/recentRebalanceRecords；排除 archived；`RECENT_LIMIT=10`（前端要 5 条自己 slice）。
- 组合详情 `Detail.jsx` TABS = positions / position-history / rebalance / transactions（**无「概览」**）；`ROUTES.PORTFOLIO_VIEW` 指 `/view/:id/basic`（死别名，靠二次 redirect）。**前端已知偏差与零引用文件清单见 `dev/CLIENT_DEV.md §2/§8`，别在记忆里重复维护。**
- **两处 `needsRebalance` 同名不同义（勿合）**：`thresholdChecker.checkThresholds` 含 `timeInterval`；`summary.js` 的 `drift.needsRebalance` 只含绝对/相对偏离（`DRIFT_THRESHOLDS` 过滤）。`buildPortfolioSummary` 入参已有 `lastExecutedAt` 但未回传。
- `actualRatios` 只返回 `{symbol,currency,ratio}`（不含 target）→ 目标 vs 实际须走 `POST /:pid/rebalance/check`（含每 symbol 的 details），禁止前端自算阈值。
- `/family` 已下线（TASK-050），侧栏 5 项 = Dashboard / 组合管理 / 今日行情 / 提醒规则 / 日志；书签由 `*` 通配落 `/portfolios`。总资产卡在 `/`（`Household/TotalAssetsCard.jsx` 自取）；`CurrencyBuckets`/`ContributionBar`/`RecentTransactions`/`RecentRebalance`/`FxPanel` 在 `/portfolios` 且是**纯 props 组件**，数据由 `List.jsx` 取一次——不要改回自取。
- 口径单一来源：`enums.js` 的 `TRANSACTION_ACTION_LABELS`（冻结，grep 期望恰 1 行；`AddTransaction:130`/`EditTransaction:139` 硬编码 option 经 Human 裁定不改）、`CURRENCY_LABELS`、`REBALANCE_STATUS_LABELS`；`priceDisplay.js` 的 `formatCny`/`formatMoney`。`fmtPrice` 的 `$`/`C$` 不改。涨红跌绿别「修正」。
- 已裁决不改（TASK-049）：首屏总资产卡不用 token 主色；首页 h1 保持 `Bell` 图标。分红配色 token 浅紫 `#EEEDFF`/`#635BFF`，买 `bg-red-50`、卖 `bg-emerald-50`。

## 生产实测确认的缺陷
- **采集滞后一天且无回补**（High）：price-sync 07:00 UTC = 03:00 EDT，写入的永远是前一交易日；单日失败即永久丢失（10-22 已缺）。
- **symbol 写法不一致**（P0，41 天）：transactions/targets 用 `000191.cn`，assets/prices 用 `000191` → `suggestionGenerator` 查 `000191.CN` 失败 → 「A股-长钱组合」每天 FAILED；`VBG.TO`/`VBU.TO` 无价 61 天。
- **完整性检查形同虚设**：每天 SUCCEEDED 但存在大量缺口；应改「全局陈旧度 + 相对基准」双判（`scripts/check-collection-health.cjs`），**建议下沉 `shared/services/dataHealth.service.js`** 供 API/看板/Alert 共用。
- **汇率方向反了**（TASK-051，High，待裁 OQ1/OQ2）：取 `/latest/CNY` 当 `rateToCny` → USD/CAD 低估、HKD 高估；实测 totalCny 3,151 vs 修正 76,128。`fxRate.service` 零单测；`family.summary.test.js:132,160` 手填 7.2 绕过采集端。
- **CSV 幂等失效**（TASK-046，P0）：`transaction.service.js:233` `select()` 漏 `portfolioId` → 键恒 undefined → `skipped` 恒 0；测试 mock 无视 select 造成假阳性（修 mock + 两连导入用例先验红）。
- 归属不可变（TASK-047 方案②后端拒绝改写）；`EditTransaction.jsx:82` 恒带 `portfolioId` → 守卫须判值是否变化。

## 审查方法（可复用）
- 不往库里插数据验展示层：`page.route` 拦截 + `fulfill` 喂构造数据，零写入。
- 颜色断言不硬编码色值：注入同 class 参照片取 `getComputedStyle`（Tailwind v4 输出 `oklch()`）。
- 「X 失败不拖垮 Y」用 `route(..., r => r.abort())` 实测。
- 断言失败先怀疑选择器再怀疑产品（先用必存在样本自检）。
- 「恒显示」类 AC 必须构造空态（空数组/null）+ 负向对照证明锚准目标。
- 别 mock 掉你怀疑的那一段：测试用理想输入、生产用采集输出，中间无人测。
- 表述类断言写「文本非空且 ∈ 允许值集合」，不写「不含 undefined」。

## 文档归属（2026-10-26 三轮迁移后）
- `product/` 只放产品语言；实现清单全部外链。**PL-0 518 → 197 行**（9 节：定位/成熟度/模块归属/功能评估判定表/能力清单/功能域编码/技术债产品化/维护规则/相关文档）。
- `architecture/ARCHITECTURE.md` 已是实文档 v2.0（风格/技术栈/外部集成+容错/模块边界/数据流/持久化/9 条约束/10 条债）。
- 新建 `dev/DATA_MODEL.md`（字段/索引/契约缺口/查询模式）与 `dev/CLIENT_DEV.md`（路由/组件/hooks/service/token/已知偏差）。
- 产品级定义唯一归属 `PRODUCT_LINES.md §1`（4 小节）；各 PL-0~PL-6 的 §1 同构，只写本线价值主张。
- `DOCS.md §2.1/§2.2` 已登记：技术栈/外部集成/架构债 → ARCHITECTURE；系统总览与运行时拓扑 → `DEPLOYMENT §1`；业务规则 → `CLIENT.md §5`；认证需求形态 → `specs/FS-authentication.md`，认证技术决策 → `adr/ADR-001`。
- **文档链接已归零**（2026-10-26 实测 707 条相对链接、0 失效）；改完文档跑一次全仓相对链接校验，别再引入死链。
- **文档欠账**：`docs/agents/REVIEWER.md` 空；`EXECUTION_PLANS.md §3` 写 `completed/` 实际是 `complete/`；4 条既有死链（`docs/readme.md` ROADMAP + `specs/authentication.md`、`archive/functions.md:898`、`USER_RESEARCH.md:408`）；`FS-asset-price-consolidation.md` 的 R6 仍写旧口径（≥3 天标红）。

## 产品归属裁决（详见 `product/specs/FS-portfolio-ia-cleanup.md`，Approved 未实施）
- 组合详情首 Tab 改「总览」+ 再平衡子 Tab 3→2；Dashboard 加「组合健康表」（需 `summary` 补 `lastExecutedAt`/`pendingRebalanceCount`/`drift.dueByTime`/`drift.overThresholdCount`，不改 needsRebalance 语义）。两个交付单元 A/B，需求编号现为 **A1~A17 / B1~B16 / AC 42 条**。
- 阈值/频率：声明归 PL-3、运行时归 PL-4。再平衡通知登记为 **PL-4 `RB-12`**（`ruleId=null`，载体 PL-5 事件表），**不纳入 `AlertRule`**。`/portfolios` 已到容量上限，不再加家庭区块。
- 2026-10-26 晚补 5 项裁决（`HD-10`~`HD-14`）：健康表保留 N（靠新字段 `overThresholdCount`，`B8a` 作废）× Header 去「再平衡」留「设置目标」（`A17` 为新增）× 原型一次全改 × 组合卡四格纳入（`B15`）× **删组合后其事件"全部隐藏"**（`B16` 查询层过滤、库里保留、资产级 `portfolioId=null` 必须留）。
- **两份设计产物分工固定**：Ardot 9 屏管视觉，`docs/ui/2.0/portomind-prototype.html` 管行为；冲突以需求为准并回改原型。
- **原型整改清单**：`TASK-059`（29 项 U 待整改，**只改原型不改业务代码**）。⚠️ 该原型有 7 个"假成功"级 P0（删除文案说反 / 到期态被吞 / 大类目标拿实际占比当目标 / 待办点击被行覆盖 等），照它实现会做出错误产品。

## 本机环境
- 真实库 `portomind` @ 192.168.2.140:27017；`portomind_dev` 开发库（`server/.env`）。
- `npm run sync:db`（`scripts/sync-db.cjs`）整库镜像真实→开发，安全守卫要求目标库名含 `_dev/_test/_e2e`。
- MongoDB Tools 100.14.0 用 scoop 装、**无 shim**，路径 `C:/Users/maxto/scoop/apps/mongodb-database-tools/current/bin/`；参数必须 `--opt=value`；`--nsFrom/--nsTo` 必须配 `--nsInclude`；还原统计在 stderr。
- curl 必须 `--noproxy '*'`；vite 只监听 `[::1]:5173`，改配置需重启。
- 客户端 eslint：`cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"`。
- E2E：复制真实库到副本 + `playwright-core` 驱动本机 Chrome，示例 `client/scripts/e2e-task-044.mjs`。
- **设计稿**：Ardot 文件 `718734137758145`；本地存档 `docs/ui/`（9 屏 PNG@2x + 组件 + 全屏 PDF + README 索引，README §4 列了「设计稿 ≠ 现状」清单）。改稿后必须重导并更新 README。
- **Ardot 操作要点**：`C()` 复制画板后子节点 ID **全部重建**，必须重新 `batch_read` 拿新 ID（用 `binding+"原id"` 会全 skip）；溢出用 `capture_layout(problemsOnly,parentId)` 验（`OUTSIDE_PARENT`=溢出），比截图省配额；PNG 导出 ≤5 节点/批，PDF 一次合并；落盘 `curl --noproxy '*'`。

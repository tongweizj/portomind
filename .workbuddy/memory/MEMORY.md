# PortoMind 长期备忘（2026-10-27 压缩版）

> 过程细节看 `.workbuddy/memory/YYYY-MM-DD.md`；本文件只留跨会话仍用的结论。docs 里已详述的只留指针。

## 纪律与流程
- 唯一索引 `docs/readme.md`；**单一归属**：手册 `manual/*`、功能 `product/PRODUCT_LINES.md`+`lines/PL-0~6`、实现 `dev/{DATA_MODEL,CLIENT_DEV,API_CONTRACT}.md`。
- 改文档先与源码对账；**不写会漂移的硬数字**（行数/测试数）。
- 业务代码改动必须先有 `Approved` ExecPlan；需求批准 ≠ 方案批准；实现与审查不同角色不同轮；build/lint 绿 ≠ 交付；验证期望值不得从实现反推。
- **结案三处同步**：`git mv` → `complete/`、文件内 Status + Completion Record、索引与**全部**交叉引用；归档后必跑 docs 链接校验（`complete/` 深一层最易漏）。
- 任务编号**立项才占号**（进 `active/` 才算）；FS 里不预写 `TASK-0xx`。
- `docs/exec-plans/` 新文件常 untracked，`git commit -am` 会静默丢；提交前 `git ls-files` 确认。
- 分支 `feature/TASK-<id>-<desc>`；commit `<type>(<scope>): <summary>` + body 附 `TASK-<id>`。
- 动手前 `git branch --show-current` + `git log --oneline -3 main`。**「任务完成」≠「已合并」**：结案前 `git merge-base --is-ancestor <sha> main` 验一次。
- 文档欠账：`agents/REVIEWER.md` 空、`EXEC_PLAN_TEMPLATE.md` 0 字节、`EXECUTION_PLANS.md §3` 写 `completed/`（实为 `complete/`）。
- **原型类任务（`docs/ui/2.0/*`）免 ExecPlan**（TASK-059/060/061 先例），但须独立 Reviewer 断言脚本复核。

## 架构（硬事实）
- 三进程一库：`client`(Vite SPA) / `server`(Express，不注册 cron、**只暴露只读聚合**) / `cron-worker`(唯一调度) + `shared/`(业务内核唯一实现)。npm workspaces。
- **`GET /api/cron/status`（TASK-054 归档，契约冻结于其 ExecPlan §4.3）**：5 条任务固定顺序，每条 `lastRun|stale|contractReady|dataState|dataStateLevel|notes[]`；detail 复用同端点 `?detail=rebalance&date=&portfolioId=`。派生唯一实现 `shared/services/cronStatus.service.js`（`STALE_FACTOR=2` + `TASK_PERIOD_HOURS`；**改 `PRICE_SYNC_CRON` 必须同步 `PRICE_SYNC_DUE_HOUR`**）。核心语义：有效目标日（周末/休市/03:00 前不报假缺口）、`contractReady=false` 时数值 `null`（严禁用 `status` 冒充）。待修：FX 适配器把 rates 数字形态与 `currencies:{}` 都判 bad 且无 note。
- 跨包引用必须 `require('@portomind/shared/...')`；`shared/` 内 0 处反向 require 进程、0 处 `process.exit`。
- 5 类 cron 全在 worker（价格 0 3 / 完整性 30 3 / 提醒 0 4 / 汇率 30 9 / 再平衡 0 0）。AUTO 再平衡单日分发，`SCHEDULE_DUE_RULES` 硬编码——新增频率必须补规则。
- **安全边界**（唯一归属 `DEPLOYMENT §9`）：CORS `origin:true`、**`CORS_ORIGINS` 读了不生效**（`app.js:34` 走 `origin:true`，别说成「未读取」）、无认证无多用户 → API 不可暴露公网。
- **认证已裁**（`FS-authentication` + `ADR-001` + `TASK-058`）：单租户多账号（共享同一份家庭数据，**不加 `tenantId`**）× `admin`/`member` × admin 建号无自助注册 × 只停用不删除 × 首登强制改密 × 会话存 Mongo（全仓首个 TTL）。⚠️ **U1 后端闸门与 U2 登录页必须同批发布**（U1 单独上线=全站 401）。
- **认证口径 `D8`~`D13`**：① 登录错误统一「不存在/密码错」，**停用账号刻意区分**（唯一例外）；② 禁止管理员重置自己；③ 登录成功落 `next` 或 `/`，仅 `mustChangePassword` 进 `/account`；④ **退出登录唯一入口 = 顶栏头像下拉**；⑤ 下拉 = 身份行（用户名 + 弱化角色同行）+ 分隔线 + 账户设置 + [系统设置(仅 admin)] + 提醒规则 + 退出登录；**侧栏 4 项、无账户入口**。
- 持久化：Mongo + Mongoose 6；**无事务** · 无 TTL · 无迁移框架。
- 外部数据源（判定处 `priceFetch.service.js`）：Yahoo（美股/加股 `.TO`/港股 `.HK`）· 东方财富（A 股 `push2`+`push2delay`）· 天天基金（`CN-FUND`，`api.fund.eastmoney.com/f10/lsjz`）· er-api（汇率）。
- `ASSET_*` 枚举两份复制（`shared/constants/asset.constants.js` / `client/src/constants/enums.js`），双向同步。
- 硬约束：AUTO 再平衡只生成建议+提醒，绝不自动交易；缺价时估值字段 `null`；跨币种只在家庭层折算。

## 关键实现事实（易踩）
- **TaskRun 契约残缺**（`dev/DATA_MODEL.md §5`）：无 `result`（strict 静默丢弃）；`normalizeCounts()` 白名单只留 total/success/failure/failures；无 `SKIPPED`；再平衡无父级 taskrun。⚠️ `SKIPPED` 与唯一索引 `(taskName,runKey)` 冲突，**未裁不得开工**（TASK-057 OQ-1）。
- **真实字段名**：完整性 `{totalCount,checkedCount,skippedCount,successCount,failureCount,assets[],totals:{expectedCount,actualCount,missingCount}}`（**无 ok/gap**）；提醒 `{evaluated,created,archived,failed}`（`created` 才是命中数）；汇率 `{fxCount}`。落库 taskName = `daily-price-sync`/`price-integrity-check`/`alert-evaluate`/`fx-rate-sync`/`rebalance-suggestions:<pid>`；`price-sync`、`health-check` 只是日志 scope。
- **`successCount` 语义**：任务全绿 ≠ 有新数据；缺口资产既不计成功也不计失败 → 有缺口仍 SUCCEEDED。
- 缺口判定 = 相对基准法（`client/src/utils/priceDisplay.js`），盲点：全市场同时停更不告警。`Price` 无 `change/prevClose`；价格 cron 只同步 `active` 资产。
- **两处 `needsRebalance` 同名不同义（勿合）**：`thresholdChecker` 含 `timeInterval`；`summary.js` 的 `drift.needsRebalance` 只含偏离，且有 `!hasMissingPrice` 守卫 → **任一持仓缺价即 `drift=null`**。`actualRatios` 只返 `{symbol,currency,ratio}` → 须走 `POST /:pid/rebalance/check`。
- `/family` 已下线。总资产卡在 `/`；`CurrencyBuckets`/`ContributionBar`/`RecentTransactions`/`RecentRebalance`/`FxPanel` 在 `/portfolios` 且是**纯 props 组件**（`List.jsx` 取一次）。
- 口径单一来源：`enums.js` 的 `TRANSACTION_ACTION_LABELS`（冻结）、`CURRENCY_LABELS`、`REBALANCE_STATUS_LABELS`；`priceDisplay.js` 的 `formatCny`/`formatMoney`。**涨红跌绿别「修正」**。

## 生产实测缺陷
- **采集滞后一天且无回补**：price-sync 07:00 UTC 写的是前一交易日；单日失败即永久丢失。
- **symbol 写法不一致**（P0）：transactions/targets 用 `000191.cn`，assets/prices 用 `000191` → 长钱组合每天 FAILED；`VBG.TO`/`VBU.TO` 无价 61 天。
- **完整性检查形同虚设**：每天 SUCCEEDED 但大量缺口（44 资产全无 `launchDate`）。
- **汇率方向反了**（TASK-051）：`/latest/CNY` 当 `rateToCny` → USD/CAD 低估、HKD 高估；`fxRate.service` 零单测。
- **CSV 幂等失效**（TASK-046）：`transaction.service.js:233` `select()` 漏 `portfolioId`。
- 归属不可变（TASK-047 方案②）；`EditTransaction.jsx:82` 恒带 `portfolioId` → 守卫须判值是否变化。

## 审查与验收方法（可复用）
- 不往库里插数据验展示层：`page.route` + `fulfill` 喂构造数据；「X 失败不拖垮 Y」用 `r.abort()`。
- 颜色断言不硬编码色值：注入同 class 参照片取 `getComputedStyle`。
- 「恒显示」类 AC 必须构造空态 + 负向对照；断言落在**渲染结果**上。正文类断言只查 `#view`（`body.textContent` 会把内联 script 算入）。
- ⚠️ **Human 说「UI 改完了验收一下」= 视觉验收**。「UI/稿/界面」默认视觉优先，行为验收先问。

## 产品归属与原型
- **`FS-portfolio-ia-cleanup.md`（Approved 未实施）**：组合详情首 Tab 改「总览」、子 Tab 3→2；Dashboard 加「组合健康表」。编号 A1~A17/B1~B16/AC 42 条。阈值/频率：声明归 PL-3、运行时归 PL-4；再平衡通知登记 PL-4 `RB-12`（`ruleId=null`），**不纳入 `AlertRule`**。
- **两份设计产物分工固定**：Ardot 9 屏管视觉，`docs/ui/2.0/portomind-prototype.html` 管行为（**唯一实现**，auth 原型已退为 69 行跳转壳）；冲突以需求为准并回改原型。激活态 class 是 `.seg-btn.on`。
- **`TASK-059`**（组合线 29 项）：产品侧 `CHANGES REQUIRED`（27 过 / 2 部分过），新发现 `V-1`~`V-5`；`V-1` P0 = `driftOf` 无「缺价」态。§11 视觉验收 `VI-1`~`VI-23`：Topbar 与页内标题同名、5 Tab 全背标题卡、最近交易表无 thead 等。
- **`TASK-060`**（用户模块）：复审 `CHANGES REQUIRED`，17/19 达标，7 项待改 `N-1`~`N-7`；硬伤 `safeNext` 只判 `startsWith('/')` 挡不住 `//host`（照抄即开放重定向）。验收脚本 `_verify-060.cjs`（Reviewer 独立），不采信执行方 `_audit-auth.cjs`。
- **`TASK-061`**（`/logs` cron 运行看板）：置顶「任务运行看板」tab + 「任务日志」/「服务器日志」；数据态为主信号（`status` 绿灯不可信）；再平衡聚合 1 卡 → 独立子路由 `/logs/rebalance`；**手动刷新、全频道只读**（禁执行/撤销/触发/编辑阈值）；状态色红=坏绿=好，**与行情红涨绿跌无关**，须带图例。

## 本机环境
- 真实库 `portomind` @ 192.168.2.140:27017（**需认证**）；`portomind_dev` 开发库。`npm run sync:db` 整库镜像，目标库名须含 `_dev/_test/_e2e`。
- MongoDB Tools（scoop，**无 shim**）：`C:/Users/maxto/scoop/apps/mongodb-database-tools/current/bin/`；参数 `--opt=value`；`--nsFrom/--nsTo` 须配 `--nsInclude`；还原统计在 stderr。
- curl 必须 `--noproxy '*'`；vite 只监听 `[::1]:5173`。**生产要 build + Nginx，`VITE_API_URL` 必须置空**。
- 客户端 eslint：`cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"`。E2E：`playwright-core` 驱动本机 Chrome。
- **设计稿**：Ardot 文件 `718734137758145`；本地存档 `docs/ui/`。Ardot 坑：复制画板后子节点 ID 全重建（必须重新 `batch_read`）；PNG 导出 ≤5 节点/批、PDF 一次合并。

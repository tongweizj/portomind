# PortoMind 长期备忘（精简版）

## 结构与纪律

- 唯一索引 `docs/readme.md`；单一归属：每主题只详述一处。手册四份 `manual/{CLIENT,SERVER,CRON_WORKER,DEPLOYMENT}.md`。功能文档 = `product/PRODUCT_LINES.md` + `product/lines/PL-0~PL-6.md`（跨线参考集中在 PL-0）。
- 不写会漂移的硬数字（测试数/覆盖率），用「以实际输出为准」；改文档前先与源码对账。
- 流程硬纪律：业务代码改动必须先有 `Approved` ExecPlan；需求批准 ≠ 方案批准；实现与审查不得同角色同轮；build/lint 通过不能作为交付依据；验证期望值不得从实现反推；数字自评须实测（`grep -c`）。
- 结案三处同步：文件位置（`git mv` 到 `complete/`）、文件内 Status（任务卡 + ExecPlan 均改并补 Completion Record）、索引与全部交叉引用。TASK-043/044 均因此踩坑。
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

## 未修复缺陷 / 欠账

- **CSV 幂等失效**（TASK-046，P0）：`transaction.service.js:233` 的 `select()` 漏 `portfolioId` → 键恒 `undefined` → `skipped` 恒 0，二次导入整份重复写入。测试 mock 无视 `select()` 造成假阳性（12/12 绿）。修复须同时修 mock，并加「两连导入」用例先在旧实现上验红。
- **归属不可变已裁定**（TASK-047 方案②：后端拒绝改写）。`EditTransaction.jsx:82` 恒带 `portfolioId` → 守卫判「值是否变化」而非「字段是否存在」；不可从 `WRITABLE_FIELDS` 删该字段（create 共用）。
- `FS-asset-price-consolidation.md` 的 R6 与验收标准仍写旧口径（≥3 天标红），与实现不一致 → 待 PM/Human 改措辞。
- 文档缺口：`docs/agents/REVIEWER.md` 仍空；`docs/architecture/ARCHITECTURE.md` 是未填充英文模板（含本项目不存在的 PostgreSQL/Prisma 示例）；`EXECUTION_PLANS.md §3` 写 `completed/` 实际是 `complete/`；`docs/readme.md` 有两条死链（`product/ROADMAP.md`、`product/specs/authentication.md`）。

## 本机环境

- 真实库 `portomind` @ `192.168.2.140:27017`（`portomind_dev` 为空；`server/.env` 的 MONGO_URI 主机已不可达，启动需用环境变量覆盖）。
- `client/.env` 有 `VITE_API_URL=http://localhost:8080/api`。curl 必须 `--noproxy '*'`（环境带 HTTP_PROXY，否则假 502）；vite 仅监听 `[::1]:5173`（用 localhost）；改 vite 配置需重启 dev server。
- **客户端 eslint 必须** `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"`（二进制提升到根 `node_modules/.bin`；`npx eslint` 会拉 v10 崩溃）。
- E2E：复制真实库到副本 + `playwright-core` 驱动本机 Chrome，脚本示例 `client/scripts/e2e-task-044.mjs`。

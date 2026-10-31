# PL-0 平台基座线（Platform Foundation）

> 版本：v1.7 · 日期：2026-10-26
> 归属：[PRODUCT_LINES.md](../PRODUCT_LINES.md)「产品线 INDEX」中 **PL-0** 的明细子文件
> v1.7 修订（**M0.2d 认证形态裁决**）：Human 2026-10-26 裁决账号与访问控制的产品形态（单租户多账号 / `admin`+`member` / admin 建号无自助注册 / 只停用不删除 / 首登强制改密 / 会话存 Mongo），已写成 [FS-authentication](../../../development/requirements/specs/completed/FS-authentication.md) + [ADR-001](../../../os/architecture/adr/ADR-001-authentication.md) + [TASK-058](../../../development/tasks/completed/TASK-058-authentication-and-accounts.md)。本文件同步两条判定的事实描述：`M0.2c` 补「`CORS_ORIGINS` 读了不生效」的准确成因、`M0.2d` 由「公网前完成认证」细化为已裁决形态。**优先级未变（两者仍为 P0）**。
> v1.6 修订（**内容迁移批次 3/3：删除副本，本文件回归产品文档**）：按 [DOCS.md §1](../../../os/standards/DOCS.md)（`product/` 不放实现细节）与 §2（每主题只在一处详述）删除全部**已在他处详述或被新文档取代**的内容——§6.1 调研方法、§6.2 运行时形态表（→ [DEPLOYMENT.md §1](../../ops/DEPLOYMENT.md)）、§6.4 调度与日历机制（→ [CRON_WORKER_DEV.md](../../technical/CRON_WORKER_DEV.md)）、§6.5 运维横切（→ [SERVER.md](../../ops/SERVER.md)）、§7.1 API 总表（→ [API_CONTRACT.md](../../technical/API_CONTRACT.md)，已是超集）、§7.2 数据模型（→ [DATA_MODEL.md](../../technical/DATA_MODEL.md)）、§7.3 路由与组件（→ [CLIENT_DEV.md](../../technical/CLIENT_DEV.md)）、§7.4 业务规则速查（→ [CLIENT.md §5](../../manual/CLIENT.md)）、§7.5 需求编码索引（与 §6 编码对照重复，细粒度归 [PRD.md](../../../development/requirements/PRD.md)）、§8.2 死代码清单（→ [CLIENT_DEV.md §2](../../technical/CLIENT_DEV.md)）、§8.3 已关闭的文档争议。§5 由「功能点 + 实现入口」压成**能力级清单**。**全部判定与优先级一字未改**；删除项的落点均已在文内给出链接。518 → 197 行（实测）。
> v1.5 修订（**批次 2/3：技术栈与外部集成迁入 ARCHITECTURE**）：[`ARCHITECTURE.md`](../../../os/architecture/ARCHITECTURE.md) 原为未填充的通用英文模板（含 PostgreSQL / Prisma / OAuth / Teams 等本项目不存在的设定），已按实际代码重写为 v2.0；§6.2 的两张表**整表迁出并删除本地副本**，迁移时修正 3 处事实错误（东方财富 `push2`+`push2delay` 主备对；天天基金真实 API 是 `api.fund.eastmoney.com/f10/lsjz`；MongoDB 由 `MONGO_URI` 决定、非本地内嵌），并补记「`shared/` 与 `client/` 无独立测试」。
> v1.4 修订（**批次 1/3：先建后删**）：新建 [`handbook/technical/DATA_MODEL.md`](../../technical/DATA_MODEL.md) 与 [`handbook/technical/CLIENT_DEV.md`](../../technical/CLIENT_DEV.md)，两位是**扩展版而非复制**（均先与源码对账，并补入 PL-0 缺的内容）。当时仅对旧副本加「已迁出」标注，删除动作即本轮 v1.6。
> v1.3 修订（**路线 B**）：产品定义（产品是什么 / 三条硬边界）整体上移至 [PRODUCT_LINES.md §1](../PRODUCT_LINES.md) 并升格为唯一权威定义，本线 §1 收敛为与其他 6 条同构的「定位与价值主张」。
> v1.2 / v1.1 修订：重写 §1（曾一度自持产品定义，已按 v1.3 上移）；与实码对账修正事实漂移（路由 `/assets`→`/instruments`、`/family` 下线、侧栏 5 项、完整性检查「只进日志不入产品」、删除会漂移的行数硬数字、`utils/formatters.js` 并非空文件）。
> 内容范围：① 成熟度快评 ② 产品线 → 产品模块归属 ③ 全量功能评估（判定表） ④ 本线能力清单（能力级） ⑤ 功能域地图与编码对照 ⑥ 技术债的产品化处理 ⑦ 维护规则
> 说明：本线是**支撑线**——不直接交付用户价值，但决定上面六条线的可信度。因此「跨线」的判定与风险归此，**实现机制一律外链**。

---

## 1. 定位与价值主张

> **产品是什么、三条硬边界、价值主线**：见 [PRODUCT_LINES.md §1](../PRODUCT_LINES.md)（唯一权威定义）。本节只写本线专属的定位与价值。

**价值主张：调度、数据质量、可观测性、设计一致性——决定上面六条线的可信度。**

本线不产生「功能」，而产生「信任」：数据是否按时到位、失败是否可见、日志能否追溯、界面是否一致。它被提升为产品级信任项而非纯技术项，因为上述任一环节出问题，都会以**用户可见的不可信**形式外化，而不是报错。

**本线为什么必须存在**：`PRODUCT_LINES.md §1.3` 的三条硬边界，条条要由本线兜住——「缺价不猜」要求采集失败**可被发现**（→ 数据质量看板、陈旧度告警），「只有家庭层折算」要求汇率与价格**同级可信**（→ 汇率采集方向正确、可校验），「绝不下单」要求任务**只写建议与提醒、不写交易**。所以调度漏一个任务、日历少维护一年、汇率方向反了，最终都不是异常，而是**一个看起来正常的错数字**。

- **上游依赖**：无。
- **下游影响**：PL-1~PL-6 全部。
- **典型断链后果**：调度覆盖缺口 → 某类任务永不自动执行；节假日表未维护 → 误判开市、抓到空数据、误报缺口。

---

## 2. 成熟度快评

| 维度 | 评价 | 说明 |
|---|---|---|
| 功能覆盖 | 中 | 调度 / 防重 / 日历 / 容错 / 可观测性 / 设计 token 均具备 |
| 用户体验 | — | 面向自持运维者而非终端用户 |
| 数据可信 | 中 | ✅ 双份调度已收口（TASK-005）；✅ 枚举降为两份；✅ 认证 + CORS 已闭环（TASK-058 U1+U2+U3，2026-10-28 结案）；余：代码待合入 `main` |

**主要短板**：

① ✅ ~~无认证授权 + CORS 开放~~ 已闭环（TASK-058 U1 后端认证内核 + CORS 白名单，U2/U3 前端登录/账户/用户管理页，2026-10-28 结案；**U1 与 U2 必须同批发布**，代码待合入 `main`）；

② 缺数据质量看板；

③ 双轨样式与前端数据层不统一；

④ 节假日表需逐年维护。

---

## 3. 产品线 → 产品模块归属

| 模块 | 包含功能 | 支撑对象 | 现状 |
|---|---|---|---|
| **M0.1 调度与数据质量** | 调度清单、TaskRun 防重、交易日历、抓取容错 / 限流、完整性检查 | PL-2 / PL-4 / PL-5 / PL-6 | 三层防护到位；缺**数据质量看板**与年度流程 |
| **M0.2 系统运维** | 统一响应格式、traceId、请求日志、全局错误处理、日志脱敏、日志查看页 | 全部 | 较完整；日志页数据层不统一 |
| **M0.3 设计系统** | Design token、布局框架、通用状态组件（DataState/KpiCards）、涨跌色语义 | 全部前端 | token 已固化；**双轨样式并存** |

---

## 4. 全量功能评估

> 判定标准见 [PRODUCT_LINES.md](../PRODUCT_LINES.md) §评估框架。判定不改变任何代码。

| 编号 | 能力 | 判定 | 理由（产品视角） | 建议动作 | 优先级 |
|---|---|---|---|---|---|
| M0.1a | 双份调度实现 | ✅ **已完成** | 原：`server/tasks` 与 `cron-worker/tasks` 并存、能力已分化；已由 TASK-005 收敛为 `shared/` 唯一实现 + `cron-worker` 唯一调度所有者 | 已完成（ADR-002） | ~~P0~~ 已闭环 |
| M0.1b | TaskRun 防重 | 保留 | 进程内锁 + 数据库唯一索引双层，跨重启有效 | — | — |
| M0.1c | 交易日历 | **强化** | CN/HK `2027+` 未维护，未维护年份按空表处理（有 warn 但易忽略） | 建立「年度维护」清单与到期提醒；维护遗漏时升级为可见告警 | **P1** |
| M0.1d | 抓取容错 / 限流 | 保留 | 超时分类、主备回退、指数退避 + 抖动，工程成熟 | — | — |
| M0.1e | 完整性检查 | **修改** | 检查逻辑本身正确，但三点让结论不可信：① 文件偏大；② 截断（`INTEGRITY_REPAIR_TRUNCATED`）与延迟回补（`INTEGRITY_REPAIR_DEFERRED`）**只写任务日志**，未进 `TaskRun`/`AlertEvent` → 使用者不可见；③ `successCount` 只统计「无缺口」资产，缺口资产 `status=GAP` 既不计成功也不计失败 → **全组合都有缺口时任务仍报 `SUCCEEDED`**（CLI 退出码同为 0） | 拆分 + 把截断 / 延迟回补 / 缺口提升为可见信号（与 AS-07 同一动作） | P1 |
| M0.2a | 统一响应 / traceId / 脱敏 | 保留 | 横切能力齐全，可观测性到位 | — | — |
| M0.2b | 日志查看页 | **修改** | 手写 `useState/useEffect`，与全站 Query 数据层不一致 | 统一到 Query 数据层（与前端数据层合并一并处理） | P2 |
| M0.2c | CORS `origin:true` | ✅ **已完成**（TASK-058 U1，2026-10-27） | 已改为白名单 + `credentials:true`（`CORS_ORIGINS` 生效），生产未配 `CORS_ORIGINS` 启动 fail-fast；开发态有本地默认来源 | 已完成 | ~~P0~~ 已闭环 |
| M0.2d | 无认证授权 | ✅ **已完成**（TASK-058 U1+U2+U3，2026-10-28 结案） | 已落地：单租户多账号（`User`/`Session`）+ `admin`/`member` 两角色 + 服务端会话（Mongo，绝对 7 天 TTL）+ 首登强制改密 + 默认 `admin/admin` seed + 登录限速 + 全部业务端点 401 闸门 + 前端 `/login`、`/account`、`/account/users` 与 401 拦截、顶栏头像下拉（账户设置/系统设置/提醒规则/退出登录，侧栏 5→4）。**2026-10-26 裁决**：无自助注册、用户只停用不删除、不加 `tenantId` | 见 [FS-authentication](../../../development/requirements/specs/completed/FS-authentication.md) 与 [TASK-058 完成记录](../../../development/tasks/completed/TASK-058-authentication-and-accounts.md)；**U1 与 U2 必须同批发布**，代码仍在分支 `dd388ac` 待合入 `main` | **P0**（公网前置；已闭环） |
| M0.3a | Design token | 保留 | 主色 / 涨跌色等已固化，语义一致 | — | — |
| M0.3b | 双轨样式 | **合并** | 内联 token style 与 Tailwind 两套并存，长期维护成本高 | 明确单一主路径（建议 token + 组件封装），逐步收敛 | P2 |
| M0.3c | 通用状态组件 | 保留 | DataState 三态全站复用 | — | — |

---

## 5. 本线能力清单（能力级，机制明细归各自主文档）

> 本节只回答「这条线现在具备什么能力」。**能力如何实现**不在产品文档里：
>
> - **M0.1 调度与数据质量** → [CRON_WORKER.md §2](../../ops/CRON_WORKER.md)（功能地图）· [CRON_WORKER_DEV.md](../../technical/CRON_WORKER_DEV.md)（调度引擎、两层防重、TaskRun 契约、日历与归桶）· [CRON_WORKER_OPS.md](../../ops/CRON_WORKER_OPS.md)（CLI、巡检、排障）
> - **M0.2 系统运维** → [SERVER.md](../../ops/SERVER.md)（响应格式、traceId、请求日志、错误处理、日志脱敏与切割）· [DEPLOYMENT.md §9](../../ops/DEPLOYMENT.md)（CORS 与认证边界）
> - **M0.3 设计系统** → [CLIENT_DEV.md](../../technical/CLIENT_DEV.md)（组件清单、Query 数据层、设计 token、双轨样式现状）

| 模块 | 已具备的能力 |
|---|---|
| **M0.1 调度与数据质量** | 唯一调度所有者（全项目只有 `cron-worker` 注册 cron）· 5 类定时任务全自动运行 · 双层任务防重（进程内 + 数据库，跨重启有效）· 逐资产 / 逐规则故障隔离 · 交易日历（市场时区 + 节假日 + 未维护年份告警）· 抓取容错（超时分类 / 主备回退 / 退避抖动）· 完整性检查与缺口自动回补 · 手动 CLI 入口（价格同步 / 历史回补 / 完整性检查） |
| **M0.2 系统运维** | 统一响应格式 · traceId 全链路 · 请求访问日志 · 全局错误处理与状态码推断 · 日志脱敏（含循环引用）· 日志按天切割与保留策略 · 日志查看页与日志查询接口 |
| **M0.3 设计系统** | Design token（品牌色 / 涨跌色 / 布局 / 字体 / 文本层级）· 布局框架（侧栏 + 顶栏 + 内容区，4 项顶层导航——「提醒规则」2026-10-27 移入顶栏下拉）· 通用状态组件（加载 / 空 / 错误三态）· 通用按钮组、组合卡片、交易表格、KPI 卡 · TanStack Query 数据层 · 双轨样式（现状，待收敛） |

---

## 6. 功能域地图与编码对照

**功能编码对照**（PRD 采用模块化需求编码，本文件沿用该编码以便双向追溯；**细粒度编码条目以 [PRD.md](../../../development/requirements/PRD.md) 为准**）：

| 前缀 | 功能域 | 编号范围 | 展开位置 |
|---|---|---|---|
| `AS` | 资产管理与行情价格 | AS-01 ~ AS-11 | [PL-1](./PL-1-ledger.md)（AS-01~03/09）、[PL-2](./PL-2-market-data.md)（AS-04~08/10/11） |
| `TR` | 交易记录与持仓计算 | TR-01 ~ TR-09 | [PL-1](./PL-1-ledger.md) |
| `CM` | 组合管理与配置 | CM-01 ~ CM-20 | [PL-3](./PL-3-portfolio.md)（全部；`CM-09/10` 为阈值/频率的**声明**，其运行时由 PL-4 承载） |
| `RB` | 再平衡 | RB-01 ~ RB-12 | [PL-4](./PL-4-rebalancing.md) |
| `AL` | 提醒中心 | AL-01 ~ AL-10 | [PL-5](./PL-5-alerting.md) |
| `FAM` | 家庭视图与汇率 | FAM-01 ~ FAM-04 | [PL-6](./PL-6-household.md) |
| — | 估值分位 | AS-11 | [PL-2](./PL-2-market-data.md) |
| — | 调度与数据质量 / 系统运维 / 设计系统 | — | 本文件 §5 |

**全景功能清单（12 个功能域 → 产品线映射）**

| # | 功能域 | 承载模块 | 归属产品线 |
|---|---|---|---|
| 1 | 资产管理 | client + shared | [PL-1](./PL-1-ledger.md) |
| 2 | 行情价格 | shared + cron-worker | [PL-2](./PL-2-market-data.md) |
| 3 | 交易记录 | client + shared | [PL-1](./PL-1-ledger.md) |
| 4 | 持仓与成本引擎 | shared | [PL-1](./PL-1-ledger.md) |
| 5 | 组合管理 | client + shared | [PL-3](./PL-3-portfolio.md) |
| 6 | 再平衡 | client + shared（AUTO **触发**在 cron-worker） | [PL-4](./PL-4-rebalancing.md) |
| 7 | 提醒中心 | client + shared（评估**触发**在 cron-worker） | [PL-5](./PL-5-alerting.md) |
| 8 | 家庭视图与汇率 | client + shared（采集**触发**在 cron-worker） | [PL-6](./PL-6-household.md) |
| 9 | 估值分位 | shared | [PL-2](./PL-2-market-data.md) |
| 10 | 任务调度与数据质量 | cron-worker | 本文件 |
| 11 | 系统运维 | client + server | 本文件 |
| 12 | 设计系统 | client | 本文件 |

**功能域依赖关系**

```text
资产管理 (1) ──┐
               ├──> 交易记录 (3) ──> 持仓/成本引擎 (4) ──┐
行情价格 (2) ──┘                                          ├──> 再平衡 (6)
                                                          │
组合管理 (5) ──(目标配置)─────────────────────────────────┘
                     │
                     ├──> 提醒中心 (7) ←── 估值分位 (9)
                     │
                     └──> 家庭视图 (8) ←── 汇率

任务调度 (10) ──驱动──> 行情价格 (2) / 提醒中心 (7) / 汇率 / 再平衡 (6)
系统运维 (11) ──横切──> 全部
```

---

## 7. 技术债的产品化处理

技术债之所以写进产品文档，是因为它们会以「用户可见的不可信」或「迭代速度下降」的形式外化。**架构层面的结构与机制见 [ARCHITECTURE.md §8](../../../os/architecture/ARCHITECTURE.md)（本文不重复）**，本节只保留「外化为哪种用户问题 + 如何处理」。

| 技术债 | 外化为哪种用户问题 | 产品化处理建议 |
|---|---|---|
| ~~双份调度实现~~ ✅ | ~~同一任务行为不一致 → 价格 / 提醒结果在不同部署下不同~~ | ✅ 已解决（TASK-005）：`shared/` 唯一实现 + 单一调度所有者 |
| **完整性检查的异常「只进日志、不进产品」** | 缺口被截断或延后回补时，**界面看不出来**；全组合都有缺口，任务仍报 `SUCCEEDED` → 用户以为数据是完整的，实际不是 | 把「截断 / 延迟回补 / 缺口」提升为可见信号（进 `TaskRun` 字段 + 事件表 + 看板红点），与 AS-07 同一动作（见 §4 M0.1e） |
| **再平衡单日分发的隐式契约** | 新增一个再平衡频率后，该频率**静默永不触发**——用户配了却不生效，且没有任何报错 | 到期规则与频率取值必须同源；新增频率时补规则，并加「未识别频率」告警（机制见 [CRON_WORKER_DEV.md](../../technical/CRON_WORKER_DEV.md) §3） |
| ~~无认证 + CORS 过宽~~ ✅ | ~~数据暴露风险（家庭资产全量可见）~~ | ✅ 已闭环（TASK-058 U1，2026-10-27）：后端认证内核 + CORS 白名单；**余**：前端 `/login`、`/account`、`/account/users`（U2/U3）未上线，U1 不得单独发布（见 §4 M0.2c / M0.2d） |
| 前端数据层不统一 | 页面加载 / 刷新行为不一致，改一处易漏另一处 | 决定「是否全站迁移 Query」后再动手，不为统一而统一（见 §4 M0.2b） |
| 节假日表逐年维护 | 某年节后误判开市 → 抓到空数据 / 误报缺口 | 把「年度维护」列为固定运维动作（可用到期提醒），见 §4 M0.1c |
| 枚举两份 | 新增市场 / 币种时漏改一端 → 前端选不到、后端拒收 | `shared/constants` ↔ `client/src/constants/enums.js` 双向同步；根治方向是「前端由后端驱动」（详见 [ARCHITECTURE.md §8](../../../os/architecture/ARCHITECTURE.md)） |

---

## 8. 维护规则

**何时更新本文**：

- 新增 / 移除**本线能力**，或某项能力的**判定/优先级**变化 → 更新 §4（判定表）与 §5（能力清单）。
- 模块归属或成熟度变化 → 更新 §2 / §3。
- 功能域划分、需求编码范围变化 → 更新 §6。
- 技术债被清理或新增（产品可见层面）→ 更新 §7。
- 产品线划分本身变化 → 更新 [PRODUCT_LINES.md](../PRODUCT_LINES.md)。

**不要写进本文**（各有唯一归属，见 [DOCS.md §2.2](../../../os/standards/DOCS.md)）：API 端点（→ `API_CONTRACT`）· 数据模型字段（→ `DATA_MODEL`）· 前端路由/组件/hooks（→ `CLIENT_DEV`）· 调度引擎与 TaskRun 契约（→ `CRON_WORKER_DEV`）· 运维命令（→ `CRON_WORKER_OPS` / `SERVER`）· 业务口径（→ `CLIENT.md §5`）· 运行时形态与技术栈（→ `DEPLOYMENT §1` / `ARCHITECTURE §2-3`）。

---

## 9. 相关文档

- [PRODUCT_LINES.md](../PRODUCT_LINES.md) — 产品线总览与 INDEX（本文件的上级；产品定义唯一权威）
- [PL-1 投资账本线](./PL-1-ledger.md) · [PL-2 行情数据线](./PL-2-market-data.md) · [PL-3 组合与配置线](./PL-3-portfolio.md) · [PL-4 再平衡决策线](./PL-4-rebalancing.md) · [PL-5 提醒与通知线](./PL-5-alerting.md) · [PL-6 家庭总览线](./PL-6-household.md)
- [ARCHITECTURE.md](../../../os/architecture/ARCHITECTURE.md) — 架构风格、技术栈、外部集成、模块边界、架构约束与架构债
- [DEPLOYMENT.md](../../ops/DEPLOYMENT.md) — 系统总览与运行时拓扑（§1）、环境变量全表（§4）、部署（§6）、安全边界（§9）
- [CRON_WORKER.md](../../ops/CRON_WORKER.md) — 调度功能地图；运维 / 产品 / 开发三视角见其导航
- [CRON_WORKER_DEV.md](../../technical/CRON_WORKER_DEV.md) — 调度引擎、两层防重、TaskRun 契约、日历与市场时区归桶
- [CRON_WORKER_OPS.md](../../ops/CRON_WORKER_OPS.md) — CLI 手动入口、巡检与排障
- [SERVER.md](../../ops/SERVER.md) — 服务端响应格式、日志、错误处理与排障
- [CLIENT.md](../../manual/CLIENT.md) — 界面操作与**业务口径**（§5）
- [CLIENT_DEV.md](../../technical/CLIENT_DEV.md) — 前端实现：路由、组件、数据层、设计 token、已知偏差
- [DATA_MODEL.md](../../technical/DATA_MODEL.md) — 数据模型、索引与契约缺口
- [API_CONTRACT.md](../../technical/API_CONTRACT.md) — REST API 契约
- [PRD.md](../../../development/requirements/PRD.md) — 需求基线（功能编码来源）
- [BOARD.md](../../../BOARD.md) — 任务板与阶段路线（原 `development/requirements/ROADMAP.md` 尚未建立，勿再引用）
- [os/standards/DOCS.md](../../../os/standards/DOCS.md) — 文档结构规范与单一归属规则
- [ADR-001 认证（模板）](../../../os/architecture/adr/ADR-001-authentication.md) · [ADR-002 单一调度器与共享内核](../../../os/architecture/adr/ADR-002-single-scheduler.md)
- functions.md（已归档） — 本线内容的原始来源（历史留存，勿据此更新）

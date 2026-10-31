# 文档结构规范（DOCS）

> 适用范围：`docs/` 全部文档、仓库根 `README.md`、仓库根 `AGENTS.md`，以及各 workspace 的 `README.md` / `readme.md` / `AGENTS.md`（`client/`、`server/`、`cron-worker/`）。
> 目的：把「文档该放哪、同一主题该写在哪」固化成规则，避免**主题级重复**导致的事实漂移。

## 1. 目录职责

按用途分为三组：`os/` 保存工作规则与工程约束，`development/` 保存需求与交付工作，`handbook/` 保存持续维护的系统资料。下表路径相对于 `docs/`；`BOARD.md` 和 `readme.md` 保留在 docs 根目录，作为日常调度与导航入口。

| 目录 | 职责 | 不该放什么 |
|---|---|---|
| `os/roles/` | Agent 角色定义 | 业务文档、已填写的任务记录 |
| `os/architecture/` | 本项目架构分层、模块边界、工程约束与 ADR；迁用其他项目时重新核对 | 操作步骤、需求原文、功能全景 |
| `os/process/` | 工作流程、需求编写、执行计划与完成标准；状态和权限唯一归属 `STATES.md` | 具体任务内容 |
| `os/standards/` | 编码、Git、安全、测试与文档规范 | 一次性决策、教程 |
| `os/templates/` | Story、Task、ExecPlan、场景的空白模板 | 已填写的实例 |
| `development/requirements/` | 产品定义与需求：PRD、用户研究；`specs/` 放规格、`scenarios/` 放可选场景、`stories/` 放长期保留的 Story；状态以卡片字段为准 | 实施记录、运维步骤、重复的功能全景正文 |
| `development/delivery/` | 按 Story 集中保存过程文档，位置和收尾规则见 §1.1 | 长期产品规则、重复的共享任务副本 |
| `development/tasks/` | 独立维护任务及既有任务记录；新 Story 过程资料按 §1.1 | 新 Story 的重复过程副本 |
| `development/exec-plans/` | 独立维护任务及既有计划（`active/`、`completed/`）；新 Story 计划按 §1.1 | 长期产品或系统参考资料 |
| `development/issues.md` | 问题线索与待确认事项，立项后链接 Task / Story | 另一份任务状态看板 |
| `development/archive/`（按需创建） | 已退出 Story 及不再维护的历史需求；注明归档与失效条件 | 现行有效需求；Story 过程目录仍按 §1.1 归档 |
| `handbook/technical/` | API、数据模型与组件开发参考 | 待实施需求、临时实施记录 |
| `handbook/manual/` | 用户手册：界面操作、业务概念、后台任务的功能与结果说明 | 部署命令、进程排障、产品规划与评估 |
| `handbook/ops/` | 运维手册：安装部署、环境配置、进程管理、手动触发、巡检、排障、备份与恢复 | 业务操作正文、产品规划、开发实现细节 |
| `handbook/product/` | 产品功能全景、能力边界与产品线说明；总览为 `PRODUCT_LINES.md`，明细放 `lines/`；区分已交付能力与规划评估，正式需求仍引用 `development/requirements/` | Story / Task / 计划的进度正文、重复的需求与验收条件 |
| `development/prototypes/` | 设计稿、原型、截图及其配套检查资料 | 正式需求与任务状态正文 |
| `assets/`（docs 根目录） | 各类文档共用的图片等静态资源 | 需求、规则与过程文档正文 |
| `handbook/README.zh-CN.md` | 中文项目介绍 | 过程资料 |
| `BOARD.md`（docs 根目录） | 全局 Story 与任务调度看板 | 需求或实施细节正文 |
| 仓库根 `AGENTS.md` | Agent 入口：项目定位、**主题→唯一权威路由表**、硬规则、本仓库特有的坑、停手上报条件 | 任何知识的详细正文（技术栈、命令、字段表、端点表、角色职责全文）——它们各有归属 |

**索引**：`docs/readme.md` 是 `docs/` 的**唯一索引入口**；新增目录或文档时必须同步登记。

### 1.1 Story 交付目录与文档生命周期

- 全局调度入口固定为 docs/BOARD.md，只保存当前 Story、队列、状态投影与证据链接，不复制需求或实施正文。
- Story 是长期保留的需求与交付记录，放 development/requirements/stories/；产品当前规则写产品文档/Spec，重要技术取舍写架构文档/ADR，回归能力保留为测试或脚本。
- 当前 Story 的过程目录直接放 development/delivery/US-<编号>/；delivery 根目录只保留一个当前 Story 目录，不设 active/ 层。排队 Story 的需求保留在 requirements/stories/，不提前建立多个当前交付目录。规划、角色切换及返工沿用同一目录。
- Story 过程目录内不再分子目录。任务卡命名 TASK-<编号>.md，对应计划命名 TASK-<编号>-plan.md；以相同任务编号相邻排列。Task 编号全局唯一，不因换 Story 重编。文件名只区分资料，不表示状态或批准。
- 交接信息默认写在 Story 的当前进度或 Task/ExecPlan 的交接节。确需独立记录时，直接放同一 Story 目录，命名 US-<编号>-<两位递增序号>-<内容>.md，例如 US-001-01-planner-handoff.md；不要求固定生成 handoff/return 两份文件。其他证据按 TASK-<编号>-evidence-<名称>.<扩展名> 命名，同样平铺存放。
- 单个 Task 或计划完成只更新其字段与记录，仍留在 Story 目录内，不提前单独移出。
- Human 关闭 Story 后，PM 补齐交付摘要、验收结论、对应版本与证据，核对长期规则已沉淀；Orchestrator 检查下挂工作处置、未决事项与引用后，将专属过程目录整体移到 development/delivery/completed/US-<编号>/，同步 BOARD 和索引。
- 归档是移动，不自动删除。若要清理过程文档，先保留必要验收证据与重要决定的唯一来源、修复引用；独立交接文件的有效内容归位且无剩余引用后可以删除。
- 被复用的历史或共享 Task/计划保持唯一存放位置，通过链接引用，不复制进多个 Story。其他 Story 仍依赖的共享资料不能随当前 Story 移动而失去可访问性。
- 取消沿用 STATES.md §2.3 的退出记录；下挂任务处置完成后，过程目录移到既有退出归档区域 development/archive/delivery/US-<编号>/，不放 delivery/completed/，不能因此记为 Completed。Human 决定重新打开后，将同一 Story 过程目录恢复到 delivery/US-<编号>/，先协调现有当前 Story，保留之前验收和退出记录。
- Status 始终以各卡片/计划字段为准；根目录与 completed/ 只组织资料，不新增状态或实施授权。移动目录后检查内部、外部和索引链接；校验工具须识别平铺的任务卡与计划，并覆盖 completed/ 下的同类资料。
- 既有资料可按明确迁移指令迁入所属Story目录；移后整体验证引用，不保留重复副本。被复用的已交付资料仍保留原位置。独立维护任务仍用 development/tasks/active/ → development/tasks/completed/，对应计划仍用 development/exec-plans/active/ → development/exec-plans/completed/。

## 2. 单一归属规则（核心）

> **每个主题只在一处详述；其余文档只写一句话结论 + 链接。**

这样做的原因是：同一主题在多处重复书写时，改动容易漏改，最终产生「文档说 A、代码是 B」的**事实漂移**。

### 2.1 手册的归属边界

`handbook/` 下四个目录平级：`technical/` 放开发与契约资料，`manual/` 放用户手册，`ops/` 放部署运维，`product/` 放产品功能全景与产品线说明。需求、Spec、Story 仍归 `development/requirements/`；跨目录主题使用链接，不复制正文。下表维护各文档的主题归属。

| 文档 | 唯一负责 | 不再涉及 |
|---|---|---|
| `handbook/manual/CLIENT.md` | 面向使用者的**界面业务操作**、界面手动入口、业务数据口径、常见问题 | 环境变量、安装步骤、调度内部机制、API 端点、安全边界 |
| `handbook/ops/SERVER.md` | **server 进程**：运行/端口/日志、手动 API 端点、专属排障 | 界面操作、调度机制、环境变量全表、安全边界细则 |
| `handbook/ops/CRON_WORKER.md` | **cron-worker 总览（入口）**：进程模型、五大任务功能地图、三视角导航 | 三视角子文档已分拆，本文件只做入口 |
| `handbook/ops/CRON_WORKER_OPS.md` | **cron-worker 运维**：安装/配置/启动/关闭/自检、CLI 手动入口、监控巡检、故障排查 | 调度引擎实现、TaskRun 契约、业务操作 |
| `handbook/manual/CRON_WORKER_PRODUCT.md` | **cron-worker 产品介绍（非 PRD）**：五大任务功能介绍、数据质量程序价值、launchDate 意义、使用者须知 | 实现细节、安装步骤、运维命令 |
| `handbook/technical/CRON_WORKER_DEV.md` | **cron-worker 开发**：调度引擎工厂、再平衡单日分发、两层防重、TaskRun 契约（taskName/runKey/status/退出码）、launchDate 暴露、新增调度器、目录结构 | 业务操作、运维步骤 |
| `handbook/technical/DATA_MODEL.md` | **数据模型**：`shared/models/` 全部模型的字段、枚举、默认值、索引、跨模型引用、已知契约缺口、常用查询模式 | 业务流程与口径、HTTP 接口定义、连接与备份 |
| `handbook/technical/CLIENT_DEV.md` | **前端开发**：目录结构、路由与 `ROUTES` 常量、TanStack Query 数据层、service 层、组件清单、设计 token、新增页面标准动作 | 界面怎么用（→ `handbook/manual/CLIENT.md`）、业务口径、后端契约 |
| `handbook/ops/DEPLOYMENT.md` | **系统部署与运行**：系统架构、本地开发搭建、生产部署（构建/PM2/Nginx/上线检查）、**环境变量全表**、**验证与测试命令**、**安全边界**、**备份与迁移** | 业务操作、完整性检查原理、调度内部机制 |
| `os/architecture/ARCHITECTURE.md` | **系统架构**：架构风格与结构决定、**技术栈**、**外部集成（数据源与容错）**、模块边界与依赖规则、数据流、持久化架构、架构约束、**已知架构债** | 端点清单（→ `API_CONTRACT`）、模型字段表（→ `DATA_MODEL`）、部署步骤与运维命令（→ `DEPLOYMENT` / `CRON_WORKER_OPS`）、功能全景（→ `handbook/product/PRODUCT_LINES.md`） |

### 2.2 主题归属速查

| 主题 | 唯一归属 | 其他文档的做法 |
|---|---|---|
| **Agent 入口**（这是什么项目 / 去哪找 / 硬规则 / 停手上报条件） | 仓库根 `AGENTS.md` | 不复制；主题正文仍归各自文档，入口只写一行链接 |
| 「主题 → 去哪找」的路由表 | 仓库根 `AGENTS.md` §3 | 新增文档或搬迁时同步该表（最高频失效点） |
| **状态词枚举**（Story / 任务 / ExecPlan 状态、`Merged` 字段、别名与废弃词） | `os/process/STATES.md` | 模板、流程文档、看板只引用，不自行定义或另立别名 |
| Story / 任务卡 / ExecPlan 的状态推进权限 | `os/process/STATES.md` §4 | 角色卡只写本角色能推哪一步 + 链接 |
| 审查判定词与严重度（`Pass` / BLOCKER 等，**不是状态**） | `os/roles/REVIEWER.md` §5 | 其他文档引用，不重定义 |
| 系统总览 / 三进程+shared 架构 | `handbook/ops/DEPLOYMENT.md` §1 | 一句话 + 链接；架构风格与模块边界另见 `os/architecture/ARCHITECTURE.md` §1 / §4 |
| 本地环境搭建（`.env` / `npm ci` / 基线数据 / 启动 / 端口） | `handbook/ops/DEPLOYMENT.md` §3/§5 | 一句话 + 链接 |
| 验证与测试命令（`test`/`validate`/`verify`/`lint`/`build`） | `handbook/ops/DEPLOYMENT.md` §7 | 引用，不复制命令 |
| 生产部署（构建 / PM2 / Nginx / 上线检查） | `handbook/ops/DEPLOYMENT.md` §6 | 一句话 + 链接 |
| 环境变量（三份 `.env` 全表） | `handbook/ops/DEPLOYMENT.md` §4 | 各组件手册只列必需项 + 链接 |
| 安全边界（认证 / CORS / 日志脱敏） | `handbook/ops/DEPLOYMENT.md` §9 | README 与 CLIENT 一句话 + 链接 |
| 账号与访问控制的需求形态（角色矩阵 / 页面 / Non-goals） | `development/requirements/specs/completed/FS-authentication.md` | 只写一句 + 链接 |
| 账号与访问控制的技术决策（会话 / 哈希 / 为何不用 JWT） | `os/architecture/adr/ADR-001-authentication.md` | 只写一句 + 链接 |
| 备份与迁移 | `handbook/ops/DEPLOYMENT.md` §10 | 链接 |
| 调度所有权与 5 类定时任务清单 | `handbook/ops/CRON_WORKER.md` §2（功能地图） | 一句话 + 链接 |
| 定时任务时间表 | `handbook/ops/CRON_WORKER.md` §2 | CLIENT 可保留一句话 + 链接 |
| 五大任务功能介绍（解决什么/产出什么，非 PRD） | `handbook/manual/CRON_WORKER_PRODUCT.md` §2/§3 | 链接 |
| 再平衡单日分发规则（SCHEDULE_DUE_RULES） | `handbook/technical/CRON_WORKER_DEV.md` §3 | 一句话 + 链接 |
| 调度引擎通用工厂 | `handbook/technical/CRON_WORKER_DEV.md` §2 | 一句话 + 链接 |
| 两层防重 | `handbook/technical/CRON_WORKER_DEV.md` §4 | 一句话 + 链接 |
| 价格同步 / 完整性检查 / 历史回补（数据质量程序） | `handbook/manual/CRON_WORKER_PRODUCT.md` §3（功能）/ `handbook/ops/CRON_WORKER_OPS.md` §6（手动触发） | 链接 |
| TaskRun 防重与任务 `status` 含义（契约） | `handbook/technical/CRON_WORKER_DEV.md` §5 | 运维解读见 `CRON_WORKER_OPS.md` §7 |
| 命令行手动入口（sync:prices / sync:history / check:integrity） | `handbook/ops/CRON_WORKER_OPS.md` §6 | 链接 |
| 界面业务操作（资产/组合/交易/再平衡/提醒/家庭视图/日志） | `handbook/manual/CLIENT.md` §3 | 链接 |
| 界面手动入口（按钮） | `handbook/manual/CLIENT.md` §4 | SERVER/CRON_WORKER 只列各自端点 |
| 业务口径（成本法 / 分红 / 整手 / 目标 100% / 跨币种） | `handbook/manual/CLIENT.md` §5（PRD 为需求基线，不重复） | 链接 |
| server 手动 API 端点（curl） | `handbook/ops/SERVER.md` §5 | 链接 |
| 数据模型（字段 / 枚举 / 默认值 / 索引 / 跨模型引用） | `handbook/technical/DATA_MODEL.md` | 其他文档只引用字段名与语义，**不复制字段表** |
| 前端路由 / 组件清单 / hooks / service / 设计 token | `handbook/technical/CLIENT_DEV.md` | 产品线与手册只链接，不列实现清单 |
| 功能全景与能力边界 | `handbook/product/lines/`（各产品线子文件）；总览 `handbook/product/PRODUCT_LINES.md` | 其他文档链接 |
| 技术栈（各层框架与主要依赖、版本口径） | `os/architecture/ARCHITECTURE.md` §2 | 其他文档只写「见架构文档」，不列依赖表 |
| 外部集成（行情/汇率数据源、端点、容错与数据源路由） | `os/architecture/ARCHITECTURE.md` §3 | 产品线/手册只写「数据从哪来」，不复述端点与重试策略 |
| 模块边界与依赖规则、架构约束、架构债 | `os/architecture/ARCHITECTURE.md` §4 / §7 / §8 | 其他文档引用，不重列 |

## 3. 写作规则

1. **不写会漂移的硬数字**：如测试用例数、覆盖率、依赖精确版本。改为「以 `npm test` 实际输出为准」；实跑数量与日期放在对应验证记录中。
2. **配置/行为描述必须与代码对账**：涉及开关、默认值、端点的陈述，改文档前先看源码。当前不生效的配置要**明确标注「不生效」**并说明原因；若只是被读取但未接入执行路径，写「读了不生效」而不是「未被读取」——两者成因与修法不同。修复后必须同步删除该标注。
3. **文档间链接用相对路径**，且必须指向真实存在的文件。
4. **搬迁文件时必须同步更新所有引用方**：`docs/readme.md`、根 `README.md`、根 `AGENTS.md` 的 §3 路由表，以及任何指向它的手册。
5. **临时审查与交接资料**按 §1.1 放所属 Story 过程目录；独立维护工作放对应 Task / ExecPlan 记录节。只把可长期复用的系统说明整理进 `handbook/`，清理过程资料前保留必要证据并修复引用。

## 4. 提交前检查清单

- [ ] 新增/搬迁文档已登记到 `docs/readme.md`。
- [ ] 文内相对链接全部可解析（见 §5 校验脚本）。
- [ ] 该主题此前若已在别处详述，已改为「一句话 + 链接」而非再次复制。
- [ ] 没有引入会随时间漂移的硬数字。
- [ ] 涉及的配置/端点已与当前代码对账。
- [ ] 若新增/搬迁的是**文档级主题**，已同步根 `AGENTS.md` §3 的主题→权威路由表。
- [ ] 目录迁移已核对仓库脚本和配置中的路径匹配，尤其文档扫描范围、模板白名单与任务识别规则。

## 5. 链接校验

提交前跑一次全量相对链接校验（扫描 `docs/**/*.md`、根 `README.md`、根 `AGENTS.md` 与各 workspace 的 `README.md` / `readme.md` / `AGENTS.md`）：

```bash
npm run docs:check          # 全量：链接 + AGENTS.md §3 路由表 + 任务卡 Status + 模板占位符
npm run docs:check:links    # 只查相对链接（快）
node scripts/check-docs.cjs --json   # 机器可读，供 CI 使用
node --test scripts/check-docs.test.cjs   # 校验器回归用例
```

校验范围包括 Markdown 链接、HTML 图片/跳转引用与 Markdown 章节锚点。普通或加粗的 Status 表格、早期段落和标题格式均可识别；明确标注“待 Orchestrator 正式登记”的任务内容单独列出，不擅自补状态。模板目录为 `docs/os/templates/`。

仅含文档的副本可以显式借用真实项目中的源码文件：

```bash
node scripts/check-docs.cjs --source-root "D:/projects/portomind" --json
```

`--source-root` 只用于解析副本缺少的非 docs 文件，并在输出中逐条列出；它不会用原项目的旧文档掩盖副本中的缺失文档或错误锚点。完整项目直接运行默认命令，不需要该参数。`--root` 可指定另一检查根目录，供隔离验证使用。

退出码：`0` 全通过 / `1` 有 ERROR（必须修）/ `2` 仅 WARN（可合并，但要在 PR 或任务记录里说明）。

目标：**失效 0 条**。

> Windows 注意：`README.md` 与 `readme.md` 在同一目录下是**同一个文件**，不要当成两份分别维护。

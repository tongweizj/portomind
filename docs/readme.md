# PortoMind 文档导航

先按用途找目录：**遵守什么规则 → `os/`；要做什么、做到哪里 → `development/`；系统如何使用、接口如何定义 → `handbook/`。**

日常开发从 [BOARD.md](./BOARD.md) 进入；Agent 首次接手从根目录 [AGENTS.md](../AGENTS.md) 进入。目录职责与生命周期的唯一规则见 [DOCS.md](./os/standards/DOCS.md)。

## 快速查找

| 我想找 | 入口 |
|---|---|
| 当前 Story、任务进度、下一步交接 | [BOARD.md](./BOARD.md) |
| Story 的价值、范围与验收条件 | [STORIES.md](./development/requirements/stories/STORIES.md) |
| 当前 US-001 的任务、计划与交接材料 | [US-001 交付目录](./development/delivery/US-001)；最新进度以看板为准 |
| 产品方向、需求规格、用户研究 | [PRODUCT.md](./development/requirements/PRODUCT.md)、[PRD.md](./development/requirements/PRD.md)、[specs/](./development/requirements/specs)、[USER_RESEARCH.md](./development/requirements/USER_RESEARCH.md) |
| 角色职责、状态权限、交付流程 | [roles/](./os/roles)、[STATES.md](./os/process/STATES.md)、[WORKFLOW.md](./os/process/WORKFLOW.md) |
| 架构边界、技术决策、编码规范 | [ARCHITECTURE.md](./os/architecture/ARCHITECTURE.md)、[adr/](./os/architecture/adr)、[standards/](./os/standards) |
| API、数据模型、组件开发说明 | [technical/](./handbook/technical) |
| 界面操作、业务概念、后台任务有什么作用 | [用户手册 manual/](./handbook/manual) |
| 部署、配置、巡检、排障、验证命令 | [运维手册 ops/](./handbook/ops)；验证命令见 [DEPLOYMENT.md](./handbook/ops/DEPLOYMENT.md) §7 |
| 产品功能全景、能力边界、产品线说明 | [产品资料 product/](./handbook/product) |
| 原型、设计稿、截图 | [prototypes/README.md](./development/prototypes/README.md) |

## 目录结构

```text
docs/
├── readme.md                 # 文档导航
├── BOARD.md                  # 全局调度入口
├── assets/                   # 文档公共图片等静态资源
├── os/                       # 工作规则与工程约束
│   ├── roles/                # 角色职责
│   ├── architecture/         # 本项目架构与 ADR
│   ├── process/              # 流程、状态、完成标准
│   ├── standards/            # 编码、测试、安全、Git、文档规范
│   └── templates/            # 空白模板
├── development/              # 需求与交付工作
│   ├── requirements/         # 产品定义、研究、Spec、场景、Story
│   ├── delivery/             # Story 过程资料
│   │   ├── US-001/           # 当前 Story：所有文件平铺
│   │   └── completed/        # 已完成：每个 Story 一个目录
│   ├── tasks/                # 独立维护任务及既有任务记录
│   ├── exec-plans/           # 独立维护任务及既有计划
│   ├── prototypes/           # HTML 交互原型、设计稿与截图
│   └── issues.md             # 问题记录
└── handbook/                 # 持续维护的系统资料
    ├── technical/            # 接口、模型与开发说明
    ├── manual/               # 用户：界面操作、业务概念、功能说明
    ├── ops/                  # 运维：部署、巡检、排障、备份
    ├── product/              # 产品功能全景、能力边界与产品线说明
    └── README.zh-CN.md       # 中文项目介绍
```

`os/architecture/` 记录本项目的架构约束与决策，迁用到其他项目时需要重新核对。`handbook/` 随系统行为变化持续更新；Story 完成后，长期需求记录仍留在 `development/requirements/`，专属过程资料按 [DOCS.md §1.1](./os/standards/DOCS.md#11-story-交付目录与文档生命周期) 归档。

## 规则入口（os）

- 角色：[PM](./os/roles/PRODUCT_MANAGER.md)、[Orchestrator](./os/roles/ORCHESTRATOR.md)、[Planner](./os/roles/PLANNER.md)、[Implementer](./os/roles/IMPLEMENTER.md)、[Reviewer](./os/roles/REVIEWER.md)。
- 流程：[需求编写](./os/process/REQUIREMENTS.md)、[协作流程](./os/process/WORKFLOW.md)、[状态与权限](./os/process/STATES.md)、[执行计划](./os/process/EXECUTION_PLANS.md)、[完成标准](./os/process/DEFINITION_OF_DONE.md)。
- 工程：[架构](./os/architecture/ARCHITECTURE.md)、[ADR](./os/architecture/adr)、[编码](./os/standards/CODING.md)、[测试](./os/standards/TESTING.md)、[安全](./os/standards/SECURITY.md)、[Git](./os/standards/GIT.md)、[文档结构](./os/standards/DOCS.md)。
- 模板：[Story](./os/templates/STORY_TEMPLATE.md)、[Task](./os/templates/TASK_TEMPLATE.md)、[ExecPlan](./os/templates/EXEC_PLAN_TEMPLATE.md)、[场景](./os/templates/SCN_TEMPLATE.md)。

## 开发入口（development）

- 需求：[产品总览](./development/requirements/PRODUCT.md)、[PRD](./development/requirements/PRD.md)、[用户研究](./development/requirements/USER_RESEARCH.md)、[Spec](./development/requirements/specs)、[场景索引](./development/requirements/scenarios/SCENARIOS.md)、[Story 索引](./development/requirements/stories/STORIES.md)。
- 原型与设计：[HTML 原型、设计稿与截图](./development/prototypes/README.md)。
- 交付：从 [BOARD.md](./BOARD.md) 进入 [当前 US-001](./development/delivery/US-001)；任务卡 TASK-编号.md、计划 TASK-编号-plan.md、按序号命名的交接记录直接平铺。Human 关闭后整体移入 [completed/](./development/delivery/completed)，具体规则见 DOCS.md §1.1。
- 独立与既有记录：[任务卡](./development/tasks)、[执行计划](./development/exec-plans)、[问题记录](./development/issues.md)。共享资料通过链接复用。

## 资料入口（handbook）

- 开发：[API 契约](./handbook/technical/API_CONTRACT.md)、[数据模型](./handbook/technical/DATA_MODEL.md)、[前端开发](./handbook/technical/CLIENT_DEV.md)、[调度开发](./handbook/technical/CRON_WORKER_DEV.md)。
- 用户：[客户端操作](./handbook/manual/CLIENT.md)、[业务概念](./handbook/manual/Concept.md)、[后台任务功能介绍](./handbook/manual/CRON_WORKER_PRODUCT.md)。
- 运维：[系统部署](./handbook/ops/DEPLOYMENT.md)、[服务端运行](./handbook/ops/SERVER.md)、[调度总览](./handbook/ops/CRON_WORKER.md)、[调度运维](./handbook/ops/CRON_WORKER_OPS.md)。
- 产品：[产品线总览](./handbook/product/PRODUCT_LINES.md)、[产品线明细](./handbook/product/lines)。
- 项目介绍：[中文项目介绍](./handbook/README.zh-CN.md)。

新增或搬迁文档时同步本索引；同一主题保持一处正文，其余位置链接引用。

仓库配套入口：[项目 README](../README.md)、[client/AGENTS.md](../client/AGENTS.md)、[cron-worker/AGENTS.md](../cron-worker/AGENTS.md)、[server/README.md](../server/README.md)。当前副本已包含这些入口及文档校验脚本的配套修订，迁回真实项目时需与根 AGENTS.md、docs 一并同步；原项目尚未改动。验证方式与文档副本的源码引用说明见 [DOCS.md §5](./os/standards/DOCS.md#5-链接校验)。

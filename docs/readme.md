# PortoMind 文档导航

本页只索引**留在仓库里、不随任务启闭**的资料。需求、Spec、User Story、Task、执行计划、验收证据等过程文档已迁至 **GitHub Issues**（模板见 [`.github/ISSUE_TEMPLATE/`](../.github/ISSUE_TEMPLATE)），不在仓库内维护。

> 正文中若出现 `PRD.md`、`FS-*`、`TASK-*`、`US-*`、`BOARD.md`、`AGENTS.md`、`DOCS.md`、`SECURITY.md` 等裸文件名，是迁移前的历史引用，已不再是可点击的文档。其中 `DOCS.md`（文档结构）与 `SECURITY.md`（安全条款）已删除，相关规则待启用 Claude 后重建。

## 目录结构

```text
docs/
├── readme.md              # 文档导航（本页）
├── architecture/          # 架构真相：分层、边界、技术决策
│   ├── ARCHITECTURE.md
│   ├── PRICE-PIPELINE-REVIEW.md
│   └── adr/               # ADR-001 认证 / ADR-002 单一调度器 / ADR-003 symbol 后缀契约
├── standards/             # 工程规范：编码 / 测试 / Git（文档与安全规则待重建）
├── prototypes/            # 设计稿与交互原型：Ardot 视觉稿、HTML 原型、截图基线
├── handbook/              # 持续维护的系统资料
│   ├── technical/         # API 契约、数据模型、前端与调度开发说明
│   ├── manual/            # 用户手册：界面操作、业务概念
│   ├── ops/               # 运维：部署、服务端、调度、验证命令
│   ├── product/           # 产品功能全景与产品线明细
│   └── README.zh-CN.md    # 中文项目介绍
└── assets/                # 文档公共静态资源
```

`architecture/` 与 `handbook/` 是技术真相层，随系统行为变化持续更新；`standards/` 现存编码、测试、Git 三份工程约束，文档结构与安全规则已删除、待启用 Claude 后重建；`prototypes/` 是设计资产。四者都不随单个任务启闭。

## 快速查找

| 我想找 | 入口 |
|---|---|
| 系统结构、技术栈、模块边界、架构债 | [ARCHITECTURE.md](./architecture/ARCHITECTURE.md) |
| 某个结构性决策「为什么这么做」 | [adr/](./architecture/adr) |
| 编码 / 测试 / Git 规范（文档与安全规则待重建） | [standards/](./standards) |
| 价格链路专项审阅 | [PRICE-PIPELINE-REVIEW.md](./architecture/PRICE-PIPELINE-REVIEW.md) |
| HTTP 接口与响应 | [API_CONTRACT.md](./handbook/technical/API_CONTRACT.md) |
| 数据模型字段、枚举、索引 | [DATA_MODEL.md](./handbook/technical/DATA_MODEL.md) |
| 前端路由、组件、设计 token | [CLIENT_DEV.md](./handbook/technical/CLIENT_DEV.md) |
| 调度引擎与 TaskRun 契约 | [CRON_WORKER_DEV.md](./handbook/technical/CRON_WORKER_DEV.md) |
| 部署、环境变量、安全边界、验证命令 | [DEPLOYMENT.md](./handbook/ops/DEPLOYMENT.md) §7 |
| 界面操作与业务口径 | [CLIENT.md](./handbook/manual/CLIENT.md) |
| 产品功能全景、能力边界 | [PRODUCT_LINES.md](./handbook/product/PRODUCT_LINES.md) |
| 设计稿、7 屏 PNG、全屏 PDF、HTML 原型 | [prototypes/README.md](./prototypes/README.md) |
| 中文项目介绍 | [README.zh-CN.md](./handbook/README.zh-CN.md) |
| 需求 / Spec / US / Task / 计划 / 证据 | GitHub Issues |
| 建单模板 | [.github/ISSUE_TEMPLATE/](../.github/ISSUE_TEMPLATE) |

## 明细入口

- 架构：[架构总览](./architecture/ARCHITECTURE.md)、[ADR-001 认证](./architecture/adr/ADR-001-authentication.md)、[ADR-002 单一调度器](./architecture/adr/ADR-002-single-scheduler.md)、[ADR-003 symbol 后缀契约](./architecture/adr/ADR-003-symbol-suffix-contract.md)、[价格链路审阅](./architecture/PRICE-PIPELINE-REVIEW.md)。
- 规范：[编码](./standards/CODING.md)、[测试](./standards/TESTING.md)、[Git](./standards/GIT.md)。文档结构与安全条款已删除，相关规则待启用 Claude 后重建。
- 开发：[API 契约](./handbook/technical/API_CONTRACT.md)、[数据模型](./handbook/technical/DATA_MODEL.md)、[前端开发](./handbook/technical/CLIENT_DEV.md)、[调度开发](./handbook/technical/CRON_WORKER_DEV.md)。
- 用户：[客户端操作](./handbook/manual/CLIENT.md)、[业务概念](./handbook/manual/Concept.md)、[后台任务功能介绍](./handbook/manual/CRON_WORKER_PRODUCT.md)。
- 运维：[系统部署](./handbook/ops/DEPLOYMENT.md)、[服务端运行](./handbook/ops/SERVER.md)、[调度总览](./handbook/ops/CRON_WORKER.md)、[调度运维](./handbook/ops/CRON_WORKER_OPS.md)、[产品线明细](./handbook/product/lines)。
- 设计：[prototypes/README.md](./prototypes/README.md)。

## 校验

```bash
npm run docs:check        # 扫描 docs/**/*.md、docs/**/*.html 与仓库根 README
npm run docs:check:links  # 兼容别名
```

校验器只检查本地链接、章节锚点与 HTML 资产引用，不校验 Issue 状态、任务卡 Status 或目录生命周期——这些已由 GitHub Issues / Projects 承载。新增或搬迁文档时同步本索引；同一主题保持一处正文，其余位置链接引用。

仓库配套入口：[项目 README](../README.md)、[client/AGENTS.md](../client/AGENTS.md)、[cron-worker/AGENTS.md](../cron-worker/AGENTS.md)、[server/README.md](../server/README.md)。

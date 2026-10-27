# 文档结构规范（DOCS）

> 适用范围：`docs/` 全部文档、仓库根 `README.md`，以及各 workspace 的 `README.md` / `readme.md` / `AGENTS.md`（`client/`、`server/`、`cron-worker/`）。
> 目的：把「文档该放哪、同一主题该写在哪」固化成规则，避免**主题级重复**导致的事实漂移。

## 1. 目录职责

| 目录 | 职责 | 不该放什么 |
|---|---|---|
| `manual/` | 面向人与角色的操作手册（使用者 / 开发者 / 部署者 / 运维） | 需求、架构推导、临时审查产物 |
| `product/` | 产品定义与需求：PRD、产品线、用户研究、路线图；`product/specs/` 放需求规格、`product/lines/` 放各产品线明细 | 实现细节、运维步骤 |
| `product/lines/` | 各产品线的明细子文件：成熟度快评、模块归属、功能评估、功能点清单、架构实现明细（在单一产品线内自洽） | 跨线总览（放 `product/PRODUCT_LINES.md`） |
| `architecture/` | 系统结构：架构分层、ADR（`architecture/adr/`） | 操作步骤、需求原文、功能全景（已归 `product/lines/`） |
| `archive/` | 已归档、不再维护的历史文档（仅留存与追溯，文首须标注归档与失效条件） | 现行有效的文档 |
| `dev/` | 对外/对内接口契约（`API_CONTRACT.md`）、组件开发文档（如 `CRON_WORKER_DEV.md`） | 业务流程叙述、运维步骤、业务操作 |
| `standards/` | 强制约定：编码、Git、安全、测试、**文档结构** | 一次性决策、教程 |
| `process/` | 工作流程（执行计划等） | 具体任务内容 |
| `tasks/` | 任务清单与任务单（`tasks/active/` 进行中、`tasks/complete/` 已完成） | 需求原文 |
| `templates/` | 空白模板 | 已填写的实例 |
| `agents/` | Agent 角色定义 | 业务文档 |
| `exec-plans/` | 执行计划归档（`active/`、`complete/`） | 长期有效文档 |

**索引**：`docs/readme.md` 是 `docs/` 的**唯一索引入口**；新增目录或文档时必须同步登记。

**任务 / ExecPlan 生命周期**：任务单与 ExecPlan 都沿用 `active/` → `complete/` 两段目录。完成后**移动**（不是复制）到 `complete/`，并在 `docs/tasks/TASKS.md` 的 Done 表补一行；文内所有指向它们的链接必须同步更新为新路径。

## 2. 单一归属规则（核心）

> **每个主题只在一处详述；其余文档只写一句话结论 + 链接。**

这样做的原因是：同一主题在多处重复书写时，改动容易漏改，最终产生「文档说 A、代码是 B」的**事实漂移**。

### 2.1 手册的归属边界

| 文档 | 唯一负责 | 不再涉及 |
|---|---|---|
| `manual/CLIENT.md` | 面向使用者的**界面业务操作**、界面手动入口、业务数据口径、常见问题 | 环境变量、安装步骤、调度内部机制、API 端点、安全边界 |
| `manual/SERVER.md` | **server 进程**：运行/端口/日志、手动 API 端点、专属排障 | 界面操作、调度机制、环境变量全表、安全边界细则 |
| `manual/CRON_WORKER.md` | **cron-worker 总览（入口）**：进程模型、五大任务功能地图、三视角导航 | 三视角子文档已分拆，本文件只做入口 |
| `manual/CRON_WORKER_OPS.md` | **cron-worker 运维**：安装/配置/启动/关闭/自检、CLI 手动入口、监控巡检、故障排查 | 调度引擎实现、TaskRun 契约、业务操作 |
| `manual/CRON_WORKER_PRODUCT.md` | **cron-worker 产品介绍（非 PRD）**：五大任务功能介绍、数据质量程序价值、launchDate 意义、使用者须知 | 实现细节、安装步骤、运维命令 |
| `dev/CRON_WORKER_DEV.md` | **cron-worker 开发**：调度引擎工厂、再平衡单日分发、两层防重、TaskRun 契约（taskName/runKey/status/退出码）、launchDate 暴露、新增调度器、目录结构 | 业务操作、运维步骤 |
| `dev/DATA_MODEL.md` | **数据模型**：`shared/models/` 全部模型的字段、枚举、默认值、索引、跨模型引用、已知契约缺口、常用查询模式 | 业务流程与口径、HTTP 接口定义、连接与备份 |
| `dev/CLIENT_DEV.md` | **前端开发**：目录结构、路由与 `ROUTES` 常量、TanStack Query 数据层、service 层、组件清单、设计 token、新增页面标准动作 | 界面怎么用（→ `manual/CLIENT.md`）、业务口径、后端契约 |
| `manual/DEPLOYMENT.md` | **系统部署与运行**：系统架构、本地开发搭建、生产部署（构建/PM2/Nginx/上线检查）、**环境变量全表**、**验证与测试命令**、**安全边界**、**备份与迁移** | 业务操作、完整性检查原理、调度内部机制 |
| `architecture/ARCHITECTURE.md` | **系统架构**：架构风格与结构决定、**技术栈**、**外部集成（数据源与容错）**、模块边界与依赖规则、数据流、持久化架构、架构约束、**已知架构债** | 端点清单（→ `API_CONTRACT`）、模型字段表（→ `DATA_MODEL`）、部署步骤与运维命令（→ `DEPLOYMENT` / `CRON_WORKER_OPS`）、功能全景（→ `product/`） |

### 2.2 主题归属速查

| 主题 | 唯一归属 | 其他文档的做法 |
|---|---|---|
| 系统总览 / 三进程+shared 架构 | `manual/DEPLOYMENT.md` §1 | 一句话 + 链接；架构风格与模块边界另见 `architecture/ARCHITECTURE.md` §1 / §4 |
| 本地环境搭建（`.env` / `npm ci` / 基线数据 / 启动 / 端口） | `manual/DEPLOYMENT.md` §3/§5 | 一句话 + 链接 |
| 验证与测试命令（`test`/`validate`/`verify`/`lint`/`build`） | `manual/DEPLOYMENT.md` §7 | 引用，不复制命令 |
| 生产部署（构建 / PM2 / Nginx / 上线检查） | `manual/DEPLOYMENT.md` §6 | 一句话 + 链接 |
| 环境变量（三份 `.env` 全表） | `manual/DEPLOYMENT.md` §4 | 各组件手册只列必需项 + 链接 |
| 安全边界（无认证 / CORS / 日志脱敏） | `manual/DEPLOYMENT.md` §9 | README 与 CLIENT 一句话 + 链接 |
| 账号与访问控制的需求形态（角色矩阵 / 页面 / Non-goals） | `product/specs/FS-authentication.md` | 只写一句 + 链接 |
| 账号与访问控制的技术决策（会话 / 哈希 / 为何不用 JWT） | `architecture/adr/ADR-001-authentication.md` | 只写一句 + 链接 |
| 备份与迁移 | `manual/DEPLOYMENT.md` §10 | 链接 |
| 调度所有权与 5 类定时任务清单 | `manual/CRON_WORKER.md` §2（功能地图） | 一句话 + 链接 |
| 定时任务时间表 | `manual/CRON_WORKER.md` §2 | CLIENT 可保留一句话 + 链接 |
| 五大任务功能介绍（解决什么/产出什么，非 PRD） | `manual/CRON_WORKER_PRODUCT.md` §2/§3 | 链接 |
| 再平衡单日分发规则（SCHEDULE_DUE_RULES） | `dev/CRON_WORKER_DEV.md` §3 | 一句话 + 链接 |
| 调度引擎通用工厂 | `dev/CRON_WORKER_DEV.md` §2 | 一句话 + 链接 |
| 两层防重 | `dev/CRON_WORKER_DEV.md` §4 | 一句话 + 链接 |
| 价格同步 / 完整性检查 / 历史回补（数据质量程序） | `manual/CRON_WORKER_PRODUCT.md` §3（功能）/ `manual/CRON_WORKER_OPS.md` §6（手动触发） | 链接 |
| TaskRun 防重与任务 `status` 含义（契约） | `dev/CRON_WORKER_DEV.md` §5 | 运维解读见 `CRON_WORKER_OPS.md` §7 |
| 命令行手动入口（sync:prices / sync:history / check:integrity） | `manual/CRON_WORKER_OPS.md` §6 | 链接 |
| 界面业务操作（资产/组合/交易/再平衡/提醒/家庭视图/日志） | `manual/CLIENT.md` §3 | 链接 |
| 界面手动入口（按钮） | `manual/CLIENT.md` §4 | SERVER/CRON_WORKER 只列各自端点 |
| 业务口径（成本法 / 分红 / 整手 / 目标 100% / 跨币种） | `manual/CLIENT.md` §5（PRD 为需求基线，不重复） | 链接 |
| server 手动 API 端点（curl） | `manual/SERVER.md` §5 | 链接 |
| 数据模型（字段 / 枚举 / 默认值 / 索引 / 跨模型引用） | `dev/DATA_MODEL.md` | 其他文档只引用字段名与语义，**不复制字段表** |
| 前端路由 / 组件清单 / hooks / service / 设计 token | `dev/CLIENT_DEV.md` | 产品线与手册只链接，不列实现清单 |
| 功能全景与能力边界 | `product/lines/`（各产品线子文件）；总览 `product/PRODUCT_LINES.md` | 其他文档链接 |
| 技术栈（各层框架与主要依赖、版本口径） | `architecture/ARCHITECTURE.md` §2 | 其他文档只写「见架构文档」，不列依赖表 |
| 外部集成（行情/汇率数据源、端点、容错与数据源路由） | `architecture/ARCHITECTURE.md` §3 | 产品线/手册只写「数据从哪来」，不复述端点与重试策略 |
| 模块边界与依赖规则、架构约束、架构债 | `architecture/ARCHITECTURE.md` §4 / §7 / §8 | 其他文档引用，不重列 |

## 3. 写作规则

1. **不写会漂移的硬数字**：如测试用例数、覆盖率、依赖精确版本。改为「以 `npm test` 实际输出为准」；带日期的历史数量只放在 PRD 的需求状态条目里。
2. **配置/行为描述必须与代码对账**：涉及开关、默认值、端点的陈述，改文档前先看源码。当前不生效的配置要**明确标注「不生效」**并说明原因（例：`server/app.js` 读 `CORS_ORIGINS` 构造了 `allowedOrigins`，但使用它的白名单 `cors()` 被整段注释，最终走 `cors({origin:true})` → **读了不生效**。注意别说成「未被读取」——两者成因与修法不同）。
3. **文档间链接用相对路径**，且必须指向真实存在的文件。
4. **搬迁文件时必须同步更新所有引用方**：`docs/readme.md`、根 `README.md`、以及任何指向它的手册。
5. **临时审查产物**放进 `manual/` 时须在文首标注「临时」与失效条件，落地后删除。

## 4. 提交前检查清单

- [ ] 新增/搬迁文档已登记到 `docs/readme.md`。
- [ ] 文内相对链接全部可解析（见 §5 校验脚本）。
- [ ] 该主题此前若已在别处详述，已改为「一句话 + 链接」而非再次复制。
- [ ] 没有引入会随时间漂移的硬数字。
- [ ] 涉及的配置/端点已与当前代码对账。

## 5. 链接校验

提交前跑一次全量相对链接校验（扫描 `docs/**/*.md`、根 `README.md` 与各 workspace 的 `README.md` / `readme.md` / `AGENTS.md`）：

```bash
python - <<'PY'
import os, re
root = "."
files = [os.path.join(root, "README.md")]
for base, dirs, names in os.walk("docs"):
    dirs[:] = [d for d in dirs if d != "node_modules"]
    files += [os.path.join(base, n) for n in names if n.endswith(".md")]
for extra in ["client/README.md", "client/readme.md", "client/AGENTS.md",
              "server/README.md", "server/readme.md", "server/AGENTS.md",
              "cron-worker/README.md", "cron-worker/readme.md", "cron-worker/AGENTS.md",
              "shared/README.md", "shared/AGENTS.md"]:
    if os.path.exists(extra): files.append(extra)
rx = re.compile(r'\[[^\]]*\]\(([^)]+)\)')
bad = 0; total = 0
for f in files:
    txt = open(f, encoding="utf-8").read()
    for m in rx.finditer(txt):
        t = m.group(1).strip()
        if t.startswith(("http://", "https://", "#", "mailto:")): continue
        p = t.split("#")[0].split("?")[0].strip()
        if not p: continue
        total += 1
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), p))):
            bad += 1
            print(f"{f}:{txt[:m.start()].count(chr(10))+1} -> {t}")
print(f"相对链接 {total} 条，失效 {bad} 条")
PY
```

目标：**失效 0 条**。

> Windows 注意：`README.md` 与 `readme.md` 在同一目录下是**同一个文件**，不要当成两份分别维护。

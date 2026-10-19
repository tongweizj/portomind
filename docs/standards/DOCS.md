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
| `dev/` | 对外/对内接口契约（`API_CONTRACT.md`） | 业务流程叙述 |
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
| `manual/CRON_WORKER.md` | **cron-worker 进程**：调度所有权与 5 类任务清单、调度引擎、再平衡分发、防重、数据质量程序（价格同步/完整性检查/历史回补）、CLI 手动入口、TaskRun/监控/排障、新增调度器 | 业务操作、本地环境搭建、部署步骤 |
| `manual/DEPLOYMENT.md` | **系统部署与运行**：系统架构、本地开发搭建、生产部署（构建/PM2/Nginx/上线检查）、**环境变量全表**、**验证与测试命令**、**安全边界**、**备份与迁移** | 业务操作、完整性检查原理、调度内部机制 |

### 2.2 主题归属速查

| 主题 | 唯一归属 | 其他文档的做法 |
|---|---|---|
| 系统总览 / 三进程+shared 架构 | `manual/DEPLOYMENT.md` §1 | 一句话 + 链接 |
| 本地环境搭建（`.env` / `npm ci` / 基线数据 / 启动 / 端口） | `manual/DEPLOYMENT.md` §3/§5 | 一句话 + 链接 |
| 验证与测试命令（`test`/`validate`/`verify`/`lint`/`build`） | `manual/DEPLOYMENT.md` §7 | 引用，不复制命令 |
| 生产部署（构建 / PM2 / Nginx / 上线检查） | `manual/DEPLOYMENT.md` §6 | 一句话 + 链接 |
| 环境变量（三份 `.env` 全表） | `manual/DEPLOYMENT.md` §4 | 各组件手册只列必需项 + 链接 |
| 安全边界（无认证 / CORS / 日志脱敏） | `manual/DEPLOYMENT.md` §9 | README 与 CLIENT 一句话 + 链接 |
| 备份与迁移 | `manual/DEPLOYMENT.md` §10 | 链接 |
| 调度所有权与 5 类定时任务清单 | `manual/CRON_WORKER.md` §3 | 一句话 + 链接 |
| 定时任务时间表 | `manual/CRON_WORKER.md` §3 | CLIENT 可保留一句话 + 链接 |
| 再平衡单日分发规则 | `manual/CRON_WORKER.md` §3.2 | 一句话 + 链接 |
| 价格同步 / 完整性检查 / 历史回补（数据质量程序） | `manual/CRON_WORKER.md` §5 | 链接 |
| TaskRun 防重与任务 `status` 含义 | `manual/CRON_WORKER.md` §4 | 链接 |
| 命令行手动入口（sync:prices / sync:history / check:integrity） | `manual/CRON_WORKER.md` §6 | 链接 |
| 界面业务操作（资产/组合/交易/再平衡/提醒/家庭视图/日志） | `manual/CLIENT.md` §3 | 链接 |
| 界面手动入口（按钮） | `manual/CLIENT.md` §4 | SERVER/CRON_WORKER 只列各自端点 |
| 业务口径（成本法 / 分红 / 整手 / 目标 100% / 跨币种） | `manual/CLIENT.md` §5（PRD 为需求基线，不重复） | 链接 |
| server 手动 API 端点（curl） | `manual/SERVER.md` §5 | 链接 |
| 功能全景与能力边界 | `product/lines/`（各产品线子文件）；总览 `product/PRODUCT_LINES.md` | 其他文档链接 |

## 3. 写作规则

1. **不写会漂移的硬数字**：如测试用例数、覆盖率、依赖精确版本。改为「以 `npm test` 实际输出为准」；带日期的历史数量只放在 PRD 的需求状态条目里。
2. **配置/行为描述必须与代码对账**：涉及开关、默认值、端点的陈述，改文档前先看源码。当前不生效的配置要**明确标注「不生效」**并说明原因（例：`CORS_ORIGINS` 未被读取）。
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

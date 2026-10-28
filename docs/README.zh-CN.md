# PortoMind（中文说明）

> 自托管的家庭投资组合管理系统 —— 投资账本、多市场行情、目标配置、再平衡建议、跨币种家庭汇总。本地运行；以清晰的模块化 monorepo 构建。

![PortoMind Logo](./logo.png)

PortoMind 把「我买了什么 / 现在值多少 / 离目标差多少 / 该不该调」这几件事——原本散落在表格、券商 App 和行情网站里的手工拼凑——收成**一个每天自动更新、口径唯一、可从家庭层逐层下钻到单只标的的本地系统**。

- 🇬🇧 **English README**：[../README.md](../README.md)
- 📚 **文档总索引**：[readme.md](./readme.md)

---

## ✨ 技术亮点（给工程师看）

> 这个项目在技术上的核心看点，一句话总结。

- **模块化 monorepo（npm workspaces）** —— 一个共享业务内核 `shared/` + 三个薄外壳：React 前端、REST API、调度 Worker。业务规则只存在**一处**。
- **清晰的架构边界** —— 严格的依赖方向；API 进程**零**定时任务，Worker **零**业务规则，前端**零**金融计算。
- **单一调度决策（ADR-002）** —— 全部 5 类定时任务只在 `cron-worker`；手动触发与定时触发调用**同一函数**，行为永不漂移。
- **容错的行情采集** —— 统一的超时 + 重试 + 错误归一层，按市场路由数据源（美股/加股/港股、A 股、场外基金、汇率），逐资产故障隔离。
- **「缺价不猜」** —— 缺失的价格/汇率记为 `null`，绝不按 `0`；整条链路宁可显示「—」，也不给一个看似正常的错数字。
- **可观测的调度** —— 每次运行都是一条 `TaskRun` 记录（防重 + 状态）；只读聚合接口暴露运行健康度；结构化日志跨进程共享。
- **工程化而非堆代码** —— Conventional Commits + PR 工作流、ADR 决策记录、测试规范、以及「文档即代码」的单一归属体系。

---

## 📌 它是什么

PortoMind 是一个**家庭 ETF / 基金 / 股票组合账本 + 决策辅助系统**。三个互相独立的组合（CN-稳钱 / CN-长钱 / CA-长钱）之上再有一层家庭级人民币视图。

| 它是 | 它不是 |
|---|---|
| 家庭投资组合账本 | 券商或下单通道 |
| 目标配置与偏离的监控器 | 消费 / 记账 App |
| 再平衡**建议器**（先卖后买清单） | 自动交易机器人（AUTO 只出建议） |
| 站内提醒中心（到期 / 偏离 / 估值） | 多用户 SaaS（暂无登录、仅可信网络） |
| 家庭人民币口径汇总层 | 行情终端 |

三条不可让渡的产品边界决定了架构形态：

1. **绝不下单** —— AUTO 再平衡只产出建议 + 提醒，执行永远由人点。
2. **缺价不猜** —— 估值字段为 `null`，绝不按 `0` 计。
3. **只有家庭层折算** —— 组合内不跨币种加总；汇率与价格同为可信前提。

---

## 🧩 功能全景

功能按 7 条产品线组织，对照三条价值主线评估：*记得准* · *看得清* · *动得对*。

| 领域 | 能力 |
|---|---|
| **投资账本（PL-1）** | 资产 CRUD、交易 CRUD（买入/卖出/现金分红/分红再投）、移动平均成本持仓引擎、**CSV 批量导入**、做空/超卖校验 |
| **行情数据（PL-2）** | 日价格幂等同步（Yahoo/东方财富/天天基金）、历史价格查询、完整性检查与自动回补、估值分位 |
| **组合与配置（PL-3）** | 组合目标配置（资产级/大类级）、总览与历史、偏离可视化、归档 |
| **再平衡决策（PL-4）** | 绝对偏离 + 相对偏离 + 时间间隔三判据 → 先卖后买建议 → 确认 → 内部交易（**可撤销/重做**）；AUTO 仅建议 |
| **提醒与通知（PL-5）** | 8 类规则（到价/盈亏/漂移/52 周高低/估值/人工），每日跑批产生站内事件 |
| **家庭总览（PL-6）** | 人民币家庭总资产、CNY/USD/CAD/HKD 分桶、组合贡献、最近动态（汇率自动采集 + 手动兜底） |
| **平台基座（PL-0）** | 单一调度、数据质量程序、可观测性、设计一致性 |

## 🖼 产品一览
### 首屏

![仪表盘 — 主页](ui/en/en-dashboard.png)

*家庭总资产、组合健康表（按「有事的在上」排序）、实时提醒流。*

### 组合与配置

![组合列表](ui/en/en-portfolio-list.png)

*每个组合一张卡片，带漂移徽标、市值、待办、上次再平衡日期。*

### 再平衡

![组合总览](ui/en/en-portfolio-overview.png)
![再平衡建议](ui/en/en-rebalance.png)

*总览 KPI + 目标 vs 实际，再给出先卖后买的建议，由你确认（绝不自动执行）。*

### 账本

![持仓](ui/en/en-portfolio-positions.png)
![交易](ui/en/en-transactions.png)

*持仓表与跨组合交易账本（支持 CSV 批量导入）。*

### 行情数据

![标的](ui/en/en-instruments.png)
![价格历史](ui/en/en-price-history.png)

*标的主数据（资产元数据）与价格历史 —— 驱动所有上游视图的唯一事实来源。*

---

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| **前端** | React 19 · Vite 6 · React Router 7 · TanStack Query 5 · Recharts · Tailwind CSS 4 · lucide-react |
| **共享内核** | Node.js（CommonJS）· Mongoose 6 · axios · dayjs · winston（+ 按天滚动文件） |
| **API** | Node.js · Express 4 · cors · express-async-handler · uuid · dotenv |
| **调度** | Node.js（CommonJS）· node-cron 4 · p-limit · minimist · dotenv |
| **持久化** | MongoDB（单实例；API 与 Worker 共用；Mongoose ODM） |
| **包管理** | npm workspaces（4 个包：`shared` / `server` / `cron-worker` / `client`） |
| **测试** | Node.js 内置 `node --test` —— 19 个 HTTP 集成测试（`server`）+ 11 个单元/调度测试（`cron-worker`） |

---

## 🏛 架构

**模块化单体**：一个共享业务内核，三个只「触发」或「服务」、绝不拥有业务逻辑的进程。

```text
        ┌─────────────┐
        │   client    │  React SPA（只做呈现与交互）
        │   (Vite)    │
        └──────┬──────┘
               │  HTTP（axios）
               ▼
        ┌─────────────┐         ┌──────────────────────┐
        │   server    │  REST   │     cron-worker       │  调度（无端口）
        │  (Express)  │◄────────┤  node-cron · 5 任务    │
        └──────┬──────┘  共享   │  （只持有触发权）       │
               │       DB/日志  └──────────┬───────────┘
               ▼                          ▼
        ┌──────────────────────────────────────────────┐
        │        @portomind/shared  （唯一内核）          │
        │  models · services · tasks · fetchers · utils  │
        └──────────────────────────┬───────────────────┘
                                   ▼
                          ┌──────────────┐
                          │   MongoDB    │   唯一事实来源
                          └──────────────┘
```

**依赖方向（强制）：**

```text
client ──HTTP──> server ──┐
                          ├──> @portomind/shared ──> MongoDB
cron-worker ──────────────┘
```

- `client` 只经 HTTP 与 `server` 通信；绝不直连数据库或 `shared`。
- `server` 与 `cron-worker` 互不感知 —— 只通过共享数据库与 `shared/` 协作。
- `shared` 对任一外壳**零**反向引用（无 `process.exit`、不读 CLI 参数、不注册信号）。
- 跨包引用走包名 `@portomind/shared/...`，不用相对路径穿透 workspace。

**外部集成（全部出站、只读）：**

| 来源 | 覆盖市场 | 用途 |
|---|---|---|
| Yahoo Finance | 美股 / 加股（`.TO`）/ 港股（`.HK`） | 行情 |
| 东方财富 | A 股场内（`CN-SH` / `CN-SZ`） | 行情 + K 线历史 |
| 天天基金 | 场外基金（`CN-FUND`） | 基金净值 |
| er-api | USD / CAD / HKD → CNY | 汇率 |

---

## ⚙️ 工程实践

这些是让代码库作为长期个人项目可维护、也最值得在评审中展示的部分：

- **单一事实来源** —— 全部业务规则、模型、抓取器只在 `shared/` 实现一次；两个后端加载同一份代码。出现第二份拷贝即视为缺陷。
- **决策记录（ADR）** —— 结构性选择（如单一调度）在改代码前先写下来，而非事后补。
- **可观测性内建** —— 调度经 `TaskRun` 防重 + 状态追踪；日志跨进程共享；只读接口暴露运行健康度。
- **容错即库** —— 统一的超时/重试/错误归一层包裹每次外部调用；逐资产故障隔离，一个坏标的不会拖垮整轮同步。
- **用测试证明行为** —— API 的 HTTP 集成测试、Worker 的单元/调度测试，遵循成文测试规范（行为优于实现、按风险定深度、缺陷补回归测试）。
- **Conventional Commits + PR 工作流** —— `feat(scope):` / `docs(...)` / `feat(TASK-054):` 风格提交，在 `feature/TASK-xxx` 分支上开发，经 Pull Request 合入。
- **文档即代码** —— 文档遵循单一归属规则（每主题只在一处详述、其余只交叉引用），随代码演进保持一致性。

---

## 🚀 快速开始

需要 **Node.js 24**、**npm** 和 **MongoDB**。

```bash
cp server/.env.example server/.env
cp client/.env.example  client/.env
cp cron-worker/.env.example cron-worker/.env

npm ci                                      # 一次安装全部 workspace
npm run seed:baseline --workspace server    # 载入基线数据
npm run dev:server                          # API 在 :8080
npm run dev:client                          # SPA 在 :5173
npm run dev:worker                          # 调度进程（可选）
```

验证：

```bash
npm test                  # 全部 workspace
npm run test:server
npm run test:worker
```

完整搭建、生产部署（PM2 + Nginx）、环境变量全表与安全说明见 [系统部署手册](./manual/DEPLOYMENT.md)。

---

## 📊 项目状态与路线图

**当前已扎实**：账本 → 成本引擎 → 配置 → 再平衡 → 提醒 → 家庭汇总的完整闭环可用；多市场行情采集与数据质量程序已就位；代码架构 disciplined。

**已知缺口（如实列出，不隐藏）：**

- 暂无认证/授权 —— API 仅适合可信内网（CORS 当前全开；收紧是公开前置条件）。
- 无数据库事务 / TTL / 迁移框架 —— 跨集合写入依赖服务层顺序与幂等键。
- 汇率采集方向错误、`symbol` 归一化等是已登记的技术债。

**下一步（按优先级）**：先修信任底线（认证 + CORS），再补决策闭环最后一公里（导入批次撤销、数据质量看板），最后体验打磨。详细评估见 [PRODUCT_LINES.md](./product/PRODUCT_LINES.md)。

---

## 📚 文档

| 文档 | 读者 |
|---|---|
| [文档总索引](./readme.md) | 一切入口 |
| [客户端手册](./manual/CLIENT.md) | 界面怎么用 |
| [服务端手册](./manual/SERVER.md) | API 进程、手动端点 |
| [cron-worker（总览 / 运维 / 产品 / 开发）](./manual/CRON_WORKER.md) | 调度进程三视角 |
| [部署手册](./manual/DEPLOYMENT.md) | 本地开发、生产、环境变量、安全 |
| [架构总览](./architecture/ARCHITECTURE.md) | 技术栈、边界、数据流、ADR |
| [API 契约](./dev/API_CONTRACT.md) · [数据模型](./dev/DATA_MODEL.md) · [前端开发](./dev/CLIENT_DEV.md) | 开发者参考 |
| [产品线总览](./product/PRODUCT_LINES.md) | 功能全景与路线图 |

---

## 📄 许可证

本项目基于 [MIT 许可证](../LICENSE) 发布。

---

<p align="center">
  🇬🇧 English version: <a href="../README.md">README.md</a>
</p>

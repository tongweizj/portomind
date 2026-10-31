# cron-worker 使用手册（总览）

> 本文件是 cron-worker 文档的**入口与总览**。同一主题按读者视角拆成三份子文档，互不重复、互相交叉引用：
>
> | 视角 | 文档 | 负责的内容 |
> |---|---|---|
> | 运维 | [cron-worker 运维手册](./CRON_WORKER_OPS.md) | 安装 / 启动 / 关闭 / 手动触发 / 监控巡检 / 故障排查 |
> | 产品 | [cron-worker 产品介绍](../manual/CRON_WORKER_PRODUCT.md) | 每个后台任务是什么、解决什么问题、产出什么（**非 PRD**） |
> | 开发 | [cron-worker 开发文档](../technical/CRON_WORKER_DEV.md) | 调度引擎 / 再平衡分发算法 / 两层防重 / TaskRun 契约 / 如何新增调度器 |
>
> 进程的生产部署（PM2 / Nginx / 上线检查 / 备份 / 安全边界）与**环境变量完整表**见 [系统部署手册](./DEPLOYMENT.md)；
> 界面操作见 [client 使用手册](../manual/CLIENT.md)；API 手动端点见 [server 使用手册](./SERVER.md)。

---

## 1. 这是什么

`cron-worker` 是 PortoMind 的**唯一调度进程**。

纯 Node（CommonJS），**没有 Web 框架、不监听端口**，唯一职责是按时间表触发后台任务。

架构决策见 ADR-002（单一调度器）。

进程模型（三进程 + 一代码库）：

```text
  server      → Express API，监听端口，**不注册任何 cron**（TASK-005 后已收口）
  cron-worker → 唯一调度所有者，注册全部 5 类定时任务 + 提供 CLI 手动入口
  shared      → 代码库（不是进程），承载全部业务内核（models/services/tasks/fetchers…）
  client      → 前端 SPA
```

**关键认知**：cron-worker 只持有「触发权」，不复制业务能力。

5 类任务的业务引擎都在`@portomind/shared`，cron-worker 与 server 的手动端点走**同一份函数**（手动触发见[运维手册 §6](./CRON_WORKER_OPS.md#6-命令行手动入口)；

引擎实现见[开发文档 §2](../technical/CRON_WORKER_DEV.md#2-调度引擎通用工厂)）。

---

## 2. 五大定时任务功能地图

全部由 `src/tasks/scheduler.js` 注册，任一时区 / 周期都可经对应环境变量覆盖。
「每个任务解决什么问题、跑出什么结果」的详细说明见 [产品介绍](../manual/CRON_WORKER_PRODUCT.md)。

| # | 任务 | 默认时间 | 调度器文件 | 做什么（一句话） |
|---|---|---|---|---|
| 1 | 价格同步 | 03:00 | `schedulers/priceScheduler.js` | 拉取全部激活资产的最新价入库 |
| 2 | 完整性检查 | 03:30 | `schedulers/healthScheduler.js` | 核对价格缺口，必要时自动补全 |
| 3 | 提醒评估 | 04:00 | `schedulers/alertScheduler.js` | 评估提醒规则、产生提醒事件 |
| 4 | 汇率同步 | 09:30 | `schedulers/fxScheduler.js` | 采集 USD / CAD / HKD → CNY 汇率 |
| 5 | 再平衡分发 | 00:00 | `schedulers/rebalanceScheduler.js` | 按组合设置生成再平衡建议 + 提醒 |

数据更新链路（全部由本进程触发）：

```text
每日 00:00  再平衡分发 → 按各组合 rebalanceSchedule 判断是否到期，执行阈值检查 → 建议 → 提醒
每日 03:00  价格同步 → dailySync 拉取激活资产最新价入库
每日 03:30  完整性检查 → 缺口自动调 historySync 补全
每日 04:00  提醒评估 → 提醒规则评估
每日 09:30  汇率同步 → 汇率采集
执行留痕    taskruns 集合（TaskRun）+ logs/task-YYYY-MM-DD.log
```

---

## 3. 三视角导航

- **我是运维 / 部署者**，要装好、跑起来、能监控、会排障 →
  [cron-worker 运维手册](./CRON_WORKER_OPS.md)
- **我是使用者 / 产品**，想知道这些后台任务对我意味着什么 →
  [cron-worker 产品介绍](../manual/CRON_WORKER_PRODUCT.md)
- **我是开发者**，要理解调度怎么实现、怎么加一个新调度器 →
  [cron-worker 开发文档](../technical/CRON_WORKER_DEV.md)

---

## 4. 相关文档

- [cron-worker 运维手册](./CRON_WORKER_OPS.md) — 安装 / 启动 / 关闭 / 手动触发 / 监控 / 排障
- [cron-worker 产品介绍](../manual/CRON_WORKER_PRODUCT.md) — 任务功能介绍（非 PRD）
- [cron-worker 开发文档](../technical/CRON_WORKER_DEV.md) — 调度引擎 / 防重 / TaskRun 契约 / 新增调度器
- [server 使用手册](./SERVER.md) — API 进程、手动 API 端点
- [client 使用手册](../manual/CLIENT.md) — 界面业务操作
- [系统部署手册](./DEPLOYMENT.md) — 安装 / 启动 / 生产部署 / 环境变量 / 安全边界 / 备份
- [ADR-002 单一调度器](../../os/architecture/adr/ADR-002-single-scheduler.md) — 架构决策与备选方案
- [API 契约](../technical/API_CONTRACT.md) — REST API 详细定义

# TASK-053 — US-001 实施计划

## Status

Status：Approved

Owner：Planner（本轮已完成规划草案；实施者及独立Reviewer待指派）

Related Task：[TASK-053](./TASK-053.md)；所属 [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)。

Branch / Base：2026-10-30 启动核对确认真实源码目录为 D:/projects/portomind，当前分支 chore/agent-rules-refactor；HEAD、本地 main、缓存 origin/main 均为 2bde9131b8d47e4460ce9f87ea801839e37e1f7f。feature/TASK-053 尚不存在，独立实施目录尚未就绪；本轮未 fetch、切分支、创建 worktree 或改动源码。详见 §10。

Approval：2026-10-30，Human 在本 chat 明确：“我批准 TASK-053 当前 Draft 的设计，批准范围仅限 TASK-053，不包含其他任务或 D-01～D-04 的待决方案。”本记录由 Orchestrator 按该 Human 决定登记 Draft → Approved，不是 Orchestrator 自行批准。批准的 §1～§9 设计未改变；其 UTF-8/LF 摘要 SHA256 为 422ceff1f595304fa87c767b1f74eb669eae08bbabe58cfdb1f27ab9df2c20be。Approved 不代表已经启动实施。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task 的 §3，逐条引用该节、不增删改；覆盖 US-001/AC-01、02、07、10、11（骨架）。验证映射见 §7。当前计划不允许实现US-001范围外的P1/P2功能、调度控制或既有汇率方向修复。

## 2. Context

需求、任务和未决项见 [Planner回交](./US-001-02-planner-return.md)。本任务需 ExecPlan：跨组件数据/导航或状态逻辑，保留原卡计划要求。不新增审批层。

## 3. Repository Findings

本轮只读源码核实位置、SHA256和证据边界见 [回交 §2](./US-001-02-planner-return.md)。未连接数据库、未执行应用/测试或DDL；部署Mongo版本、实际索引/集合与当前数据库数据均未核实。054历史测试日志只作既有证据，不能当成本次运行。

## 4. Proposed Design

重构 client/src/pages/LogViewer.jsx 为URL驱动的三个tab：board默认、server、task；优先复用既有路由search参数方法，验证参数保留和前进后退，不用额外顶级导航。原日志分页、日期、级别加载逻辑隔离为可复用视图或保留原组件分支，切换原日志时保持原有分页重置行为。

在 components/CronStatus/ 提供 BoardShell、SummaryShell、五个固定槽位以及显式unknown占位；本卡不发聚合数据请求。063后续填真实数据、总览和刷新；056插入图例，055填价格槽。只声明展示props，不把字段缺失默认成绿色或0。053原始日志错误和看板区域相互隔离，不创建/logs/rebalance。

只读检测限定/logs组件树，避免把应用其他域合法的mutation当缺陷。原始日志自动请求应只由对应tab激活；待D-04通过后063负责全看板请求错误。

## 5. Work Breakdown

- [ ] W1：记录原日志tab分页/筛选行为及query回退，梳理可保留组件边界。
- [ ] W2：实现三个tab与URL双向同步、统一shell及五槽unknown状态。
- [ ] W3：保持两个日志请求独立，公开与063/055/056的展示插槽与参数契约。
- [ ] W4：准备原日志前后对照、URL刷新/历史、占位/错误与只读检查；记录实施偏差。

## 6. Decisions

无需新产品选择；保持原Task范围。骨架不等于五卡数据完成，不能吞并063。若发现必须改变原始日志行为或原AC，交PM/Human。

决定详情与选项见回交 §4。Human批准前不得开始代码实施；有未决内容影响的分支不得按推荐值擅自实现。

## 7. Verification

以下为未来验收设计，未运行。适用命令入口见 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)，不以历史数量作为预期。每条AC均有映射：

| Task AC | 验证方法与期望 |
|---|---|
| AC1、AC2 | 浏览器直接进入无参数/三个tab/无效参数，刷新与前进后退对应正确tab；不新增侧栏项。 |
| AC3、AC4 | 恰好五灯/一卡总览/快照位与五卡区域；无数据全部unknown，无NaN/undefined/Invalid Date。 |
| AC5 | 同样日期/级别/分页输入对照原行为；改动前后记录可复用结果。 |
| AC6 | 限定组件树代码检查与DOM无写入口，夹具注入假执行按钮使断言失败。 |
| AC7 | 看板占位/错误不影响原日志；后续063共享请求失败与该AC一起集成验证。 |
| AC8 | 执行client build及适用lint入口，保存实际结果，不运行生产服务。 |

同基线有效证据可复用；只对新增/关键断言补负向对照，在临时副本或夹具操作，不污染被审实现。验证失败不得改断言掩盖实现问题。

## 8. Risks

URL同步死循环、残留query覆盖原日志选择、组件重构引起分页回归；以query和原日志对照覆盖。

## 9. Rollback

撤回本任务前端提交即可；无数据库变更。合并前确认没有把063新props依赖一并撤坏。

## 10. Implementer Handoff

### 10.1 启动核对结果

2026-10-30，Orchestrator 根据 Human 本轮指令完成以下只读核对。结论：设计批准有效、053 的产品与技术范围可独立实施，但实施工作区尚未就绪，Task 保持 Planning。本节仅为已准备的交接材料，未指派 Implementer、未派发实施，计划保持 Approved。

| 启动项 | 核对事实与结论 |
|---|---|
| 批准覆盖 | 本轮 Human 明确批准本文件当前设计，仅覆盖 TASK-053。Task AC1～AC8、Scope 与本计划 §1～§9 未改；其他五份计划及 D-01～D-04 不在批准范围。 |
| 真实源码基线 | D:/projects/portomind 的 HEAD、本地 main、缓存 origin/main 一致，提交为 2bde9131b8d47e4460ce9f87ea801839e37e1f7f。本轮没有远程 fetch，不能把缓存分支引用称作已核实远端实时状态。 |
| 相关源码 | 已只读查看 LogViewer.jsx、log.service.js、router.jsx 与 client/package.json：原页面仍为 server/task 两视图、使用局部 state；日志调用为 GET，/logs 路由存在，CronStatus 组件目录尚不存在。相关目标文件的 git status 无改动输出。LogViewer.jsx、api.js 的 SHA256 与 Planner §2 指纹一致。 |
| 依赖与范围 | 053 只交付 URL tab、未知骨架和原日志隔离；不调用 /cron/status，不实现真实数据、比例、状态色或 lastSkip，因此 D-01～D-04、055/056/057/063/064 不构成本卡骨架实施的硬前置。后续接入仍须其各自批准，不能借本批准实施。054 的既有完成与合入记录未动。 |
| 验证要求 | 已核对 Task §3 与本计划 §7 的八项 AC 映射：URL/历史、五灯五卡未知态、原日志改前后对照、只读负向检查、错误隔离及 client build/lint。当前 client manifest 有 build/lint 入口，没有 test 脚本；vite、eslint、playwright-core 与 Chrome 文件存在，仅证明工具路径可找到，不证明验证已通过。未启动服务、浏览器或数据库，未运行应用测试/build/lint。 |
| 工作区与分支 | 当前真实源码目录处于 chore/agent-rules-refactor，存在多项无关未提交修改（含 client/scripts/e2e-task-058-u2.mjs、package.json、scripts/sync-db.cjs 及旧文档）。feature/TASK-053 引用检查退出码为1；worktree清单仅有D:/projects/portomind，feature/TASK-053*本地分支列表为空，没有已建立的本任务独立检出目录。按 [GIT.md](../../../os/standards/GIT.md) 和根 AGENTS.md 的分支要求，不能把该共享目录登记为已就绪的实施工作区。不得清理、覆盖或提交这些既有修改。 |

本轮输入指纹（SHA256，仅固定读取对象，不是测试证据）：

| 真实源码根下文件 | SHA256 |
|---|---|
| client/src/pages/LogViewer.jsx | 9dbe0c126c08ec699ff7b2ac34a6ea2aeb4ed42844efb54f9c319521807c2f0c |
| client/src/services/api.js | 705d0376bef51aa095ebf561e1e864c254e4ccd8889b41173fed8158a9ae45e2 |
| client/src/services/log.service.js | 998017ec5769d2879196d737cb1dbb3e2a9e021278a30b386a000c8cb6b6c613 |
| client/src/router.jsx | 1a28a6a8af1115459d614a4fe302d5b0482273457590fa583260b09496ffaa24 |
| client/src/components/layout/Sidebar.jsx | b7351b42b363425b5e148ceefb60a8ace0778bc6f69aa71562a6bced06897630 |
| client/package.json | 3a575006c9407dea107b6198df55b148ad90b699669ddd0293e83ab693a43764 |
| package.json（含既有未提交修改） | 053683f47b545e997ff834664de79a1c404933b235b286862b254ebee47e89bc |
| package-lock.json | f4d6b9299aa431bdb6284db8def497d384e6e45d1cad8f9ce1831e0df4027966 |

### 10.2 已准备、尚未派发的交接

- 文档与状态登记目录：当前 portomind20261030 副本；任务需求见 [TASK-053](./TASK-053.md)，批准的实现设计与验证要求见本计划 §4～§7。源码来源已确认是 D:/projects/portomind，但该目录不是已获准使用的独立实施工作区。
- 待交角色：Implementer；当前 Owner 仍待指派，没有实际开发会话已接手。Reviewer 另行独立安排，不能由本次实现者自审。
- 写入边界：仅 Task Scope 与计划 §4/§5 的客户端文件；不改侧栏、server/shared/worker、调度或结果契约，不实施其他任务或 D-01～D-04 的推荐方案。AC、范围或重大设计有变化时先回交，不以本批准覆盖新设计。
- 首先保留原日志筛选、分页与日期的可重复行为对照，再实现；交付文件清单/版本、AC1～AC8 结果、负向检查、实际 build/lint 证据、妥协与未验证项。验证命令入口引用 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md#7-验证与测试命令)，历史运行结果不代替本次验证。

### 10.3 剩余启动动作

由 Orchestrator 协调具备仓库写入权限的执行者，从已核对的 main 准备 feature/TASK-053 的独立检出或 worktree，记录其绝对路径、分支、基线、工作区状态与工具可用性，并明确读取本副本的当前规则、任务及已批准计划；本轮未执行该动作。不得直接切换或清理已有脏工作区，也不在本轮顺带搬回整套 Agent OS。

工作区齐备且设计/基线无实质变化后，沿用此次批准，指派 Implementer、由 Orchestrator 登记 Task Implementing 并实际交接；Implementer 真正开始后才按权限推进计划 Implementing。若有实质设计变化才回到既有 Human 批准流程，不重复索取未失效的同一设计批准。

## 11. Implementation Record

尚未实施。

## 12. Review Record

尚未独立审查；本轮Planner自检不等于Reviewer判定。

## 13. Completion Record

尚未结案；无Human关闭或合入决定。

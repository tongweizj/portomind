# US-004-03 · 派发一页清单（三卡并行）

> **给 Orchestrator 派发用**。平铺在 [US-004 交付目录](./)，随 Story 归档。派发前逐项勾选。详细方案见 [US-004-02-3card-parallel-plan.md](./US-004-02-3card-parallel-plan.md)。

## 0. 派发前置门（先勾）

- [ ] TASK-065-plan **`Approved`**（Human 已批）
- [ ] TASK-066-plan **`Approved`**
- [ ] TASK-067-plan **`Approved`**
- [ ] AC 覆盖缺口已闭合：G-1（AC-14）→ 065 AC-06 / 068 AC-07；G-2（AC-05）→ 066 AC-10（Planner 已补）
- [ ] 待决项已清：OQ-01 排序=有事的在上 · OQ-02 US-004 先行 · D-01 偏离文案=解 B · D-02 常量归 066

> 任一未勾 → **不得登记 Implementing**，先上报 Human。

## 1. 三卡分工

| Implementer | Task | 包 | 分支（worktree） | 验证命令入口 |
|---|---|---|---|---|
| A | [TASK-065](./TASK-065.md) | shared + server | `feature/TASK-065` | `npm run test:server` |
| B | [TASK-066](./TASK-066.md) | client | `feature/TASK-066` | `npm run build --workspace client` + eslint |
| C | [TASK-067](./TASK-067.md) | client | `feature/TASK-067` | `npm run build --workspace client` + eslint |

- 每个 worktree 从**最新 main** 切出，只含本卡改动。
- 计划链接：065 → [plan](./TASK-065-plan.md) · 066 → [plan](./TASK-066-plan.md) · 067 → [plan](./TASK-067-plan.md)

## 2. 三条并行红线（分派时必须口述给 Implementer）

1. **065 是 066/067 的验收前置门**：066/067 先用「字段缺失降级」开发骨架，等 065 合入 `main` 后补真实字段验收。
2. **`driftLabels.js` 归 Implementer B（066）**：B 先把 `client/src/constants/driftLabels.js` 纯常量文件建出并尽早合入 `main`，C（067）消费；禁止各建一份。
3. **067 偏离徽标维持两态**（D-01 解 B）：不改成健康表四态文案；「待办/上次再平衡」文案才与 066 逐字一致。

## 3. 后续编排（本次不派发）

- **TASK-068**：等 065 合入 `main` 后接（与 065 同改 `summary.js`，硬串行）。
- **TASK-069**：等 065 + 068 合入后收尾（契约文档）。

## 4. Orchestrator 动作清单

- [ ] 登记 065/066/067 卡 Status = `Implementing`，Owner = A/B/C（先改卡，再同步 BOARD）
- [ ] 建 3 个 worktree（`feature/TASK-065/066/067`）
- [ ] 分派：各给 Task 卡 + 计划链接 + 验证入口 + §2 三条红线
- [ ] 回交：登记依据、worktree、分派对象、068/069 后续编排

## 5. 禁止

- 不代 PM 改 Story 状态（Story → Implementing 归 PM）
- 不替 Human 批准计划 / merge main / 填 Merged
- 不把 068 与 065 同时派发
- 不写技术方案、不改业务代码、不替 Reviewer 审查

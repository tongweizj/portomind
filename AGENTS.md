# AGENTS.md

> **This is an entry point, not a manual.** It answers exactly three questions: *what is this project*, *where do I find things*, and *what must I never break*.
>
> **How to read it**: follow §2 on your first visit; after that use §3 as a lookup table. Do **not** read all of `docs/` (80+ markdown files) by default.
>
> **Maintenance rule (§11)**: before adding a paragraph, check §3. If the topic already has an owner, add a link, not a copy.

---

## 1. What this project is

`PortoMind` — a self-hosted, single-household **investment portfolio manager** (npm workspaces monorepo).

It collapses "what did I buy / what is it worth now / how far am I from target / should I rebalance" into one local system: investment ledger + multi-market quotes + target allocation + rebalancing advice + household-level RMB roll-up. **It never places orders.** Current audience: one household on a trusted LAN.

| Package | Responsibility | Must not |
|---|---|---|
| `shared/` | The **only** business kernel: models, services, tasks, fetchers | Depend on any shell, read CLI args, register signal handlers |
| `server/` | REST API protocol layer: validation, response wrapping, error normalization | Register cron, hold business rules, serve static files in production |
| `cron-worker/` | **The only scheduler**; holds trigger rights and nothing else | Listen on a port, hold business rules, duplicate `shared/` implementations |
| `client/` | React SPA: presentation and interaction only | `require` shared, touch the DB, compute drift thresholds, convert currencies |

Three product invariants — reviewing these three is enough to tell whether a change went off-track:

1. **Never places an order.** AUTO rebalancing only produces advice and alerts; execution is always a human click.
2. **Never guesses a missing number.** When a price or FX rate is missing, valuation fields are `null` and the UI shows `—`. Never fall back to `0`.
3. **Currency conversion happens only at the household layer.** Portfolios never cross-sum currencies.

Tech stack, external data sources and data-flow diagrams live in [ARCHITECTURE.md](./docs/os/architecture/ARCHITECTURE.md). They are deliberately not repeated here.

---

## 2. First visit — read in this order

| # | Read | Why | Time box |
|---|---|---|---|
| 1 | [ARCHITECTURE.md](./docs/os/architecture/ARCHITECTURE.md) §1 / §4 / §7 / §8 | Structure, module boundaries, constraints, known architecture debt | 10 min |
| 2 | [BOARD.md](./docs/BOARD.md) | Current Story, linked tasks, next handoff and historical work | 3 min |
| 3 | The entry file of the directory you will touch: [client/AGENTS.md](./client/AGENTS.md) · [cron-worker/AGENTS.md](./cron-worker/AGENTS.md) · [server/README.md](./server/README.md) | That workspace's commands, conventions and directory index | 5 min |

After that, read **only the sections relevant to the current task**. If you cannot find something, use §3 or grep — do not guess and do not bulk-read.

---

## 3. Find things — topic to single source of truth

> Every row below names the **one** place where that topic is described in detail. A second copy is a defect: the two drift apart and one of them ends up lying. See [DOCS.md](./docs/os/standards/DOCS.md) §2.

Docs are grouped by purpose: `docs/os/` for rules and engineering constraints, `docs/development/` for requirements and delivery, and `docs/handbook/` for maintained system documentation. Daily scheduling stays at [docs/BOARD.md](./docs/BOARD.md).

| I need / I am changing | Single source of truth |
|---|---|
| Product positioning, requirement baseline, feature codes | [development/requirements/PRD.md](./docs/development/requirements/PRD.md) |
| Detailed requirement shape of one feature | The matching `FS-*.md` under [development/requirements/specs/](./docs/development/requirements/specs) (delivered ones move to `specs/completed/`) |
| User scenario (context & motivation, optional layer) | [development/requirements/scenarios/SCENARIOS.md](./docs/development/requirements/scenarios/SCENARIOS.md) + `SCN-*.md` |
| User story (value, scope, AC, acceptance) | [development/requirements/stories/STORIES.md](./docs/development/requirements/stories/STORIES.md) + `US-*.md` (card Status is authoritative; see STATES.md §6) |
| How to split SCN / US / TASK and when each is needed | [os/process/REQUIREMENTS.md](./docs/os/process/REQUIREMENTS.md) |
| Feature panorama and capability boundaries | [handbook/product/PRODUCT_LINES.md](./docs/handbook/product/PRODUCT_LINES.md) + `handbook/product/lines/` |
| System structure, tech stack, external integrations, module boundaries, architecture debt | [os/architecture/ARCHITECTURE.md](./docs/os/architecture/ARCHITECTURE.md) |
| **Why** a structural decision was made | [os/architecture/adr/](./docs/os/architecture/adr) |
| Data model fields, enums, indexes, known contract gaps | [handbook/technical/DATA_MODEL.md](./docs/handbook/technical/DATA_MODEL.md) |
| HTTP endpoints, requests and responses | [handbook/technical/API_CONTRACT.md](./docs/handbook/technical/API_CONTRACT.md) |
| Frontend routes, components, data layer, design tokens | [handbook/technical/CLIENT_DEV.md](./docs/handbook/technical/CLIENT_DEV.md) |
| Scheduler engine, deduplication, `TaskRun` contract | [handbook/technical/CRON_WORKER_DEV.md](./docs/handbook/technical/CRON_WORKER_DEV.md) |
| How to run it, env vars, deployment, **verification commands**, security boundary | [handbook/ops/DEPLOYMENT.md](./docs/handbook/ops/DEPLOYMENT.md) §4 / §6 / **§7** / §9 |
| Using the UI, business calculation rules | [handbook/manual/CLIENT.md](./docs/handbook/manual/CLIENT.md) §3 / §5 |
| The API process itself, manual endpoints, its own troubleshooting | [handbook/ops/SERVER.md](./docs/handbook/ops/SERVER.md) |
| The scheduler from an operator's view | [handbook/ops/CRON_WORKER.md](./docs/handbook/ops/CRON_WORKER.md) + [CRON_WORKER_OPS.md](./docs/handbook/ops/CRON_WORKER_OPS.md) |
| Task board: what exists, who owns it, where it stands | [BOARD.md](./docs/BOARD.md) |
| What one task requires and where its process files live | Follow its link in BOARD; new Story files sit directly in `docs/development/delivery/US-xxx/` as `TASK-xxx.md` and `TASK-xxx-plan.md`. Location/lifecycle authority: [DOCS.md §1.1](./docs/os/standards/DOCS.md#11-story-交付目录与文档生命周期); existing/shared records stay linked in place |
| Whether an ExecPlan is required, and how to write one | [os/process/EXECUTION_PLANS.md](./docs/os/process/EXECUTION_PLANS.md) |
| **Status values** (Story / task / ExecPlan states, `Merged`, aliases) | [os/process/STATES.md](./docs/os/process/STATES.md) — the only owner; do not invent or redefine a status word anywhere else |
| Review verdicts and severity (`Pass` / `BLOCKER` …) | [os/roles/REVIEWER.md](./docs/os/roles/REVIEWER.md) §5 — verdicts are **not** statuses |
| Product Manager: Story preparation, scope and acceptance handoff | [os/roles/PRODUCT_MANAGER.md](./docs/os/roles/PRODUCT_MANAGER.md); status permissions belong to [STATES.md](./docs/os/process/STATES.md) §4 |
| My role, what I may write | [roles/](./docs/os/roles) — one file per role |
| Coding / Git / testing / security / where docs go | [standards/](./docs/os/standards) — one file per topic |
| Index of every document | [docs/readme.md](./docs/readme.md) |

---

## 4. Before you change code

1. Locate the current Story and task in [BOARD.md](./docs/BOARD.md); read the linked Story scope / AC and the task scope / AC / constraints. Standalone maintenance tasks may have no Story.
2. Read any linked Spec sections (a Spec is optional), and the relevant section of [ARCHITECTURE.md](./docs/os/architecture/ARCHITECTURE.md).
3. Decide whether an ExecPlan is required per [EXECUTION_PLANS.md](./docs/os/process/EXECUTION_PLANS.md) §2 — multi-module, schema change, security surface or new dependency normally means **yes**; routine role/session handoff alone does not require a plan.
4. **Check your branch first** (`git branch --show-current`); start new work from an up-to-date `main` on `feature/TASK-xxx`.
5. Stay inside the task scope. If repository findings contradict the task or its approved plan, stop and escalate — do not silently redefine product intent.

Verification and test commands have exactly one owner: [DEPLOYMENT.md §7](./docs/handbook/ops/DEPLOYMENT.md). Never copy them into this file or any other document.

---

## 5. Hard rules (a violation is a defect, not a style preference)

1. **Business rules exist once, in `shared/`.** A second copy is a defect — this is the most frequently recurring problem pattern in this repository.
2. **`cron-worker` is the only scheduling owner.** `node-cron` (or any timer) appearing in `server/` is an architecture regression and must be deleted.
3. **`client/` does not `require` shared, does not touch the database, does not compute drift thresholds, does not convert currency.**
4. **Cross-package imports use the package name** `@portomind/shared/...`, never `../../shared/...` path traversal.
5. **Never guess a missing price.** Valuation fields are `null`; no `0` fallbacks.
6. **AUTO rebalancing never writes transactions.**
7. **Every external call must be wrapped** in `withMarketDataTimeout` + `fetchWithRetry`. A bare `axios.get` turns one network blip into a failed task.
8. **Keep duplicated definitions in sync.** The only current duplicate is the `ASSET_*` enums, in `shared/constants/asset.constants.js` and `client/src/constants/enums.js` — change one, change the other.

The full constraint set, with the reasoning behind each, is [ARCHITECTURE.md §7](./docs/os/architecture/ARCHITECTURE.md).

---

## 6. Operating rules

Use the current role files and STATES.md as operating policy. Task cards, plans, chat history and private memory supply context and evidence; they do not override current rules. A recorded one-task exception does not become a general permission.

Before editing, inspect the working tree and preserve unrelated work. Read only the material needed for the current scope. Reuse valid evidence from the same baseline and environment; report missing or stale evidence honestly.

## 7. Handoff

Human sets priority → [PM](./docs/os/roles/PRODUCT_MANAGER.md) prepares Story → [Orchestrator](./docs/os/roles/ORCHESTRATOR.md) coordinates Planner → Implementer → Reviewer → PM summarizes Story acceptance → Human closes. Permissions belong to [STATES.md](./docs/os/process/STATES.md) §4.

Default to one Story at a time. Handoffs identify the task, Story AC, scope, authorization or plan exemption, dependencies, expected output, evidence and next owner. Describe a handoff as delivered or started only when that actually happened.

Role documents define permitted work; runtime filesystem and tool permissions are enforced by the host. Do not assume documentation has configured isolation or automatic agent dispatch.

---

## 8. Stop and ask a human when

- product scope or acceptance criteria would change;
- a new architectural decision is needed;
- an irreversible migration is proposed;
- security behaviour changes materially;
- an approved ExecPlan would change materially;
- the task cannot be finished without changing its original intent.

Ordinary implementation-level decisions inside approved boundaries are yours to make — but **never present an agent decision as a human approval**.

---

## 9. Completion and evidence

Implementation is not complete until the relevant verification has been run, and a task may only be marked done when its acceptance criteria are satisfied, verification passed, and review findings are resolved (BLOCKER resolved; MAJOR resolved or explicitly accepted by the human owner). Review verdicts and severity levels are owned by [REVIEWER.md](./docs/os/roles/REVIEWER.md) §5 — do not redefine them elsewhere.

Choose evidence for the acceptance criterion: runtime behavior needs actual execution results; static documentation, rules and links may be verified by inspecting the identified files or links. Record the checked version, method, result and unverified scope. Do not present inference as a run or repeat valid verification on an unchanged baseline merely to produce a fresh log.

---

## 10. Shared memory

Use the repository as shared project memory. Product intent, task intent, architecture, plans, decisions and verification evidence must stay recoverable **without** depending on any private chat history.

---

## 11. Maintenance rules for this file

- Keep this entry point short; put detailed rules in their owning documents.
- Before adding a section, check §3. Topic already owned → link only. Topic not owned → create the owner in `docs/` first, then link.
- **This file must not contain**: tech-stack tables, command lists, status enums, model field tables, endpoint tables, full role definitions, or generic software-engineering methodology. Those belong to ARCHITECTURE, DEPLOYMENT, BOARD, DATA_MODEL, API_CONTRACT, `docs/os/roles/` and `docs/os/standards/` respectively.
- Test for every line: *if I delete it, will an agent do something wrong?* If no, delete it.
- Change this file in its own commit so that reviewers can see whether the entry point got fatter.

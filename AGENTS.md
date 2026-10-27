# AGENTS.md

## 1. Purpose

This repository uses a human-guided, agent-assisted software development workflow.

Humans define:

- product intent
- scope
- priorities
- acceptance criteria
- major architectural decisions
- final acceptance

Agents may:

- explore the repository
- analyze existing behavior
- create implementation plans
- implement approved changes
- run verification
- review changes
- integrate parallel work
- maintain relevant documentation

The default development workflow is:

Understand → Explore → Plan → Implement → Verify → Review → Integrate → Complete

Not every task requires a formal Execution Plan.

---

## 2. Project Overview

Project:

`<PROJECT_NAME>`

Purpose:

`<Brief description of the project>`

Primary technology stack:

- Frontend: `<technology>`
- Backend: `<technology>`
- Database: `<technology>`
- Testing: `<technology>`
- Deployment: `<technology>`

Do not infer product requirements from implementation details.

Use repository documentation as the source of truth.

---

## 3. Sources of Truth

### Product

Project-level product direction:

`docs/product/PRODUCT.md`

Detailed product specifications:

`docs/product/specs/`

These documents define:

- product goals
- product behavior
- business rules
- feature requirements
- product scope

Agents must not silently redefine product requirements.

---

### Architecture

Current system architecture:

`docs/architecture/ARCHITECTURE.md`

Architecture Decision Records:

`docs/architecture/adr/`

`ARCHITECTURE.md` describes the current system architecture.

ADRs explain why important architectural decisions were made.

---

### Task Index

Project task index:

`docs/tasks/TASKS.md`

`TASKS.md` is only the high-level task board and index.

It is used to discover:

- existing tasks
- priority
- status
- ownership
- task location

Detailed task intent does not belong in `TASKS.md`.

---

### Individual Tasks

Active task definitions:

`docs/tasks/active/`

Completed task definitions:

`docs/tasks/completed/`

Each task must have its own Task file.

A Task file is the source of truth for:

- Goal
- Why
- Scope
- Out of Scope
- Constraints
- Acceptance Criteria
- Priority
- Status
- Ownership
- dependencies

Example:

`docs/tasks/active/TASK-042-github-login.md`

---

### Execution Plans

Execution Plan process and rules:

`docs/process/EXECUTION_PLANS.md`

Active Execution Plans:

`docs/exec-plans/active/`

Completed Execution Plans:

`docs/exec-plans/completed/`

An ExecPlan defines how a complex Task will be technically executed.

It must reference the related Task file instead of duplicating its product intent.

---

### Engineering Standards

Coding standards:

`docs/standards/CODING.md`

Testing standards:

`docs/standards/TESTING.md`

Security standards:

`docs/standards/SECURITY.md`

Git standards:

`docs/standards/GIT.md`

Read only documentation relevant to the current Task.

Do not load every project document by default.

---

## 4. Starting a Task

Before changing code:

1. Locate the Task in `docs/tasks/TASKS.md`.
2. Read the corresponding Task file.
3. Understand:
   - Goal
   - Scope
   - Out of Scope
   - Constraints
   - Acceptance Criteria
4. Read relevant product documentation.
5. Read relevant sections of `docs/architecture/ARCHITECTURE.md`.
6. Read relevant ADRs when necessary.
7. Explore the existing implementation.
8. Determine whether an ExecPlan is required.

Do not begin implementation while important Task intent is unresolved.

---

## 5. Task Complexity

Simple Tasks may proceed without an ExecPlan.

Typical examples:

- typo fixes
- small documentation updates
- obvious low-risk bug fixes
- isolated presentation changes
- small configuration corrections

Complex Tasks normally require an ExecPlan.

Examples:

- multiple modules
- significant refactoring
- architecture changes
- database migrations
- security-sensitive changes
- external integrations
- multi-agent implementation
- multiple sessions
- high technical uncertainty
- significant implementation risk

When an ExecPlan is required, follow:

`docs/process/EXECUTION_PLANS.md`

---

## 6. Human Approval Gates

Human approval is required when:

- product scope changes
- acceptance criteria change
- a major architectural decision is required
- an irreversible migration is proposed
- significant security behavior changes
- an approved ExecPlan materially changes
- a Task cannot be completed without changing its original intent

Agents may make ordinary implementation-level decisions inside approved boundaries.

Do not represent an Agent decision as a Human-approved decision.

---

## 7. Implementation Principles

When implementing:

- remain inside Task scope
- follow `docs/architecture/ARCHITECTURE.md`
- follow applicable ADRs
- reuse existing project patterns
- avoid unrelated refactoring
- avoid speculative abstractions
- preserve compatibility unless explicitly changed
- add or update relevant tests
- update durable documentation when necessary

Prefer the smallest correct change that satisfies the Task.

If repository findings invalidate the approved technical approach, update or escalate the ExecPlan before continuing significant implementation.

---

## 8. Verification

Implementation is not complete until relevant verification has been performed.

Follow:

`docs/standards/TESTING.md`

Verification may include:

- unit tests
- integration tests
- end-to-end tests
- lint
- type checking
- build
- static analysis
- security checks
- runtime validation

Acceptance Criteria come from the Task file.

The ExecPlan defines how those criteria will be verified.

Actual test and validation results provide the evidence.

Do not claim success based only on code inspection.

---

## 9. Review

Review should evaluate:

- Task compliance
- Acceptance Criteria
- correctness
- architecture consistency
- security
- edge cases
- regression risk
- tests
- unnecessary complexity

For significant work, the Reviewer should preferably be different from the Implementer.

Review severity:

- BLOCKER
- MAJOR
- MINOR
- PASS

BLOCKER findings must be resolved.

MAJOR findings must be resolved or explicitly accepted by the Human owner.

---

## 10. Multi-Agent Work

Parallel Agents must have clearly separated responsibilities.

Parallelism is preferred for:

- repository exploration
- research
- independent modules
- independent verification
- review

Parallel implementation should only be used when work can be safely separated.

Avoid multiple Agents editing the same files concurrently.

Use separate branches or Git worktrees where appropriate.

Each Agent must know:

- Task
- role
- scope
- dependencies
- expected output
- prohibited changes

Repository documents are the shared coordination layer.

Do not rely on private Agent conversation history as project state.

---

## 11. Task Ownership

Every active Task should have one primary owner.

The primary owner is responsible for:

- keeping Task status accurate
- coordinating dependencies
- ensuring required planning occurs
- ensuring verification occurs
- ensuring review findings are addressed
- coordinating handoff when necessary

Multiple Agents may contribute to one Task.

---

## 12. Git

Follow:

`docs/standards/GIT.md`

Task IDs should remain traceable across:

- Task file
- branch
- ExecPlan
- commits where practical
- pull request

Do not:

- force push shared history without approval
- discard unrelated changes
- overwrite another Agent's work
- commit secrets
- modify unrelated files

---

## 13. Documentation

Update documentation when implementation changes durable project knowledge.

Examples:

- product behavior
- architecture
- APIs
- database structure
- environment configuration
- engineering procedures

Task-specific implementation history belongs in the ExecPlan when one exists.

Architecture decisions belong in:

`docs/architecture/adr/`

Temporary reasoning should not become permanent documentation unless it provides long-term value.

---

## 14. Task Completion

A Task may be marked DONE only when:

1. Acceptance Criteria are satisfied.
2. Required implementation is complete.
3. Relevant verification has passed.
4. No unresolved BLOCKER findings remain.
5. MAJOR findings are resolved or explicitly accepted.
6. Relevant documentation is updated.
7. The ExecPlan is completed if one exists.
8. Required Human acceptance is complete.

Completion must be supported by evidence.

---

## 15. Core Principle

Use the repository as shared project memory.

Product intent, Task intent, architecture, implementation plans, decisions, and verification evidence must remain recoverable without depending on private chat history.
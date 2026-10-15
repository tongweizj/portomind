# Execution Plans

## 1. Purpose

An Execution Plan, or ExecPlan, is a task-specific implementation plan used for complex development work.

It provides enough context, decisions, steps, and verification criteria for an agent or developer to complete the task without relying on private chat history or undocumented assumptions.

An ExecPlan is a living document.

It should be updated as implementation progresses and as important discoveries, decisions, risks, or review findings emerge.

---

## 2. When an ExecPlan Is Required

Create an ExecPlan when a task includes one or more of the following:

- changes across multiple modules or components
- significant refactoring
- architectural changes
- database or schema migration
- security-sensitive changes
- external service or API integration
- multiple implementation steps
- multiple agents working on the same feature
- work expected to span multiple sessions
- complex dependencies
- significant uncertainty or technical risk
- changes that require explicit human review before implementation

An ExecPlan is usually not required for:

- typo fixes
- small documentation changes
- trivial UI changes
- simple bug fixes with an obvious cause and solution
- low-risk one-file changes

When uncertain, prefer an ExecPlan for work that would be difficult for another agent to safely continue without additional explanation.

---

## 3. Location

Active Execution Plans are stored in:

`docs/exec-plans/active/`

Completed Execution Plans are stored in:

`docs/exec-plans/completed/`

Recommended filename format:

`TASK-<ID>-<short-description>.md`

Example:

`TASK-042-github-login.md`

---

## 4. Relationship to the Task List

The project task list is stored in:

`docs/tasks/TASKS.md`

The task list is the source of truth for:

- task identity
- task status
- priority
- ownership
- high-level dependencies

The Execution Plan is the source of truth for:

- technical implementation strategy
- repository findings
- implementation progress
- technical decisions
- verification
- review findings
- task outcome

Do not duplicate the full ExecPlan inside the task list.

The task list should link to the ExecPlan when one exists.

---

## 5. Human Intent

Every ExecPlan must begin from approved Human Intent.

Human Intent normally defines:

- Goal
- Why
- Scope
- Out of Scope
- Constraints
- Acceptance Criteria
- Priority

Agents must not silently modify Human Intent.

If implementation requires a material change to:

- scope
- acceptance criteria
- product behavior
- architecture direction
- major constraints

the issue must be surfaced for human review before proceeding.

---

## 6. ExecPlan Lifecycle

The normal lifecycle is:

`Draft → Plan Review → Approved → Implementing → Verifying → Reviewing → Integrating → Completed`

A task may enter:

`Blocked`

at any point when progress cannot safely continue.

### Draft

The repository is explored and the initial technical plan is created.

### Plan Review

The human owner reviews:

- task understanding
- scope
- architecture direction
- implementation strategy
- risks
- verification approach

### Approved

Implementation may begin.

### Implementing

Agents perform the approved work.

### Verifying

Relevant automated and manual checks are executed.

### Reviewing

A reviewer checks implementation against requirements, architecture, quality, security, and regression risks.

### Integrating

Parallel work is merged and full-system verification is performed.

### Completed

Acceptance criteria are satisfied, verification is complete, required review issues are resolved, documentation is updated, and the outcome is recorded.

---

## 7. ExecPlan Ownership

An ExecPlan may involve several roles.

### Human

Owns:

- product intent
- scope
- priority
- acceptance criteria
- major product decisions
- major architectural approval
- final acceptance

### Planner

Owns:

- repository exploration
- technical analysis
- implementation strategy
- work breakdown
- dependency identification
- verification planning

### Implementer

Owns:

- implementation
- implementation-level decisions within the approved plan
- relevant tests
- implementation progress updates

### Reviewer

Owns:

- independent review
- requirement verification
- architecture review
- regression analysis
- security review where relevant

### Integrator

Owns:

- merging parallel work
- conflict resolution
- final integration verification

One person or agent may perform multiple roles on small tasks, but independent review is preferred for significant changes.

---

## 8. Required ExecPlan Structure

Each ExecPlan should use the following structure.

---

# TASK-XXX — Task Name

## Status

Current status:

`Draft | Plan Review | Approved | Implementing | Verifying | Reviewing | Integrating | Blocked | Completed`

Owner:

`<human or agent role>`

Priority:

`Low | Medium | High | Critical`

Related task:

`TASK-XXX`

---

## 1. Intent

### Goal

Describe the outcome that must be achieved.

### Why

Explain why this task matters.

### Scope

Define what is included.

### Out of Scope

Define what must not be changed or implemented.

### Constraints

Record important technical, product, security, schedule, compatibility, or operational constraints.

### Acceptance Criteria

List observable conditions that must be satisfied before completion.

Example:

- [ ] User can sign in with GitHub.
- [ ] Existing users are linked instead of duplicated.
- [ ] Failed authentication returns a clear error.
- [ ] Relevant automated tests pass.

---

## 2. Context

Explain enough project context for another agent or developer to understand the task.

Include relevant:

- modules
- services
- APIs
- data models
- workflows
- architectural boundaries
- existing behavior

Reference source documents rather than copying large amounts of content.

Example:

- Product requirement: `docs/product/specs/authentication.md`
- Architecture: `ARCHITECTURE.md`
- Related ADR: `docs/architecture/adr/ADR-003-authentication.md`

---

## 3. Repository Findings

Record important facts discovered during repository exploration.

Include:

- relevant files
- existing implementation patterns
- reusable abstractions
- existing tests
- dependencies
- technical constraints
- inconsistencies
- unknowns

Example:

- Authentication logic is implemented in `src/auth/`.
- OAuth account linking already exists for Google.
- The current user table enforces unique email addresses.
- Integration tests use a test PostgreSQL database.

Do not include temporary or irrelevant exploration notes.

---

## 4. Proposed Design

Describe the intended technical approach.

Explain:

- components to change
- new components if required
- data flow
- API changes
- schema changes
- dependency changes
- important implementation decisions

Prefer extending existing project patterns over introducing new abstractions unnecessarily.

For significant architectural choices, reference or create an ADR when appropriate.

---

## 5. Work Breakdown

Break implementation into concrete steps.

Example:

- [ ] Add GitHub OAuth provider configuration
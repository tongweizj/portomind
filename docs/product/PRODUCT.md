# Product

## 1. Product Overview

### Product Name

`<PROJECT_NAME>`

### Summary

用 2–4 句话描述产品是什么、主要服务谁、解决什么问题。

Example:

`<PROJECT_NAME>` is a web application that helps `<target users>` accomplish `<primary goal>` by providing `<core capabilities>`.

---

## 2. Product Vision

描述产品长期希望达到的状态。

回答：

- 我们最终希望这个产品变成什么？
- 它希望为用户创造什么长期价值？
- 它与普通替代方案有什么根本不同？

Example:

Our vision is to provide `<target users>` with a simple and reliable way to `<core outcome>` without requiring `<existing pain point>`.

---

## 3. Problem Statement

描述产品要解决的问题。

### Problem

`<What problem exists?>`

### Who Has This Problem

`<Which users or organizations experience it?>`

### Current Alternatives

用户现在如何解决这个问题？

Examples:

- manual workflow
- spreadsheets
- email
- existing competitor
- multiple disconnected tools

### Limitations of Current Alternatives

- `<limitation>`
- `<limitation>`
- `<limitation>`

### Impact

如果这个问题没有解决，会产生什么影响？

Examples:

- wasted time
- errors
- poor user experience
- missed opportunities
- high operational cost

---

## 4. Target Users

### Primary Users

#### User Type A — `<Role>`

Description:

`<Who this user is>`

Primary goals:

- `<goal>`
- `<goal>`

Primary pain points:

- `<pain point>`
- `<pain point>`

---

#### User Type B — `<Role>`

Description:

`<Who this user is>`

Primary goals:

- `<goal>`
- `<goal>`

Primary pain points:

- `<pain point>`
- `<pain point>`

---

### Secondary Users

List users who interact with the system but are not the primary product audience.

Examples:

- administrators
- support staff
- moderators
- organization owners

---

## 5. Value Proposition

Describe why users should use this product.

### Primary Value

`<Main value delivered to the user>`

### Supporting Value

- `<value>`
- `<value>`
- `<value>`

### Differentiators

Describe what makes this product meaningfully different from alternatives.

Examples:

- simpler workflow
- better automation
- stronger trust
- lower cost
- better integration
- domain-specific experience

---

## 6. Product Goals

List the major outcomes the product is intended to achieve.

### Goal 1 — `<Goal Name>`

Description:

`<Desired product outcome>`

Success indication:

`<How we know this goal is being achieved>`

---

### Goal 2 — `<Goal Name>`

Description:

`<Desired product outcome>`

Success indication:

`<How we know this goal is being achieved>`

---

### Goal 3 — `<Goal Name>`

Description:

`<Desired product outcome>`

Success indication:

`<How we know this goal is being achieved>`

---

## 7. Non-Goals

Explicitly record what the product is not trying to become.

Examples:

- This product is not intended to replace `<existing system>`.
- This product does not provide `<capability>`.
- This product does not target `<user group>`.
- This project will not implement `<large adjacent feature>` during the current phase.

Non-goals help prevent uncontrolled scope expansion.

---

## 8. Product Scope

### In Scope

- `<major capability>`
- `<major capability>`
- `<major capability>`

### Out of Scope

- `<excluded capability>`
- `<excluded capability>`
- `<excluded capability>`

Detailed feature-level scope should live in product specifications or task files.

---

## 9. Core Capabilities

Describe the product's main capability areas.

Do not list every screen or API.

### 9.1 `<Capability Area>`

Purpose:

`<What this capability allows users to achieve>`

Includes:

- `<capability>`
- `<capability>`
- `<capability>`

---

### 9.2 `<Capability Area>`

Purpose:

`<What this capability allows users to achieve>`

Includes:

- `<capability>`
- `<capability>`

---

### 9.3 `<Capability Area>`

Purpose:

`<What this capability allows users to achieve>`

Includes:

- `<capability>`
- `<capability>`

---

## 10. Core User Journeys

Describe the most important end-to-end user flows.

### Journey 1 — `<Journey Name>`

```text
User starts
    ↓
<Step>
    ↓
<Step>
    ↓
<Step>
    ↓
User achieves <outcome>
```

Success condition:

`<What successful completion means>`

---

### Journey 2 — `<Journey Name>`

```text
<Step>
    ↓
<Step>
    ↓
<Outcome>
```

---

## 11. Product Rules

Record durable business rules that apply across multiple features.

Examples:

- A user may have only one active account per email address.
- A participant may belong to only one confirmed team within the same event.
- Administrative actions must require administrator authorization.
- User-visible destructive actions must require confirmation.

Do not include technical implementation rules here.

Technical constraints belong in `ARCHITECTURE.md` or engineering documentation.

---

## 12. Product Principles

Define principles that guide product decisions.

Examples:

### Simplicity

Prefer understandable workflows over feature-rich but complex experiences.

### Trust

Important system state should be clear and verifiable to users.

### User Control

Users should understand what actions they are taking and their consequences.

### Minimum Necessary Complexity

Do not add workflows, roles, or configuration unless they solve a validated product need.

---

## 13. Product Success Metrics

Define important product-level indicators where relevant.

| Metric | Description | Target |
|---|---|---|
| `<Metric>` | `<What it measures>` | `<Target>` |
| `<Metric>` | `<What it measures>` | `<Target>` |

Examples:

- task completion rate
- successful signup rate
- activation rate
- retention
- conversion
- failure rate
- support volume

For early-stage or academic projects, targets may be qualitative or provisional.

---

## 14. Product Constraints

Record non-technical constraints that materially affect product behavior.

Examples:

- academic project deadline
- regulatory requirements
- accessibility requirements
- language support
- budget
- target geography
- supported user roles
- privacy expectations

Technical constraints should be referenced rather than duplicated.

---

## 15. Product Risks

Record major product risks.

| Risk | Impact | Mitigation |
|---|---|---|
| `<risk>` | `<impact>` | `<mitigation>` |
| `<risk>` | `<impact>` | `<mitigation>` |

Examples:

- users do not understand the workflow
- insufficient trust in generated recommendations
- excessive onboarding complexity
- duplicate or low-quality data
- unclear role permissions

---

## 16. Product Specifications

Detailed feature requirements should live in:

`docs/product/specs/`

Example:

```text
docs/product/
├── PRODUCT.md
└── specs/
    ├── authentication.md
    ├── user-profile.md
    ├── team-management.md
    └── admin.md
```

`PRODUCT.md` defines the overall product direction.

Feature specifications define detailed behavior.

---

## 17. Relationship to Tasks

Product requirements describe what the product should do.

Tasks describe specific units of work required to change the system.

Example:

```text
PRODUCT.md
    ↓
Product Spec
    ↓
TASK-042
    ↓
ExecPlan
    ↓
Implementation
```

Task files must not silently redefine product requirements.

If a task requires a product requirement change, update the relevant product documentation through human review.

---

## 18. Relationship to Architecture

Product documentation defines:

`WHAT and WHY`

Architecture documentation defines:

`HOW THE SYSTEM IS STRUCTURED`

Do not place:

- framework decisions
- database implementation details
- code structure
- deployment topology

in this document.

Reference:

`ARCHITECTURE.md`

for technical architecture.

---

## 19. Glossary

Define important domain terminology.

| Term | Definition |
|---|---|
| `<Term>` | `<Definition>` |
| `<Term>` | `<Definition>` |

Use consistent terminology across product specs, tasks, ExecPlans, and implementation.

---

## 20. Related Documentation

- Architecture: `/docs/architecture/ARCHITECTURE.md`
- Product specifications: `docs/product/specs/`
- Task index: `docs/tasks/TASKS.md`
- Active tasks: `docs/tasks/active/`
- Execution Plan rules: `docs/process/EXECUTION_PLANS.md`
- Active ExecPlans: `docs/exec-plans/active/`
- ADRs: `docs/architecture/adr/`

---

## 21. Maintenance Rules

Update this document when:

- product vision changes
- target users materially change
- major product scope changes
- core capabilities are added or removed
- major product rules change
- important non-goals change
- success criteria materially change

Do not update this document for every task or implementation detail.

Keep this document stable enough to act as the product-level source of truth.
# TASK-XXX — <Task Title>

## Metadata

**Status:**  
`BACKLOG | READY | EXPLORING | PLANNING | PLAN_REVIEW | IMPLEMENTING | VERIFYING | REVIEWING | INTEGRATING | HUMAN_ACCEPTANCE | BLOCKED | DONE`

**Priority:**  
`Critical | High | Medium | Low`

**Owner:**  
`<Human / Agent / Role / Unassigned>`

**Created:**  
`YYYY-MM-DD`

**Updated:**  
`YYYY-MM-DD`

**Related Product Spec:**  
`<path or None>`

**Related ADR:**  
`docs/architecture/adr/<ADR-file> | None`

**Execution Plan:**  
`docs/exec-plans/active/<ExecPlan-file> | Not required`

---

## 1. Goal

Describe the concrete outcome that this Task must achieve.

Focus on the result, not the implementation.

---

## 2. Why

Explain why this Task matters.

Reference the relevant:

- product requirement
- user need
- defect
- operational need
- technical need

---

## 3. Scope

The Task includes:

- `<scope item>`
- `<scope item>`
- `<scope item>`

---

## 4. Out of Scope

The Task explicitly does not include:

- `<excluded item>`
- `<excluded item>`
- `<excluded item>`

Out of Scope protects the Task from uncontrolled expansion.

---

## 5. Constraints

Record important constraints.

Examples:

- backward compatibility
- security requirements
- product constraints
- supported platforms
- existing API contracts
- database compatibility
- delivery constraints

---

## 6. Acceptance Criteria

The Task is successful when:

- [ ] `<Observable result>`
- [ ] `<Observable result>`
- [ ] `<Observable result>`

Acceptance Criteria should describe observable outcomes.

Avoid implementation-specific criteria unless implementation itself is the requirement.

---

## 7. Dependencies

### Blocking Dependencies

- `<Task / decision / service / None>`

### Non-Blocking Dependencies

- `<dependency / None>`

---

## 8. Related Documentation

Relevant documentation:

- Product: `docs/producr/`
- Architecture: `docs/architecture/ARCHITECTURE.md`
- ADR: `docs/architecture/adr/<ADR-file>`
- Coding: `docs/standards/CODING.md`
- Testing: `docs/standards/TESTING.md`
- Security: `docs/standards/SECURITY.md`
- Git: `docs/standards/GIT.md`

Only include documents relevant to this Task.

---

## 9. Execution Plan Decision

**ExecPlan Required:**  
`Yes | No`

**Reason:**

`<Brief explanation>`

Typical reasons for requiring an ExecPlan:

- multiple modules
- significant refactoring
- architecture change
- migration
- security-sensitive change
- external integration
- multi-agent work
- multiple sessions
- significant uncertainty or risk

Execution Plan rules:

`docs/process/EXECUTION_PLANS.md`

If required, create:

`docs/exec-plans/active/TASK-XXX-<description>.md`

---

## 10. Coordination Notes

Use this section only for short project-level coordination notes.

Examples:

- awaiting Human decision
- blocked by another Task
- assigned to another Agent
- ready for review

Do not place detailed technical planning or implementation history here.

---

## 11. Completion

### Acceptance Result

`Pending | Accepted | Rejected`

### Completed Date

`YYYY-MM-DD | Pending`

### Final Notes

`<Short summary or None>`
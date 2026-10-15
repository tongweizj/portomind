# Coding Standards

## 1. Purpose

This document defines repository-wide coding standards.

The goals are to maintain:

- readability
- consistency
- maintainability
- predictable architecture
- safe agent-generated changes
- minimal unnecessary complexity

Follow existing project conventions when they are more specific than this document.

---

## 2. General Principles

### Prefer clarity over cleverness

Code should be easy for another developer or agent to understand.

Avoid unnecessary abstraction, indirection, or compact code that reduces readability.

### Keep changes scoped

When completing a task:

- modify only what is necessary
- avoid unrelated refactoring
- avoid opportunistic cleanup unless explicitly required
- do not redesign adjacent systems without approval

### Reuse existing patterns

Before introducing a new:

- abstraction
- utility
- library
- service
- architectural pattern

check whether the repository already has an appropriate solution.

### Preserve behavior unless intentionally changed

Do not silently change existing behavior outside the approved task scope.

---

## 3. Naming

Use names that communicate intent.

Prefer:

`calculateOrderTotal()`

over:

`calc()`

Prefer domain terminology already used in:

- Product documentation
- Architecture documentation
- Existing code

Avoid creating multiple names for the same domain concept.

---

## 4. Functions and Methods

Functions should:

- have a clear responsibility
- be reasonably small
- avoid excessive side effects
- expose meaningful inputs and outputs
- handle errors intentionally

Avoid functions that combine unrelated concerns.

Prefer:

```text
validate
→ transform
→ persist
```

over one large function performing all responsibilities invisibly.

---

## 5. Classes and Modules

Each module should have a clear purpose.

Respect module boundaries defined in:

`ARCHITECTURE.md`

Do not move business logic into:

- UI components
- controllers
- route handlers
- persistence adapters

unless the architecture explicitly allows it.

---

## 6. Duplication

Do not introduce unnecessary duplication.

However, do not create abstractions prematurely.

Prefer small duplication over an abstraction that incorrectly combines unrelated concepts.

Create shared abstractions when:

- behavior is genuinely shared
- semantics are stable
- duplication is likely to cause maintenance problems

---

## 7. Error Handling

Errors must be handled intentionally.

Do not:

- silently swallow exceptions
- return success when an operation failed
- expose internal stack traces to users
- use generic catch blocks without a reason

Errors should preserve enough information for debugging while avoiding sensitive-data leakage.

---

## 8. Validation

Validate data at appropriate system boundaries.

Examples:

- API inputs
- form submissions
- external service responses
- file inputs
- database constraints

Critical business invariants must be enforced server-side.

Client-side validation alone is not sufficient for security or data integrity.

---

## 9. Comments

Comments should explain:

- why something exists
- unusual constraints
- non-obvious trade-offs
- important compatibility concerns

Do not use comments to restate obvious code.

Prefer:

```text
Why this workaround exists
```

over:

```text
Increment i by one
```

---

## 10. Dependencies

Before adding a new dependency:

1. Check whether existing dependencies can solve the problem.
2. Evaluate maintenance and security implications.
3. Avoid large dependencies for trivial functionality.
4. Follow project architecture constraints.

Major dependency changes may require human approval or an ADR.

---

## 11. Configuration

Configuration should be separated from application logic where practical.

Do not:

- hard-code secrets
- commit credentials
- commit environment-specific production values
- embed private tokens in source code

Use approved configuration mechanisms.

---

## 12. API and Interface Changes

When modifying a public API or shared interface:

- preserve compatibility unless change is explicitly approved
- update consumers
- update tests
- update documentation
- record breaking changes clearly

Major interface decisions may require an ADR.

---

## 13. Data Changes

When modifying persistent data structures:

- use the project's migration mechanism
- preserve data where required
- consider backward compatibility
- consider rollback and recovery
- add relevant tests

Do not directly modify production data structures outside approved migration processes.

---

## 14. Generated Code

Do not manually modify generated files unless the repository explicitly requires it.

Modify the source definition and regenerate instead.

Clearly distinguish:

- source files
- generated files

---

## 15. Agent-Generated Changes

Agents must:

- inspect existing patterns before coding
- keep changes within task scope
- avoid speculative abstractions
- report unexpected architectural conflicts
- run required verification
- clearly identify changed areas

Agents must not treat generated code as correct without verification.

---

## 16. Refactoring

Refactoring is appropriate when:

- required by the task
- necessary to safely implement the change
- explicitly approved

Unrelated refactoring should normally be deferred to a separate task.

If significant refactoring is required, consider creating an ExecPlan.

---

## 17. Documentation

Update documentation when code changes durable project knowledge.

Examples:

- APIs
- architecture
- module boundaries
- environment setup
- configuration
- important operational behavior

Do not create documentation for temporary implementation details.

---

## 18. Definition of Acceptable Code

Code is acceptable when:

- it satisfies the approved task
- it follows current architecture
- it is readable
- it avoids unnecessary complexity
- relevant tests exist
- required verification passes
- no unresolved major review issue remains
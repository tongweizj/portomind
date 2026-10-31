# Testing Standards

## 1. Purpose

This document defines how changes must be verified.

Testing exists to provide evidence that:

- new behavior works
- existing behavior continues to work
- important edge cases are covered
- regressions are detected
- implementation matches acceptance criteria

A change is not considered correct merely because the code appears reasonable.

---

## 2. Testing Principles

### Test behavior, not implementation details

Prefer tests that verify observable behavior.

Avoid tightly coupling tests to internal structure unless the structure itself is an architectural requirement.

### Risk determines test depth

Higher-risk changes require stronger verification.

Examples:

High risk:

- authentication
- authorization
- payments
- concurrency
- migrations
- data deletion
- security-sensitive workflows

Low risk:

- static copy changes
- simple presentation changes

### Bugs should usually receive regression tests

When fixing a meaningful bug, add a test that would fail before the fix and pass afterward where practical.

---

## 3. Test Levels

### Unit Tests

Verify isolated business or application logic.

Use when:

- logic can be tested independently
- edge cases are important
- fast feedback is useful

### Integration Tests

Verify interaction between components.

Examples:

- service + database
- API + persistence
- authentication + account storage
- application + external adapter

### End-to-End Tests

Verify critical user journeys across the full system.

Use selectively for high-value workflows.

Examples:

- registration
- login
- checkout
- team creation
- administrator approval

---

## 4. Required Verification

Every implementation task must identify relevant verification.

Depending on the project, this may include:

- unit tests
- integration tests
- end-to-end tests
- lint
- formatting checks
- type checking
- build
- static analysis
- security checks
- runtime validation

The exact commands should be recorded below.

---

## 5. Standard Commands

**Verification and test commands have exactly one owner**: [DEPLOYMENT.md §7](../../handbook/ops/DEPLOYMENT.md). This document deliberately does **not** copy them — a second copy drifts, and then two documents disagree about how to verify the same change.

Go to [DEPLOYMENT.md §7](../../handbook/ops/DEPLOYMENT.md) for: install, server tests, worker tests, `validate`, `verify`, `build`, `lint`, and the full-verification sequence.

> Do not guess a command. If §7 lacks the one you need, that is a gap to raise — not a licence to invent it.

---

## 5A. Repository coverage and reusable evidence

Inspect the current package scripts and test directories before choosing verification; do not assume a workspace has coverage. A green shell test does not prove shared business logic was reached. Add a meaningful assertion through the appropriate layer, or explicitly record the coverage gap.

Keep reusable acceptance scripts in the repository, named by behavior or task, runnable without local edits or credentials. Prefer discoverable commands. Remove obsolete scripts with an explicit reason. Temporary probes may support one review but are not standing regression coverage.

Key checks: new or critical assertions must be able to fail; “always displays” requirements need empty-state cases; do not mock away the suspected layer; investigate a failed assertion before changing it; distinguish “ran without throwing” from “produced correct data”. Negative controls follow [REVIEWER.md](../roles/REVIEWER.md) §2.3.

## 6. Acceptance Criteria Mapping

For complex tasks, verification should map to acceptance criteria.

Example:

| Acceptance Criterion | Verification |
|---|---|
| User can log in | Integration test |
| Invalid credentials fail | Unit + integration test |
| Error shown to user | UI test |
| Existing login still works | Regression test |

This mapping should normally be recorded in the ExecPlan.

---

## 7. Test Data

Tests should:

- use predictable test data
- avoid dependency on production data
- clean up created state where required
- avoid shared mutable state where practical
- remain repeatable

Do not place real:

- credentials
- personal data
- production tokens

inside tests.

---

## 8. External Services

External systems should be handled intentionally.

Depending on test level, use:

- mocks
- fakes
- test environments
- sandbox APIs

Do not make ordinary unit tests depend on unstable external services.

---

## 9. Database Tests

Database-related changes should verify relevant:

- constraints
- migrations
- transactions
- uniqueness rules
- relationships
- rollback behavior where required

Critical invariants should not rely only on application code when database enforcement is appropriate.

---

## 10. Security-Sensitive Tests

Security-sensitive changes should test both:

```text
Allowed behavior
+
Denied behavior
```

Examples:

- authorized access succeeds
- unauthorized access fails
- users cannot access other users' resources
- expired credentials fail
- invalid tokens fail

---

## 11. Negative Testing

Do not test only the happy path.

Consider:

- missing inputs
- invalid inputs
- duplicate requests
- unauthorized access
- network failure
- timeout
- dependency failure
- concurrency
- unexpected state

Use judgment based on task risk.

---

## 12. Regression Testing

When modifying existing behavior:

- identify nearby behavior at risk
- run relevant existing tests
- add regression coverage when warranted

Do not assume a passing new test proves unrelated existing behavior remains intact.

---

## 13. Flaky Tests

Flaky tests should not be ignored indefinitely.

If a flaky test is discovered:

1. Record it.
2. Determine whether it affects task confidence.
3. Fix it or create a follow-up task.
4. Do not repeatedly rerun until it randomly passes and report success without noting the issue.

---

## 14. Verification Evidence

Agents must report actual results.

Good:

```text
Unit tests: 42 passed
Integration tests: 12 passed
Lint: PASS
Type check: PASS
Build: PASS
```

Insufficient:

```text
Everything looks good.
```

If verification cannot be performed, report:

- what was not run
- why
- what risk remains

---

## 15. Multi-Agent Testing

In multi-agent work:

- each Implementer verifies its own scope
- Reviewer independently checks relevant behavior
- the **Human** runs or confirms combined verification after merge — there is no Integrator role ([EXECUTION_PLANS.md §7](../process/EXECUTION_PLANS.md))

Passing tests in separate branches do not prove the integrated result is correct.

---

## 16. Completion Rule

A task may not be marked Completed until required verification has passed or unresolved verification gaps have been explicitly accepted by the human owner.

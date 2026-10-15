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

### Install

`<command>`

### Unit Tests

`<command>`

### Integration Tests

`<command>`

### End-to-End Tests

`<command>`

### Lint

`<command>`

### Type Check

`<command>`

### Build

`<command>`

### Full Verification

`<command>`

Keep these commands accurate.

Agents should use these commands instead of guessing.

---

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
- Integrator runs combined verification after merge

Passing tests in separate branches do not prove the integrated result is correct.

---

## 16. Completion Rule

A task may not be marked DONE until required verification has passed or unresolved verification gaps have been explicitly accepted by the human owner.
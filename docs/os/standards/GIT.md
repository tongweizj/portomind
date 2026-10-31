# GIT.md

## 1. Purpose

This document defines Git practices for human and multi-agent development.

The goals are:

- safe parallel work
- traceable changes
- minimal merge conflicts
- clear ownership
- recoverability
- reliable review

---

## 2. Main Branch

Primary branch:

`main`

The primary branch should remain buildable and stable.

Agents should not directly modify the primary branch unless explicitly allowed.

> main is the long-lived integration branch. Start new work from an up-to-date main unless the task explicitly defines a different base.

---

## 3. Branch Naming

**Format used by this project** (this is the actual convention, not a suggestion):

```text
feature/TASK-<id>[-<short-description>]
```

Example: `feature/TASK-XXX-description`

Rules:

- **`feature/TASK-<id>` is the default.** The task ID is mandatory for task work — it keeps branch, task card, ExecPlan and commit traceable to each other.
- The `<short-description>` suffix is optional; add it when two tasks could collide or the id alone is opaque.
- `fix/` / `refactor/` / `docs/` / `chore/` are acceptable **only for work with no task card** (e.g. a typo, a README rewrite, a tooling chore). If a TASK-xxx card exists, use `feature/TASK-xxx`.
- Do **not** use `task/<id>` — use the prescribed branch format above.


---

## 4. One Task, One Primary Branch

Each task should normally have one primary branch.

Example:

```text
TASK-XXX
↓
feature/TASK-XXX-description
```

This improves traceability between:

- Task
- ExecPlan
- commits
- review
- PR

---

## 5. Multi-Agent Work

Parallel implementation should use separate branches or Git worktrees.

Example:

```text
TASK-XXX

feature/TASK-XXX-description
        │
        ├── worktree/backend
        ├── worktree/frontend
        └── worktree/tests
```

Do not let multiple agents modify the same working directory concurrently.

Avoid parallel work on tightly coupled files unless explicitly coordinated.

---

## 6. Commit Principles

Commits should be:

- focused
- understandable
- reversible where practical
- related to the active task

Avoid mixing:

```text
feature implementation
+
unrelated refactor
+
format cleanup
+
random dependency upgrades
```

in one commit.

---

## 7. Commit Messages

Recommended format:

```text
<type>(<scope>): <summary>
```

Examples:

```text
feat(auth): add GitHub OAuth callback
fix(team): prevent capacity overflow
test(auth): add account-linking regression test
docs(architecture): record OAuth decision
```

Recommended types:

- `feat`
- `fix`
- `refactor`
- `test`
- `docs`
- `chore`
- `build`
- `ci`

If the project uses another convention, document it here.

---

## 8. Task References

Where practical, reference the task ID.

Example:

```text
feat(auth): add GitHub OAuth callback

TASK-XXX
```

This improves traceability.

---

## 9. Pull Requests

A PR should identify:

- related Task
- related ExecPlan if one exists
- purpose of the change
- important implementation notes
- verification performed
- known limitations

Do not rely on the PR description as the only source of task requirements.

---

## 10. Before Review

Before requesting review:

- implementation should be complete enough to evaluate
- relevant tests should run
- lint/type/build checks should pass where applicable
- known failures should be disclosed
- unrelated generated changes should be removed

---

## 11. Review Fixes

Review findings should normally be fixed in the same task branch.

Avoid creating unrelated changes while resolving review comments.

After meaningful fixes:

```text
Implement
→ Verify
→ Review again
```

---

## 12. Merge Strategy

Project merge strategy:

**Merge commit** (via pull request — never squash, never rebase-and-merge).

Use merge commits to preserve task-level commit traceability.

Rules:

- Work reaches `main` **only through a PR** — the Human owner merges.
- Keep merging from `main` into your branch to resolve drift (`git merge main`), rather than rebasing a branch others may have based on.
- Do not rewrite shared history without approval.

---

## 13. Conflict Resolution

When resolving conflicts:

1. Understand both sides of the change.
2. Do not blindly choose one version.
3. Preserve approved intent from both tasks where appropriate.
4. Re-run relevant verification afterward.

Complex conflicts require the human owner. There is **no Integrator role** in this project — see [EXECUTION_PLANS.md §7](../process/EXECUTION_PLANS.md).

---

## 14. Destructive Git Operations

Do not perform destructive operations casually.

Examples:

```text
git reset --hard
git push --force
history rewriting
branch deletion
```

Do not use these on shared work without explicit permission.

---

## 15. Agent Git Rules

Agents must:

- inspect current branch before editing
- avoid overwriting unrelated changes
- preserve work created by other agents
- report unexpected working-tree changes
- avoid committing secrets
- avoid force pushing unless explicitly authorized

If unexpected uncommitted work exists, do not silently discard it.

---

## 16. Integration

**Only the Human merges into `main`.** There is no Integrator role in this project ([EXECUTION_PLANS.md §7](../process/EXECUTION_PLANS.md)).

Integration work is therefore split as:

| Step | Who |
|---|---|
| combining branches / resolving conflicts | the branch owner (usually the Implementer), under Human instruction |
| running full relevant verification | Implementer runs it; Reviewer independently confirms (see [REVIEWER.md](../roles/REVIEWER.md)) |
| confirming integrated behaviour on `main` | **Human**, after the merge |

Individual branch success does not imply integration success — a green branch can still break on `main` once combined.

After a merge, record the outcome in the task board's `Merged` column (`Merged` + PR number); that field is Human-maintained ([STATES.md](../process/STATES.md) §1).

---

## 17. Completion

Before a task branch is considered complete:

- required code is committed
- verification results are recorded
- review findings are resolved
- relevant documentation is updated
- Task status is updated
- ExecPlan is completed when applicable

---

## 18. Prohibited Content

Never commit:

- credentials
- secrets
- private keys
- access tokens
- unnecessary local configuration
- personal development artifacts not intended for the repository

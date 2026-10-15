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

`<main | master | develop>`

The primary branch should remain buildable and stable.

Agents should not directly modify the primary branch unless explicitly allowed.

---

## 3. Branch Naming

Recommended format:

`task/<task-id>-<short-description>`

Examples:

```text
task/042-github-login
task/057-fix-team-capacity
```

Optional specialized prefixes:

```text
fix/
refactor/
docs/
chore/
```

Task ID should be preserved when available.

---

## 4. One Task, One Primary Branch

Each task should normally have one primary branch.

Example:

```text
TASK-042
↓
task/042-github-login
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
TASK-042

task/042-github-login
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

TASK-042
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

`<merge commit | squash | rebase and merge>`

Use one consistent strategy unless there is a specific reason not to.

Do not rewrite shared history without approval.

---

## 13. Conflict Resolution

When resolving conflicts:

1. Understand both sides of the change.
2. Do not blindly choose one version.
3. Preserve approved intent from both tasks where appropriate.
4. Re-run relevant verification afterward.

Complex conflicts may require the Integrator or human owner.

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

For multi-agent tasks, the Integrator is responsible for:

- combining branches
- resolving conflicts
- preserving task intent
- running full relevant verification
- confirming integrated behavior

Individual branch success does not imply integration success.

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
# SECURITY.md

> **Scope**: security rules for development and agent-assisted changes in this repository.
>
> **This document does not own the current security *state*.** The authoritative description of what is implemented (auth, CORS, log redaction, TLS, account operations) is [DEPLOYMENT.md §9](../../handbook/ops/DEPLOYMENT.md). This file owns the **rules** — what you must not break — and points to the state.
>
> **Why the split**: state changes with every task; rules change rarely. Mixing them is how a standards file starts lying about the code.

---

## 1. Security context

PortoMind is single-household, self-hosted and intended for a trusted LAN. Verify current authentication, authorization, session, CORS, transport and logging behavior against [DEPLOYMENT.md §9](../../handbook/ops/DEPLOYMENT.md), [ADR-001](../architecture/adr/ADR-001-authentication.md) and the code. This standards file defines rules, not an implementation status inventory.

## 2. Hard rules (violation = defect)

These are specific to this codebase. They are enforceable by reading a diff.

1. **The auth gate has exactly one mount point.** `app.use('/api', requireAuth)` covers every business route; `/api/auth/*` and `/api/users/*` mount before it and carry their own checks. **Never** copy "read cookie → look up session → check role" into a route, controller or middleware.
2. **No bypass switch.** Tests may stub the session lookup, but there must be **no** config flag, env var or branch that skips the gate. A "disable auth for tests" option is a BLOCKER, always.
3. **CORS stays an allow-list.** `origin: true` (or any permissive default) is forbidden. Production without `CORS_ORIGINS` must fail at boot rather than fall open.
4. **Credentials never reach logs.** No password, hash, session id or `MONGO_URI` in any log line, error body, trace or task record. Log through `logSanitizer`, never `console.log` with raw objects.
5. **Never weaken a control to make a test pass.** Disabling a guard, loosening a CORS rule, or hardcoding a credential to go green is a BLOCKER finding, not a shortcut.
6. **Secrets stay in `.env`.** Never commit credentials, tokens or keys; `.env` files are git-ignored and must not be added. Reference values as `process.env.X`, never inline strings.
7. **Authorize server-side, per resource.** A hidden button is not authorization. Ownership checks belong in `shared/service`, not in the component tree.
8. **Validate at the boundary.** All request bodies go through `requireJson` + schema/shape validation before touching a service. Do not trust a field because the UI only sends valid values.
9. **Outbound calls are wrapped.** External requests go through `withMarketDataTimeout` + `fetchWithRetry` — an unwrapped `axios.get` is both a reliability and an SSRF-shaped risk surface.
10. **No new data exposure by default.** Endpoints return the documented shape (see [API_CONTRACT.md](../../handbook/technical/API_CONTRACT.md)); do not add fields speculatively, and never return password hashes, session ids or other users' records.

> Rules 1, 3, 9 and the "no bypass switch" clause are the same constraints as [ARCHITECTURE.md §7](../architecture/ARCHITECTURE.md) items 7 and 10 — architectural and security views of one rule. If they ever disagree, §7 wins and this file is wrong.

---

## 3. Security-sensitive changes

The following changes are **security-sensitive** and require an approved ExecPlan (see [EXECUTION_PLANS.md](../process/EXECUTION_PLANS.md)) plus explicit Human approval — an agent may not make them on its own judgement:

- authentication or authorization logic, session lifecycle, cookie flags
- CORS configuration or allowed origins
- log redaction rules, or anything that changes what gets logged
- secrets handling, `.env` shape, credential rotation
- adding an endpoint that exposes user data, or widening an existing one
- adding a dependency that handles auth, crypto or outbound requests
- disabling, mocking or bypassing any guard for any reason

Ordinary changes inside these areas (a new field on an existing guarded endpoint) are allowed within a task scope — but say so in the handoff, because the reviewer will look.

---

## 4. What a security review must check

When a change touches any of the areas above, the reviewer verifies **both the allow and the deny path**:

- unauthenticated request → `401`, not data
- wrong role → `403`, not data
- another user's record → not reachable
- expired / revoked session → `401`
- invalid or oversized body → rejected before the service layer
- error responses → no stack trace, no internal path, no credential echo
- response body → no field that was not in the contract

A test that only proves the happy path does **not** constitute security review. Severity and verdict words are owned by [REVIEWER.md](../roles/REVIEWER.md) §5; apply the severity criteria there; BLOCKER findings must be resolved, while only MAJOR findings may be explicitly accepted under that policy.

---

## 5. Secrets

Never commit:

- passwords or password hashes
- private keys, certificates, keystores
- API tokens, session ids
- `.env` files or copies of them

`MONGO_URI` is the one credential this project cannot start without; treat it as a secret in local notes, issues and screenshots as well. If a secret is accidentally committed, **rotating it takes priority over removing it from history** — history rewriting does not un-leak a value.

---

## 6. Dependencies

- Prefer the existing stack; a new dependency is a scope decision, not an implementation detail.
- A dependency added for auth, crypto, HTTP or serialization needs Human approval (§3).
- Do not run `npm audit fix --force` or bulk-upgrade across major versions as part of an unrelated task. Dependency work has its own record: [DEPENDENCY_UPGRADES](../../development/exec-plans/completed/DEPENDENCY_UPGRADES.md).

---

## 7. Reporting security issues

This project is **single-household and self-hosted on a trusted LAN**. It has **no public disclosure channel, no bug bounty and no external security contact** — there is no hosted service and no third-party users to notify.

The process is internal:

1. **Do not open a public issue or publish details** anywhere the repository is mirrored.
2. Record the finding as a **task card** under `docs/development/tasks/active/` with severity (§4) and reproduction steps; if severity is unclear, append it to the current task's Coordination Notes.
3. **Tell the Human owner directly.** They alone decide disclosure, patch priority or forced credential rotation.
4. If credentials may be exposed, **rotate first, investigate second** — default admin password, `MONGO_URI`, `CORS_ORIGINS` values, session cookies.

Do not publish sensitive vulnerability details in public project documentation unless explicitly intended.

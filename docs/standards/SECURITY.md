# SECURITY.md

## 1. Purpose

This document defines baseline security rules for development and agent-assisted changes.

Security requirements take precedence over implementation convenience.

---

## 2. Core Principles

Apply:

- least privilege
- defense in depth
- secure defaults
- explicit authorization
- input validation
- secret protection
- minimal data exposure

Never assume an internal request is automatically trustworthy.

---

## 3. Authentication

Authentication logic must remain centralized according to `ARCHITECTURE.md`.

Do not:

- bypass authentication checks
- create alternate authentication paths without approval
- log passwords or authentication secrets
- weaken credential requirements silently

Authentication changes are security-sensitive and may require an ExecPlan and human review.

---

## 4. Authorization

Authentication answers:

`Who is the user?`

Authorization answers:

`What is the user allowed to do?`

Every protected operation must enforce authorization server-side.

Do not rely only on:

- hidden UI controls
- client-side routing
- frontend role checks

Resource ownership must be validated where applicable.

---

## 5. Secrets

Never commit:

- passwords
- private keys
- API secrets
- access tokens
- refresh tokens
- production credentials
- database passwords

Use approved secret-management mechanisms.

If a secret is accidentally committed:

1. Treat it as compromised.
2. Rotate or revoke it.
3. Remove it from active use.
4. Follow repository incident procedures.

Removing it from the latest commit alone is not sufficient.

---

## 6. Input Validation

Treat external input as untrusted.

Validate:

- type
- format
- length
- allowed values
- ownership
- permissions

Use parameterized database operations.

Avoid constructing executable queries from raw input.

---

## 7. Output and Data Exposure

Return only data required by the caller.

Do not expose:

- secrets
- internal stack traces
- unnecessary personal information
- internal infrastructure details
- sensitive identifiers without need

---

## 8. Logging

Logs must not contain:

- passwords
- authentication tokens
- private keys
- complete sensitive credentials

Be cautious with:

- email addresses
- user identifiers
- personal information
- request bodies

Log enough information for diagnosis without unnecessarily exposing user data.

---

## 9. Dependency Security

Before adding dependencies:

- prefer actively maintained libraries
- avoid unnecessary dependencies
- review known security concerns when relevant
- use supported versions

Security-critical dependency updates should receive appropriate verification.

---

## 10. File and Path Handling

When handling files:

- validate file type
- validate size
- prevent path traversal
- avoid trusting client-provided filenames
- store uploads outside executable locations where appropriate

---

## 11. External Services

External integrations must:

- use encrypted transport
- store credentials securely
- validate responses where appropriate
- apply least-privilege scopes
- handle failure safely

Do not request broader OAuth or API scopes than required.

---

## 12. Database Security

Use:

- least-privilege database credentials
- parameterized operations
- explicit authorization before sensitive data access
- appropriate constraints

Destructive operations require particular care.

---

## 13. Security-Sensitive Changes

Examples:

- authentication
- authorization
- permissions
- encryption
- secrets
- payments
- user privacy
- file uploads
- external callbacks
- administrative functionality

These changes should receive independent review when practical.

---

## 14. Agent Security Rules

Agents must not:

- disable security controls to make tests pass
- weaken authorization without explicit approval
- insert real credentials
- expose secrets in logs or documentation
- invent security assumptions when requirements are unclear

Security uncertainty should be surfaced, not silently guessed.

---

## 15. Security Review

Reviewers should check:

- authentication
- authorization
- input validation
- data exposure
- secret handling
- dependency risk
- privilege boundaries
- security regression risk

Security BLOCKER and MAJOR findings must be resolved before completion unless explicitly accepted by the human owner.

---

## 16. Reporting Security Issues

Record project-specific security reporting procedure here.

`<security contact / process>`

Do not publish sensitive vulnerability details in public project documentation unless explicitly intended.

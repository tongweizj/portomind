# ADR-XXX — <Decision Title>

## Status

`Proposed | Accepted | Rejected | Deprecated | Superseded`

Date:

`YYYY-MM-DD`

Decision Owner:

`<Human / Team / Role>`

Related Task:

`TASK-XXX`

Related ExecPlan:

`docs/exec-plans/active/TASK-XXX-xxx.md`

Supersedes:

`ADR-XXX`  
or  
`None`

Superseded By:

`ADR-XXX`  
or  
`None`

---

## 1. Context

Describe the situation that requires an architectural decision.

Explain:

- what problem exists
- why a decision is needed
- what part of the system is affected
- what constraints already exist
- why the current approach is insufficient

Keep this section focused on the problem, not the preferred solution.

Example:

The application currently stores user authentication state using server-side sessions.

The system is being expanded to support multiple frontend clients and external API consumers.

The current session architecture makes horizontal scaling and API authentication more difficult.

A decision is required on how authentication state should be handled going forward.

---

## 2. Decision Drivers

List the major factors influencing the decision.

Examples:

- security
- maintainability
- scalability
- implementation complexity
- operational complexity
- performance
- development speed
- existing team knowledge
- compatibility
- cost
- vendor lock-in

Example:

- Must support web and mobile clients.
- Must work across multiple backend instances.
- Must minimize authentication complexity.
- Must remain compatible with existing user accounts.
- Security is more important than implementation convenience.

---

## 3. Constraints

Record constraints that limit the available choices.

Examples:

- existing technology stack
- regulatory requirements
- hosting platform
- budget
- legacy compatibility
- delivery deadline
- existing API contracts
- database limitations

Example:

- Backend is implemented in ASP.NET Core.
- Existing users authenticate using email and password.
- Production infrastructure runs on AWS.
- Migration must not require users to reset their passwords.

---

## 4. Considered Options

### Option A — <Option Name>

Description:

Explain the approach.

Advantages:

- advantage
- advantage
- advantage

Disadvantages:

- disadvantage
- disadvantage
- disadvantage

Risks:

- risk
- risk

---

### Option B — <Option Name>

Description:

Explain the approach.

Advantages:

- advantage
- advantage

Disadvantages:

- disadvantage
- disadvantage

Risks:

- risk

---

### Option C — <Option Name>

Description:

Explain the approach.

Advantages:

- advantage

Disadvantages:

- disadvantage

Risks:

- risk

---

## 5. Decision

We will use:

**<Selected Option>**

Describe the selected architectural approach clearly.

The decision should state what the system will do, not just which technology was selected.

Example:

The backend will use short-lived access tokens together with rotating refresh tokens.

Access tokens will be used for API authorization.

Refresh tokens will be stored securely and may be revoked server-side.

Authentication logic will remain centralized in the authentication module.

---

## 6. Rationale

Explain why this option was selected.

Describe why it is preferable to the alternatives given the decision drivers and constraints.

Example:

This approach provides stateless API authorization while preserving the ability to revoke long-lived sessions.

It supports multiple frontend clients and horizontal backend scaling without requiring shared server-side session storage.

Although it adds refresh-token management complexity, this cost is acceptable because security and scalability are primary decision drivers.

---

## 7. Consequences

### Positive Consequences

- positive consequence
- positive consequence
- positive consequence

### Negative Consequences

- negative consequence
- negative consequence
- additional complexity introduced

### Trade-offs

Describe important compromises.

Example:

The system gains easier horizontal scaling but introduces additional complexity around refresh-token rotation and revocation.

---

## 8. Architectural Impact

Describe which parts of the architecture are affected.

Examples:

- modules
- APIs
- database schema
- deployment
- authentication
- infrastructure
- external integrations

Example:

Affected areas:

- Authentication module
- API middleware
- User session storage
- Database schema
- Frontend authentication flow

Unaffected areas:

- Team management
- Event discovery
- Admin reporting

---

## 9. Implementation Notes

Record only high-level implementation guidance required to preserve the architectural decision.

Do not turn this section into a detailed implementation plan.

Detailed implementation belongs in the relevant ExecPlan.

Example:

- Token issuance must remain inside the authentication module.
- Refresh tokens must not be stored in plaintext.
- API modules must not generate tokens directly.
- Existing authorization policies should remain unchanged.

---

## 10. Validation

Describe how the architecture decision will be validated.

Examples:

- architecture tests
- integration tests
- security tests
- load tests
- operational monitoring

Example:

The decision is considered successfully implemented when:

- authentication works across multiple backend instances
- expired access tokens are rejected
- refresh-token rotation is verified by integration tests
- revoked sessions cannot obtain new access tokens

---

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `<risk>` | `<impact>` | `<mitigation>` |
| `<risk>` | `<impact>` | `<mitigation>` |

---

## 12. Follow-up Actions

- [ ] Update `ARCHITECTURE.md`
- [ ] Create or update relevant ExecPlan
- [ ] Update tests
- [ ] Update security documentation
- [ ] Update deployment or operational documentation if required

---

## 13. References

Related documentation:

- `ARCHITECTURE.md`
- `<product specification>`
- `<ExecPlan>`
- `<previous ADR>`
- `<external technical documentation>`

---

## 14. Decision History

### YYYY-MM-DD

ADR created.

### YYYY-MM-DD

Decision accepted.

### YYYY-MM-DD

Decision revised / superseded / deprecated.

Record only meaningful changes to the architectural decision.
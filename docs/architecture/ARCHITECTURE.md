# Architecture

## 1. Purpose

This document provides a high-level architectural map of the system.

It describes:

- major system components
- module boundaries
- data flow
- dependencies
- external integrations
- important architectural constraints
- links to relevant ADRs and detailed design documents

This document should remain high-level.

Implementation details that change frequently should stay close to the code or in feature-specific design documents.

---

## 2. System Overview

Describe the system in a few paragraphs.

Include:

- what the system does
- who uses it
- major runtime components
- important external systems

Example:

The system is a web application that allows users to create accounts, manage profiles, and interact with project data.

The application consists of:

- a web frontend
- a backend API
- a relational database
- external authentication providers
- background services where required

---

## 3. Architecture Diagram

Provide a high-level diagram.

Example:

```text
Users
  │
  ▼
Frontend
  │
  ▼
Backend API
  │
  ├── Authentication
  ├── Business Services
  ├── Data Access
  │
  ▼
Database

Backend API
  │
  ├── External OAuth Providers
  ├── Email Service
  └── Other External APIs
```

Keep this diagram conceptual rather than file-level.

---

## 4. Major Components

Describe each major component.

### Frontend

Responsibilities:

- user interface
- client-side navigation
- form validation
- API communication
- presentation logic

Technology:

`<React / Next.js / Vue / etc.>`

Location:

`<path>`

Must not:

- directly access the database
- contain backend-only business rules
- store secrets

---

### Backend

Responsibilities:

- API endpoints
- business logic
- authorization
- orchestration
- integration with persistence and external services

Technology:

`<Spring Boot / ASP.NET Core / Express / etc.>`

Location:

`<path>`

---

### Database

Responsibilities:

- persistent application data
- constraints
- indexes
- transactional consistency

Technology:

`<PostgreSQL / SQL Server / MySQL / etc.>`

Schema location:

`<path or migration directory>`

---

### Background Processing

If applicable, describe:

- queues
- workers
- schedulers
- async jobs

If not used, state:

`Not currently used.`

---

## 5. Repository Structure

Document only important top-level areas.

Example:

```text
project/
├── frontend/
│   └── ...
├── backend/
│   └── ...
├── docs/
│   └── ...
├── tests/
│   └── ...
└── scripts/
    └── ...
```

Describe the responsibility of each major directory.

Example:

- `frontend/` — client application
- `backend/` — backend services and API
- `docs/` — project knowledge and engineering documentation
- `tests/` — integration and end-to-end tests
- `scripts/` — development and maintenance automation

Do not document every file.

---

## 6. Module Boundaries

Describe the main logical modules and their responsibilities.

Example:

### Authentication

Owns:

- registration
- login
- session management
- password reset
- external authentication

Must not own:

- profile business logic
- billing
- unrelated user preferences

---

### User Profile

Owns:

- profile data
- user preferences
- public profile presentation

Depends on:

- Authentication for user identity

---

### Teams

Owns:

- team creation
- membership
- invitations
- applications
- roster constraints

---

## 7. Dependency Rules

Document allowed and forbidden dependencies.

Example:

```text
Presentation
    ↓
Application
    ↓
Domain
    ↓
Infrastructure
```

Rules:

- presentation may depend on application
- application may depend on domain
- domain must not depend on presentation
- domain should not depend directly on infrastructure
- infrastructure may implement interfaces defined by upper layers

If the project uses another architecture style, describe it instead.

Examples:

- layered architecture
- clean architecture
- modular monolith
- microservices
- hexagonal architecture
- event-driven architecture

---

## 8. Data Flow

Describe important request or event flows.

Example:

### User Login

```text
User
  ↓
Frontend Login Form
  ↓
Authentication API
  ↓
Authentication Service
  ↓
User Repository
  ↓
Database
  ↓
Session / Token
  ↓
Frontend
```

### Data Update

```text
Frontend
  ↓
API
  ↓
Validation
  ↓
Business Logic
  ↓
Persistence
  ↓
Database
```

Only include major flows that help developers understand the system.

---

## 9. API Boundaries

Describe the main API style.

Example:

- REST
- GraphQL
- RPC
- event-based communication

Document:

- API location
- versioning policy
- authentication mechanism
- major API boundaries

Example:

```text
/api/auth/*
/api/users/*
/api/teams/*
/api/admin/*
```

Detailed endpoint documentation should live elsewhere.

---

## 10. Persistence Architecture

Describe:

- database type
- ORM or data-access technology
- migration mechanism
- transaction strategy
- important consistency rules

Example:

Database:

`PostgreSQL`

ORM:

`Prisma`

Migrations:

`prisma/migrations/`

Key rules:

- schema changes require migrations
- production migrations must be backward compatible where practical
- database constraints should enforce critical invariants

---

## 11. Authentication and Authorization

Describe the architecture, not every endpoint.

Include:

- authentication mechanism
- session/token strategy
- external identity providers
- authorization model
- role boundaries

Example:

Authentication:

- email/password
- GitHub OAuth
- Google OAuth

Authorization:

- role-based access control
- resource ownership checks

Roles:

- Participant
- Team Lead
- Admin

Security details may reference:

`docs/SECURITY.md`

---

## 12. External Integrations

List important external dependencies.

Example:

| Integration | Purpose | Direction |
|---|---|---|
| GitHub OAuth | Authentication | Outbound |
| Email Provider | Verification emails | Outbound |
| Payment Provider | Payments | Outbound |

For each integration, record important architectural constraints.

Do not store credentials in this document.

---

## 13. Runtime and Deployment

Describe the main deployment topology.

Example:

```text
Browser
   ↓
Frontend
   ↓
Backend API
   ↓
Database
```

Include:

- hosting platform
- runtime environment
- containers if used
- reverse proxy
- major infrastructure components

Example:

- Frontend: Vercel
- Backend: AWS ECS
- Database: AWS RDS
- Object storage: S3

Keep operational procedures in separate deployment documentation.

---

## 14. Configuration and Secrets

Describe how configuration is handled.

Example:

- local configuration uses environment variables
- production configuration is managed by the deployment platform
- secrets must never be committed to Git
- `.env.example` documents required environment variables

Reference relevant operational documentation if needed.

---

## 15. Cross-Cutting Concerns

Document architectural approaches for concerns that affect multiple modules.

### Logging

Describe logging approach.

### Error Handling

Describe common error model.

### Validation

Describe where validation occurs.

### Security

Reference the security architecture.

### Observability

Describe metrics, tracing, or monitoring if used.

### Caching

Describe caching if used.

---

## 16. Testing Architecture

Describe how the system is tested at a high level.

Example:

```text
Unit Tests
    ↓
Integration Tests
    ↓
End-to-End Tests
```

Record:

- major test locations
- integration test environment
- key architectural tests if any

Detailed test rules should live in a separate testing document.

---

## 17. Architectural Constraints

Record rules that agents and developers must preserve.

Examples:

- frontend must not access the database directly
- authentication logic must remain centralized
- business logic must not be implemented inside controllers
- critical invariants must be enforced server-side
- services must not bypass authorization checks
- external API clients must be isolated behind integration modules

These constraints should be stable and enforceable where possible.

---

## 18. Known Technical Debt

List important architectural debt only.

Example:

- authentication and profile modules are too tightly coupled
- several legacy endpoints bypass the new service layer
- integration tests require shared state

Detailed technical debt tracking may live elsewhere.

---

## 19. Architecture Decisions

Important architectural decisions are recorded as ADRs.

Location:

`docs/architecture/adr/`

Examples:

- ADR-001 — Use PostgreSQL
- ADR-002 — Use modular monolith
- ADR-003 — Use OAuth account linking

This document should summarize the current architecture, while ADRs explain why major decisions were made.

---

## 20. Related Documentation

- Product specifications: `docs/product/`
- Execution Plan rules: `docs/process/EXECUTION_PLANS.md`
- Active ExecPlans: `docs/tasks/active/`
- ADRs: `docs/architecture/adr/`
- Task list: `docs/tasks/TASKS.md`

---

## 21. Maintenance Rules

Update this document when:

- a major system component is added or removed
- module boundaries change
- dependency direction changes
- persistence architecture changes
- authentication architecture changes
- deployment topology changes
- major external integrations change

Do not update this document for every implementation detail.

Keep it accurate enough that a new developer or agent can understand the system before making significant changes.
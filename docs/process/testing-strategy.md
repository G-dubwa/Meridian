---
purpose: Map risks and work-package changes to verification layers.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Testing strategy

Meridian verifies each risk at the lowest useful layer and keeps a live-path
test for boundaries whose behaviour depends on a real runtime.

| Layer                         | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| Domain/application unit tests | Invariants, policies, schemas, and orchestration without I/O.  |
| Dependency rules              | Architectural direction plus deliberately failing fixtures.    |
| Database integration tests    | PostgreSQL migrations, constraints, RLS, and transactions.     |
| Playwright API/UI journeys    | Real Next.js, cookies, CSRF, sessions, recovery, and lockout.  |
| Document/schema checks        | Headers, links, generated dictionary, and migration snapshots. |
| Production builds             | Package exports and deployable application compilation.        |

`pnpm check` is the required local and CI gate. Authentication acceptance uses
an isolated PostgreSQL cluster, applies every committed migration, builds the
five runtime packages, starts a live Next.js server on a random local port, and
runs serial Playwright request journeys. It proves one-owner
bootstrap, successful and failed login, logout, renewal, password change,
one-time recovery, explicit revocation, and lockout. Database rows are inspected
to prove Argon2id password storage and hashed-only recovery/session secrets.

Tests may use synthetic fixture identifiers and passphrases only. Test output,
snapshots, traces, and screenshots must not contain credentials, recovery codes,
session cookies, journal content, or production data. A failed security journey
is a release blocker, not a candidate for retries that hide nondeterminism.

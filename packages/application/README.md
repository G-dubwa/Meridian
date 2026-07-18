---
purpose: Define the application package boundary.
audience: Contributors and coding agents.
authoritative-for: application responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# application

Responsibility: use-case contracts and workflow orchestration over domain-owned ports and transaction boundaries.

Exclusions: domain invariants, persistence, provider implementations, HTTP presentation, and worker hosting.

Allowed imports: `@meridian/domain` only. Application must not import any infrastructure package. The domain package never imports application.

`AuthenticationService` owns the local owner bootstrap, login, recovery,
session validation/renewal/revocation, password change, lockout, rate limiting,
and sanitized authentication-event orchestration. It receives password,
cryptographic, clock, ID, and transactional repository ports; no raw credential
is retained after the call.

`JournalService` owns stable entry creation, immutable revision append,
optimistic current-pointer/lifecycle changes, correlation-id idempotency,
content-free event/outbox orchestration, and the no-op material-change
invalidation boundary. It performs no model or provider work.

`ReliableEventService` owns content-free dispatch observations, numbered attempt
claims, consumer idempotency identity, bounded retry classification, duplicate
completion, and terminal recording. `OutboxHealthService` exposes scoped durable
state. Neither imports pg-boss, SQL, logging frameworks, or worker hosting.

Tests: dependency-cruiser proves application-to-infrastructure imports fail. The
authentication, journal, and event services are exercised through real
PostgreSQL, pg-boss, and live Next.js journeys. Unit tests cover schemas, the
no-op hook, retry/terminal transitions, and content-safe observations.

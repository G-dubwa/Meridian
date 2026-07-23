---
purpose: Define the infrastructure-db package boundary.
audience: Contributors and coding agents.
authoritative-for: infrastructure-db responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/adr/ADR-0003-postgresql-resource-foundation.md
---

# infrastructure-db

Responsibility: PostgreSQL/Drizzle schema, forward migrations, transaction-local owner scope, and adapter implementations for domain ports.

Exclusions: Domain policy, application orchestration, cryptographic implementation, HTTP, workers, provider integrations, embeddings, vector indexes, and partitioning.

Allowed imports: May import domain ports and infrastructure libraries.

The application entry point is `DrizzleTransactionManager`. It starts a database transaction, sets `meridian.user_id` locally, and exposes repositories bound to that transaction. Callers must not retain those repositories after the operation completes.

`DrizzleAuthenticationTransactionManager` is the separate pre-authentication
entry point for credential lookup, hashed recovery values, hashed sessions,
persisted abuse controls, and append-only authentication events. These technical
tables cannot require an owner scope before a session has established one and
must never be exposed directly to browser code. Production roles need explicit
least-privilege grants.

`resources` owns canonical resource identity; an entry subtype must be inserted in the same transaction. Forced RLS and owner-matching foreign keys provide defense in depth. Database owners are reserved for migrations and operations because PostgreSQL owners can bypass RLS.

Journal adapters append revisions, advance current state with an expected
version, query ordered history/activity, and write events/outbox transactionally.
`findCurrentForAiProcessing` filters active/current/Standard in SQL and is the
only AI-intended WP-05 entry query.

WP-06 adapters claim pending rows with `FOR UPDATE SKIP LOCKED`, enqueue pg-boss
jobs and mark `in_flight` in the same postgres-js transaction, claim numbered
attempts under RLS, and record success or sanitized terminal failure. The raw
transaction wrapper is intentionally narrow because the pinned pg-boss Drizzle
adapter targets a later Drizzle result shape. Health reads only counts and
content-free dead-letter summaries.

WP-07 adds forced-RLS integration accounts and append-only consent records.
Access/refresh columns accept encrypted-envelope ciphertext only and are cleared
on disconnect or revoked consent. The narrow OAuth authorization-session table
is a server-only technical callback boundary: state is hashed, the verifier is
encrypted, consumption is atomic/one-time, and persisted verifier ciphertext is
erased on consume.

WP-13A adds forced-RLS agenda blocks, daily task priorities, and Today
lifecycle receipts. Owner-matching foreign keys protect task/resource
relationships, unique date/position constraints plus a transaction advisory
lock enforce three priorities under concurrency, and optimistic versions make
undo fail closed after intervening changes.

Tests: `pnpm test:integration` creates a temporary PostgreSQL 18 cluster when
`TEST_DATABASE_URL` is absent. It covers empty and seeded migration paths,
installed-but-unused pgvector, unpartitioned tables, two-user isolation,
transactional resource creation, provenance deletion, authentication schema,
journal/worker migrations, immutable revisions, optimistic state, event/outbox
atomicity, retry idempotency, concurrent queue dispatch, terminal dead letters,
Private exclusion, Microsoft token lifecycle, exact-scope constraints, consent
immutability, integration RLS, local Today isolation, priority limits, and
lifecycle undo. Playwright proves journal, health, Microsoft Settings/status,
and local Today paths without contacting a provider.

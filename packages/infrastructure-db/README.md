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

Tests: `pnpm test:integration` creates a temporary PostgreSQL 18 cluster when
`TEST_DATABASE_URL` is absent. It covers empty and seeded migration paths,
installed-but-unused pgvector, unpartitioned tables, two-user isolation,
transactional resource creation, provenance deletion, authentication schema,
journal migration/backfill, immutable revisions, optimistic state, event/outbox
atomicity, retry idempotency, and Private exclusion. Playwright proves the full
authenticated journal path.

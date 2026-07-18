---
purpose: Record user-visible, engineering, documentation, and operational changes by release.
audience: Owner, operators, contributors, and coding agents.
authoritative-for: Chronological change history; requirements remain in product and decision records.
update-triggers: Every completed work package and release.
related-docs: release.md
---

# Changelog

## Unreleased

### Added

- WP-01 pnpm TypeScript monorepo with minimal web health page, worker shell, and twelve package boundaries.
- Strict formatting, linting, project-reference type checking, Vitest, Playwright scaffolding, dependency rules with a negative fixture, documentation validation, Gitleaks policy, and CI.
- Authoritative v1.2 specification, governed documentation hierarchy, project state and roadmap, ADR-0001/0002, and PDR-0001.
- WP-02 versioned branded identifiers, owner scope, authority and processing policies, typed domain errors, event envelope, repository and service ports.
- Application use-case and transaction-boundary contracts, generated-schema placeholders, and negative domain/application dependency fixtures.
- WP-03 PostgreSQL 18 and pgvector development service, Drizzle schema and forward-only migration snapshots for users, canonical resources, entries, revisions, provenance, domain events, outbox, and schema registry.
- Transaction-scoped Drizzle repositories with forced row-level security, owner-matching foreign keys, append-only controls, real two-user database tests, and generated data-dictionary drift checks.
- WP-04 one-time owner bootstrap with Argon2id credentials, hashed-only recovery codes, persisted abuse controls, append-only authentication audit, and revocable opaque sessions.
- Strict local-auth REST contracts, hardened cookies, double-submit/session-bound CSRF, login and Security UI, operator recovery/lockout/revocation runbooks, and seven live Playwright acceptance journeys.
- WP-05 stable journal identities, immutable revisions, processing-class-first capture, optimistic lifecycle, content-free domain events/outbox, correlation-id retries, and SQL-enforced Standard-only AI eligibility.
- Typed journal REST client/contracts, composer/timeline/detail/history/activity UI, forward hash/lifecycle migration, and live create-revise-Private-boundary Playwright evidence.
- WP-06 transactional outbox dispatch through pg-boss, separate worker runtime, bounded exponential retry, durable dead letters, strict content-free observations, and owner-only System health.
- Foundation WP-01–WP-06 release report with real concurrent-dispatch, journal-processing, retry/dead-letter, privacy, migration, and live-server evidence.

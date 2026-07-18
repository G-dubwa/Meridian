---
purpose: Plan and record WP-03 implementation and acceptance evidence.
audience: Owner, reviewers, contributors, and coding agents.
authoritative-for: WP-03 scope, exclusions, migrations, verification, review, and rollback evidence.
update-triggers: WP-03 plan, implementation, findings, checks, or completion state changes.
related-docs: ../work-package-template.md
---

# WP-03 — Database and resource foundation

## Status and dependencies

- Status: Complete
- Dependency: WP-02 complete and green at `3099a3d`
- Branch: `wp-03-database-resource-foundation`
- Started: 18 July 2026
- Completion commit: `WP-03: Database and resource foundation`

## Scope and exclusions

Add the PostgreSQL 18/pgvector development service, Drizzle schema and forward migrations, resource and persistence tables, domain-port adapters, transaction-local owner scope, forced RLS, migration acceptance tests, and generated schema documentation.

Exclude authentication, HTTP or UI features, worker processing, provider integrations, embeddings, vector columns or indexes, table partitioning, calendar execution, and production deployment.

## Change surface

- Packages: `domain` port records, `application` transaction scope, `infrastructure-db` schema/adapters.
- Schema: users, schema registry, resources, entries, revisions, derivation links, domain events, and outbox messages.
- API and UI: none.
- Events: persistence only; no concrete event type or publisher behaviour.
- Operations: Compose service, forward migration commands, temporary-cluster acceptance runner, backup-compatible schema contract.
- Documentation: ADR-0003, generated data dictionary, security, migration, backup, local development, state, roadmap, and changelog.

## Migration and rollback plan

`0000_wp03_database_foundation.sql` creates the typed table/constraint/index baseline. `0001_wp03_security_registry.sql` installs pgvector, seeds registry contracts, adds owner-matching composite constraints, enables and forces RLS, and installs append-only update triggers. Drizzle snapshots are committed and checked for consistency.

Before persistent data exists, rollback means reverting WP-03 and recreating the database. After data exists, migrations remain forward-only: stop writes and restore the last verified backup into a fresh database running the matching application commit. No reverse DDL is supplied.

## Tests and acceptance

The integration runner creates a data-checksummed PostgreSQL 18 cluster and proves:

- migrations apply to an empty database and pgvector 0.8.x is installed but unused;
- domain events and outbox messages remain unpartitioned;
- a seeded `0000` snapshot upgrades through `0001` without data loss;
- a non-owner application role with two fixture users cannot read across transaction scope;
- an entry cannot exist without its canonical resource and both can be created atomically;
- deleting source revision ownership through its entry removes dependent derivation links.

The full gate also checks migration snapshots, generated dictionary drift, dependency direction, formatting, linting, strict types, unit tests, document integrity, and production builds.

## Security and privacy

Forced RLS is database defense in depth, not authentication. Application transactions set owner scope locally and repositories remain bound to that transaction. Owner-matching foreign keys prevent cross-user relationships. Migration credentials and database owners are explicitly excluded from request handling because they can bypass RLS.

No personal fixture, production credential, external network call, model invocation, or provider data enters this package.

## Self-review

- Scope: no API, UI, auth, worker, provider, embedding, vector-index, partitioning, or calendar behaviour was added.
- Architecture: domain and application packages import no Drizzle; infrastructure implements domain ports and composition stays adapter-side.
- Ownership: all user data tables carry an owner, all are forced-RLS protected, and composite constraints reject cross-owner relationships.
- Transactions: resource/subtype creation and owner setting share one PostgreSQL transaction; adapters cannot silently fall back to an unscoped connection.
- Provenance: source resource and revision constraints cascade, so deletion cannot leave a valid derivation link to missing evidence.
- Evolution: migrations are forward-only, snapshots are checked, both empty and seeded paths execute, and the dictionary is generated from schema source.
- Operations: the schema is plain PostgreSQL and logically backup-friendly; production backup automation and restore evidence are correctly not claimed.
- Simplicity: personal-scale event and outbox tables are indexed but unpartitioned; pgvector is installed without speculative columns.

## Completion report

- Checks: formatting, lint, strict typecheck, 135-module architecture rules and negative fixture, Drizzle snapshots, 5 unit files/16 tests, 1 integration file/4 live PostgreSQL tests, 82-document and generated-dictionary validation, and every workspace build pass.
- Documentation: ADR-0003, generated data dictionary, database package contract, migrations, backup/restore, local development, security model, project state, roadmap, and changelog updated.
- Decisions: PostgreSQL/Drizzle, RLS, canonical resource identity, and forward-only migration policy are recorded in ADR-0003. No decision-needed record or owner action was required.
- Risks retired: implicit data scope, cross-owner persistence relationships, non-transactional subtype creation, orphaned derivation evidence, and unaudited schema drift.
- Limitations: no auth or production role provisioning exists; privileged database administrators remain trusted; production backups have not yet been scheduled or rehearsed.
- Rollback: recreate only while disposable; otherwise restore the last verified backup into a fresh database and deploy its matching revision.
- Next: WP-04 sequentially. No owner action required.

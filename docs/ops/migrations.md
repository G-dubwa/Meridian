---
purpose: Define forward-only schema migration and rollback policy.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../architecture/adr/ADR-0003-postgresql-resource-foundation.md
---

# Migrations

Drizzle table definitions live in `packages/infrastructure-db/src/schema.ts`. Committed SQL and snapshots live in `packages/infrastructure-db/migrations`; deployed migrations are immutable and forward-only.

Authentication migration `0002_wp04_local_owner_authentication.sql` adds only
technical identity, recovery, session, abuse-control, and audit tables. It must
run before owner bootstrap. Its singleton constraint makes a second owner
credential impossible even if two bootstrap attempts race; its recovery consume
and session revocation operations remain transactional.

Journal migration `0003_wp05_walking_journal_slice.sql` expands lifecycle
states, normalises placeholder hashes with PostgreSQL SHA-256 while user triggers
are temporarily disabled, immediately re-enables them, constrains hash length,
and adds the processing eligibility index.
`0004_wp05_command_idempotency.sql` adds the matching command uniqueness index;
the repository also serialises identical command keys transaction-locally.

## Authoring

1. Change the Drizzle schema.
2. Run `pnpm db:generate` and inspect every generated statement.
3. Add a named custom forward migration only for controls Drizzle does not model, such as extensions, forced row-level security, triggers, or deferrable composite constraints.
4. Run `pnpm docs:data:generate` and review the dictionary diff.
5. Run `pnpm db:check`, `pnpm test:integration`, and the full `pnpm check` gate.

Never edit a migration that may have run outside the current disposable development database. Correct it with a new migration. Destructive or long-locking changes require a backup, restore rehearsal, rollout plan, and accepted ADR.

## Applying

Set `DATABASE_URL` to an administrative migration connection and run `pnpm db:migrate`. Application credentials must not own tables or migrate schemas. CI verifies both an empty database and a seeded previous snapshot against PostgreSQL 18 with pgvector 0.8.x.

## Rollback

There are no down migrations. Before persistent data, recreate the disposable database. With persistent data, stop writes, restore the last verified backup into a fresh database, deploy the matching application revision, validate counts and ownership constraints, then switch traffic. Never improvise reverse DDL against the only copy of personal data.

---
purpose: Record the PostgreSQL resource, ownership, and migration foundation.
audience: Owner, contributors, operators, and coding agents.
authoritative-for: Persistence technology, owner isolation, resource identity, and migration direction.
update-triggers: Database technology, tenancy boundary, resource identity, or migration policy changes.
related-docs: ../../ops/migrations.md
---

# ADR-0003 — PostgreSQL resource foundation

- Status: Accepted
- Date: 18 July 2026
- Supersedes: None

## Context

Meridian needs durable personal data, revision provenance, reliable events, and a stable identity shared by present and future resource types. Owner scope must be enforced below application code, while early personal-scale operations should remain simple to back up and restore.

## Decision

Use PostgreSQL 18 with Drizzle-owned, forward-only SQL migrations. Install pgvector 0.8.x at cluster setup but add no vector columns or indexes before WP-19.

Every user-owned table carries an owner identifier and has forced row-level security. Application transactions set `meridian.user_id` transaction-locally before constructing scoped repository adapters. A `resources` row is the canonical identity and ownership anchor for each user-owned resource; subtype rows use the same identifier and an owner-matching foreign key. The schema registry versions resource and attributes contracts.

Keep domain and application packages free of Drizzle. Keep event and outbox tables unpartitioned until measured scale justifies an ADR. Entry revisions and domain events reject updates. Owner-matching foreign keys and cascades ensure deletion cannot leave valid derivation links to deleted source evidence.

## Consequences

Application access must use the transaction manager; an unscoped application connection sees no owner rows. Resource and subtype creation is atomic. PostgreSQL superusers and table owners bypass row-level security and therefore remain operational roles, never application credentials. Plain PostgreSQL tables remain compatible with `pg_dump` and `pg_restore`.

WP-19 may add model/version/dimension-tagged pgvector rows. Until a provider
model and measured indexing need are accepted, vectors remain variable
dimension with no HNSW/IVFFlat index. Partitioning remains deferred. New
resource types require a registry entry, migration, generated dictionary
update, and appropriate owner-scoped repository contract.

## Rollback

Before data exists, revert WP-03 and recreate the database. After data exists, do not reverse migrations in place: restore the last verified encrypted backup into a fresh database and deploy the matching application revision.

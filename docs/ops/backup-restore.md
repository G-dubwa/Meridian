---
purpose: Define encrypted backup and verified restore drills.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: migrations.md
---

# Backup and restore

Meridian uses PostgreSQL tables, constraints, policies, functions, triggers,
and pgvector. WP-19 introduces a provenance-bound vector column but no external
vector database, approximate index, partition, or opaque persistence service.
PostgreSQL logical backups plus the separately governed local knowledge object
store are therefore the portable recovery units.

## Backup contract

- Use PostgreSQL 18 `pg_dump --format=custom` with credentials that can read every owner row and schema object.
- Encrypt the resulting archive outside the database, restrict it to the owner, and record the application commit, migration journal, PostgreSQL version, pgvector version, timestamp, and checksum.
- Back up the local knowledge object store with the same recovery point and verify every retained object against its database content hash after restore.
- Never place an archive, encryption key, production URL, or personal fixture in the repository.
- A backup is not verified until it restores into a separate database and passes migration status, row-count, foreign-key, RLS, vector dimension/model provenance, object-hash, and application smoke checks.

Production scheduling, retention, encryption-key custody, and the first timed restore drill are deployment-gated work. Until then, this is the schema compatibility and rehearsal contract, not a claim that production backups exist.

## Restore outline

Create a fresh PostgreSQL 18 cluster, install pgvector 0.8.x, restore with
`pg_restore`, restore the matching knowledge object archive, deploy the recorded
application commit, and connect with non-owner application credentials. Confirm
two-user isolation, derivation integrity, immutable context manifests, vector
model/dimension provenance, and object hashes before directing any traffic to
the restored database. Preserve the prior database until the restore is
accepted.

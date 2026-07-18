---
purpose: Define Meridian security boundaries and required controls.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../architecture/adr/ADR-0003-postgresql-resource-foundation.md
---

# Security model

## Database trust boundary

Every user-owned WP-03 table stores an owner identifier. PostgreSQL forced row-level security compares it with the transaction-local `meridian.user_id`; the application transaction manager sets that value before exposing repositories. Repository methods also require `UserScope` where owner identity is not already carried by the record.

The application role is not a table owner, superuser, `BYPASSRLS` role, or migration role. Administrative connections are privileged and must never serve requests. Connection pooling is safe only because scope is local to a transaction and cleared by PostgreSQL at transaction end.

Owner-matching composite foreign keys prevent cross-owner subtype, revision, event, outbox, and derivation relationships. Entry creation requires its canonical resource in the same successful transaction. Entry revisions and domain events are append-only for updates; governed hard deletion can cascade to remove evidence and links.

## Current limits

WP-03 does not implement authentication, encryption-key management, production secrets, provider access, or a network API. Database encryption at rest, production backup automation, operational role provisioning, and connection TLS become deploy-time controls in their governing packages. Tests prove two-user data isolation using a real non-owner PostgreSQL role; they do not claim protection from a compromised database administrator.

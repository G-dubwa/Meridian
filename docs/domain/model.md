---
purpose: Describe canonical domain concepts generated or maintained from domain schemas.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Domain model

Versioned Zod schemas in `packages/domain` define boundary values and contracts. Drizzle definitions and forward migrations define their WP-03 persistence representation; the generated data dictionary reports that representation.

## Foundation primitives

- Branded UUIDs prevent accidental interchange of users, resources, entries, revisions, events, outbox messages, derivation links, and sessions.
- `UserScope { userId }` is explicit at every user-owned repository boundary.
- Authority tiers `T0` through `T4` map to activity visibility, inline reversible receipt, Triage, exact approval, and rejection respectively. `T4` cannot execute.
- Processing classes are `standard | sensitive | private`. Private permits local display only. Sensitive external routes require route-specific explicit consent. Privacy may be raised but never lowered by deterministic screening.
- Typed domain errors have stable codes for validation, authority, prohibited action, processing violation, not found, and conflict.

## Ports

Repository ports cover users, resources, entries, immutable revisions, domain
events, outbox, and derivation links. Journal ports add owner-scoped list/history,
optimistic updates, correlation lookup, activity, and a SQL-enforced active
Standard-only current-revision query. Service ports cover clock, UUIDs,
transactions, secrets, and invalidation.

The event envelope is schema version 1. WP-05 registers five content-free journal
events and writes one matching pending outbox record in the state transaction.

## Persistence invariants

- A `resource` is the canonical identifier and owner anchor for every user-owned subtype. An entry uses the same identifier as its resource and must be created transactionally with it.
- An entry points to its current revision while revision rows remain append-only. Owner-matching foreign keys prevent cross-user references.
- Entry versions provide optimistic concurrency. Lifecycle is active, archived,
  or deletion requested; a request does not execute hard deletion.
- Processing class lives on every revision. Only current active Standard
  revisions are eligible through the AI-intended repository port.
- A derivation link records its derived resource plus source resource and/or exact source revision. Deleting source evidence cascades so a valid link cannot outlive its source.
- Domain events are append-only and outbox messages reference an exact owner-matching event. Both tables remain unpartitioned at personal scale.
- The schema registry versions resource and attributes contracts. pgvector is installed but no vector representation exists before WP-19.

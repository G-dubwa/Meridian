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

Repository ports cover users, resources, entries, immutable entry revisions, domain events, outbox messages, and derivation links. Service ports cover clock, UUID generation, transaction management, password hashing, session storage, and event publication. WP-03 supplies PostgreSQL repository and transaction adapters only; the other services remain ports.

The domain-event envelope is schema version 1 and carries event identity/type, occurred time, owner scope, optional aggregate and causation, required correlation, and an unknown-safe payload. Concrete event types begin in the work package that introduces their behaviour.

## Persistence invariants

- A `resource` is the canonical identifier and owner anchor for every user-owned subtype. An entry uses the same identifier as its resource and must be created transactionally with it.
- An entry points to its current revision while revision rows remain append-only. Owner-matching foreign keys prevent cross-user references.
- A derivation link records its derived resource plus source resource and/or exact source revision. Deleting source evidence cascades so a valid link cannot outlive its source.
- Domain events are append-only and outbox messages reference an exact owner-matching event. Both tables remain unpartitioned at personal scale.
- The schema registry versions resource and attributes contracts. pgvector is installed but no vector representation exists before WP-19.

---
purpose: Describe canonical domain concepts generated or maintained from domain schemas.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Domain model

WP-02 establishes contracts, not stored entities. Versioned Zod schemas in `packages/domain` are authoritative; this document reports them.

## Foundation primitives

- Branded UUIDs prevent accidental interchange of users, resources, entries, revisions, events, outbox messages, derivation links, and sessions.
- `UserScope { userId }` is explicit at every user-owned repository boundary.
- Authority tiers `T0` through `T4` map to activity visibility, inline reversible receipt, Triage, exact approval, and rejection respectively. `T4` cannot execute.
- Processing classes are `standard | sensitive | private`. Private permits local display only. Sensitive external routes require route-specific explicit consent. Privacy may be raised but never lowered by deterministic screening.
- Typed domain errors have stable codes for validation, authority, prohibited action, processing violation, not found, and conflict.

## Ports

Repository ports cover users, resources, entries, immutable entry revisions, domain events, outbox messages, and derivation links. Service ports cover clock, UUID generation, transaction management, password hashing, session storage, and event publication. No adapter exists in WP-02.

The domain-event envelope is schema version 1 and carries event identity/type, occurred time, owner scope, optional aggregate and causation, required correlation, and an unknown-safe payload. Concrete event types begin in the work package that introduces their behaviour.

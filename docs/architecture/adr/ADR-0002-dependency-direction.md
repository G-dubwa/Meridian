---
purpose: Record the canonical inward dependency direction.
audience: Owner, contributors, and coding agents.
authoritative-for: Allowed module imports and automated architecture rules.
update-triggers: A module responsibility or dependency direction changes.
related-docs: ../module-map.md
---

# ADR-0002 — Dependency direction

- Status: Accepted
- Date: 18 July 2026
- Supersedes: None

## Context

Domain truth must remain independent of frameworks and providers. Web and workers require shared orchestration without direct database coupling.

## Decision

Presentation calls application services; application orchestrates domain rules and ports; infrastructure implements ports. Domain imports no application, adapter, framework, prompt, or UI package. Prompts may import domain output schemas, never the reverse. Frontend state contains no business invariants.

Dependency-cruiser enforces these constraints and a deliberately invalid domain-to-infrastructure fixture proves the negative rule.

## Consequences

Some adapter wiring remains at composition roots. Cross-package convenience imports are rejected. Any exception requires an accepted superseding ADR and adjusted executable rule.

## Rollback

Revert the WP-01 commit before dependent packages exist; after that, restore the last accepted rules and refactor violating imports inward.

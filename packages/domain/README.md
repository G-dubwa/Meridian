---
purpose: Define the domain package boundary.
audience: Contributors and coding agents.
authoritative-for: domain responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# domain

Responsibility: Domain entities, invariants, schemas, ports, and events.

Exclusions: Application, adapters, frameworks, prompts, and UI.

Allowed imports: No Meridian package imports are allowed in WP-01.

Tests: WP-01 supplies only the repository-wide placeholder and architecture fixture; behaviour tests arrive with the package's first scoped capability.

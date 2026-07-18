---
purpose: Define the scheduling package boundary.
audience: Contributors and coding agents.
authoritative-for: scheduling responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# scheduling

Responsibility: Deterministic availability and block proposals.

Exclusions: Calendar writes and model-generated arithmetic.

Allowed imports: May import domain types only.

Tests: WP-01 supplies only the repository-wide placeholder and architecture fixture; behaviour tests arrive with the package's first scoped capability.

---
purpose: Define the analytics package boundary.
audience: Contributors and coding agents.
authoritative-for: analytics responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# analytics

Responsibility: Registered deterministic calculations and refusal semantics.

Exclusions: Generated executable analytics and presentation charts.

Allowed imports: May import domain evidence types only.

Tests: WP-01 supplies only the repository-wide placeholder and architecture fixture; behaviour tests arrive with the package's first scoped capability.

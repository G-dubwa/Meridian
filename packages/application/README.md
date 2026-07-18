---
purpose: Define the application package boundary.
audience: Contributors and coding agents.
authoritative-for: application responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# application

Responsibility: Use cases and workflow orchestration over domain ports.

Exclusions: Persistence and provider implementations.

Allowed imports: May import domain only.

Tests: WP-01 supplies only the repository-wide placeholder and architecture fixture; behaviour tests arrive with the package's first scoped capability.

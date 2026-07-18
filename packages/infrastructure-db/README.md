---
purpose: Define the infrastructure-db package boundary.
audience: Contributors and coding agents.
authoritative-for: infrastructure-db responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# infrastructure-db

Responsibility: Database adapter implementations for domain ports.

Exclusions: Domain policy and application orchestration.

Allowed imports: May import domain ports and infrastructure libraries.

Tests: WP-01 supplies only the repository-wide placeholder and architecture fixture; behaviour tests arrive with the package's first scoped capability.

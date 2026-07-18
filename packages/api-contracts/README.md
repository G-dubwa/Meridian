---
purpose: Define the api-contracts package boundary.
audience: Contributors and coding agents.
authoritative-for: api-contracts responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# api-contracts

Responsibility: Canonical OpenAPI generation and generated web client.

Exclusions: Business rules and alternate API protocols.

Allowed imports: May import domain boundary schemas when introduced.

Tests: WP-01 supplies only the repository-wide placeholder and architecture fixture; behaviour tests arrive with the package's first scoped capability.

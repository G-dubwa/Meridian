---
purpose: Define the infrastructure-ms-graph package boundary.
audience: Contributors and coding agents.
authoritative-for: infrastructure-ms-graph responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# infrastructure-ms-graph

Responsibility: Microsoft Graph calendar and task adapters plus fixtures.

Exclusions: Provider-independent policy and presentation.

Allowed imports: May import domain ports and application adapter contracts.

Tests: WP-01 supplies only the repository-wide placeholder and architecture fixture; behaviour tests arrive with the package's first scoped capability.

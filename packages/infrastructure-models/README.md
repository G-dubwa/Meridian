---
purpose: Define the infrastructure-models package boundary.
audience: Contributors and coding agents.
authoritative-for: infrastructure-models responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# infrastructure-models

Responsibility: Model and embedding provider adapters.

Exclusions: Prompts, domain truth, and provider-specific policy leakage.

Allowed imports: May import domain ports and prompt contracts.

Tests: WP-01 supplies only the repository-wide placeholder and architecture fixture; behaviour tests arrive with the package's first scoped capability.

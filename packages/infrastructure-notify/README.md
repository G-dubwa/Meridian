---
purpose: Define the infrastructure-notify package boundary.
audience: Contributors and coding agents.
authoritative-for: infrastructure-notify responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# infrastructure-notify

Responsibility: Notification delivery adapters.

Exclusions: Reminder policy and application orchestration.

Allowed imports: May import domain ports and provider libraries.

Tests: WP-01 supplies only the repository-wide placeholder and architecture fixture; behaviour tests arrive with the package's first scoped capability.

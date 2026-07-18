---
purpose: Define the retrieval package boundary.
audience: Contributors and coding agents.
authoritative-for: retrieval responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# retrieval

Responsibility: Search, chunking, privacy filtering, and context assembly.

Exclusions: Provider SDKs and durable domain policy.

Allowed imports: May import domain and application contracts.

Tests: WP-01 supplies only the repository-wide placeholder and architecture fixture; behaviour tests arrive with the package's first scoped capability.

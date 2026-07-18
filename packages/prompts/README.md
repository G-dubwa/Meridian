---
purpose: Define the prompts package boundary.
audience: Contributors and coding agents.
authoritative-for: prompts responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# prompts

Responsibility: Versioned prompts, output schemas, and prompt catalogue.

Exclusions: Provider SDKs and domain policy.

Allowed imports: May import domain schemas; domain never imports prompts.

Tests: WP-01 supplies only the repository-wide placeholder and architecture fixture; behaviour tests arrive with the package's first scoped capability.

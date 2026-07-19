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

WP-08 registers `task-routing-evaluation` 1.0.0 with a strict output schema,
explicit abstention, and synthetic task-class contract. It is evaluation-only
and has no authority to execute proposals or write domain state.

Tests: Schema strictness, proposal bounds, versioned exports, and deterministic
evaluation scoring are covered without provider traffic.

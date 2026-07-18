---
purpose: Define the api-contracts package boundary.
audience: Contributors and coding agents.
authoritative-for: api-contracts responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# api-contracts

Responsibility: canonical OpenAPI generation, generated web client, and the registry of versioned boundary schemas eligible for generation.

Exclusions: HTTP handlers, business rules, and alternate API protocols.

Allowed imports: versioned public schemas from `@meridian/domain`; no application or infrastructure implementation.

Tests: WP-02 exposes a typed generated-schema placeholder. Contract generation and diff tests arrive with the first HTTP API package.

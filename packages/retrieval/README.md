---
purpose: Define the retrieval package boundary.
audience: Contributors and coding agents.
authoritative-for: retrieval responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# retrieval

Responsibility: Privacy-filtered search, separated evidence-lane ranking,
embedding adapter primitives, and deterministic context assembly.

Exclusions: Provider SDKs, provider/model selection, durable domain policy,
automatic surfacing, and model response generation.

Allowed imports: May import domain and application contracts.

Tests: WP-19 covers query normalization, fail-closed lane validation,
deterministic ordering/deduplication, reference-only manifest assembly,
disabled runtime behavior, and fixture-only embeddings. PostgreSQL integration
tests cover actual full-text/pgvector search and source privacy triggers.

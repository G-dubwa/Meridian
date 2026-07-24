---
purpose: Define the knowledge package boundary.
audience: Contributors and coding agents.
authoritative-for: knowledge responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# knowledge

Responsibility: local document safety screening, deterministic parsing and
chunking, content hashing, and content-addressed original storage.

Exclusions: model extraction, embeddings, OCR, office conversion, personal
evidence conflation, and automatic protocol activation.

Allowed imports: `@meridian/domain` plus parser/storage implementation
libraries. It must not import application services, persistence, web, model, or
provider adapters.

Tests: WP-18 unit tests cover formats, exact spans, active-PDF and malware-test
screening, limits, path confinement, duplicate storage, and corruption
detection. PostgreSQL and authenticated journeys cover full orchestration.

---
purpose: Define the thin web presentation application.
audience: Contributors and coding agents.
authoritative-for: Web application responsibility and import boundaries.
update-triggers: Web responsibility, imports, tests, or routes change.
related-docs: ../../docs/architecture/module-map.md
---

# Web application

Responsibility: mobile-responsive UI and thin REST presentation. WP-01 includes only `/health`.

Exclusions: domain invariants, persistence, provider calls, and business orchestration. Allowed imports are `application`, generated `api-contracts`, and display-only dependencies. Tests begin with the Playwright health scaffold; authoritative architecture is ADR-0002.

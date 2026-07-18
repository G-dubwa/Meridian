---
purpose: Define the separate asynchronous worker process.
audience: Contributors and coding agents.
authoritative-for: Worker responsibility and import boundaries.
update-triggers: Worker responsibility, imports, jobs, or tests change.
related-docs: ../../docs/architecture/module-map.md
---

# Worker application

Responsibility: host job consumers and scheduled workflows. WP-01 is a non-running typed placeholder.

Exclusions: domain rules and direct adapter orchestration. It may call application services; tests are added with worker behaviour. Authoritative architecture is ADR-0002.

---
purpose: Define the separate asynchronous worker process.
audience: Contributors and coding agents.
authoritative-for: Worker responsibility and import boundaries.
update-triggers: Worker responsibility, imports, jobs, or tests change.
related-docs: ../../docs/architecture/module-map.md
---

# Worker application

Responsibility: host reliable asynchronous consumers. WP-06 runs a separate
Node process, atomically dispatches owner-scoped outbox work to pg-boss, applies
bounded retry/dead-letter policy, and emits content-free structured lifecycle
observations.

Exclusions: domain rules, provider side effects, schedules, and adapter access
outside `src/composition.ts`. Runtime handlers call application services; the
composition root alone constructs PostgreSQL and queue adapters. Authoritative
architecture is ADR-0002 and ADR-0006.

Build with `pnpm --filter @meridian/worker build`; run the built process with
`DATABASE_URL=… pnpm --filter @meridian/worker start`. Bootstrap and migrations,
including pg-boss schema installation, precede runtime startup. Stop with
SIGTERM/SIGINT for a bounded graceful drain.

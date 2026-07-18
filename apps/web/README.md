---
purpose: Define the thin web presentation application.
audience: Contributors and coding agents.
authoritative-for: Web application responsibility and import boundaries.
update-triggers: Web responsibility, imports, tests, or routes change.
related-docs: ../../docs/architecture/module-map.md
---

# Web application

Responsibility: mobile-responsive UI, thin REST presentation, and explicit
server-process composition. WP-04 includes `/login`, `/settings/security`, and
the `/api/auth/*` routes while preserving the unauthenticated `/health` page.

Exclusions: domain invariants, persistence policy, provider calls, and business
orchestration. Client/presentation sources import application contracts and API
schemas only. `app/_server/composition.ts` is the sole exception permitted to
construct cryptographic and database adapters; route handlers consume its
service facade.

Authentication uses hardened cookie transport, no-store responses, strict
boundary validation, double-submit/session-bound CSRF, and generic error bodies.
Playwright covers a live Next.js server and real PostgreSQL path.
Authoritative architecture is ADR-0002 and ADR-0004.

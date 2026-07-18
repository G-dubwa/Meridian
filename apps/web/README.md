---
purpose: Define the thin web presentation application.
audience: Contributors and coding agents.
authoritative-for: Web application responsibility and import boundaries.
update-triggers: Web responsibility, imports, tests, or routes change.
related-docs: ../../docs/architecture/module-map.md
---

# Web application

Responsibility: mobile-responsive UI, thin REST presentation, and explicit
server-process composition. It includes `/login`, `/settings/security`,
`/journal`, `/journal/[entryId]`, and the auth/journal REST routes while
preserving `/health`.

Exclusions: domain invariants, persistence policy, provider calls, and business
orchestration. Client/presentation sources import application contracts and API
schemas only. `app/_server/composition.ts` is the sole exception permitted to
construct cryptographic and database adapters; route handlers consume its
service facade.

Authentication uses hardened cookie transport, no-store responses, strict
boundary validation, double-submit/session-bound CSRF, and generic error bodies.
Journal presentation exposes processing class before save, immutable history,
optimistic edit/archive/deletion request, and a content-free activity ledger.
Playwright covers live Next.js and PostgreSQL. Architecture is ADR-0002,
ADR-0004, and ADR-0005.

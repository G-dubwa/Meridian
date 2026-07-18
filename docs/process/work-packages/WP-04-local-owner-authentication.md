---
purpose: Plan and record WP-04 implementation and acceptance evidence.
audience: Owner, reviewers, contributors, and coding agents.
authoritative-for: WP-04 scope, exclusions, migration, security, verification, review, and rollback evidence.
update-triggers: WP-04 plan, implementation, findings, checks, or completion state changes.
related-docs: ../../architecture/adr/ADR-0004-local-owner-authentication.md
---

# WP-04 — Local owner authentication

## Status and dependencies

- Status: Complete
- Dependency: WP-03 complete and green at `5061805`
- Branch: `wp-04-local-owner-authentication`
- Started: 18 July 2026
- Completion commit: `WP-04: Local owner authentication`

## Scope and exclusions

Add an operator-only singleton owner bootstrap, Argon2id passphrase credential,
ten one-time recovery codes, local login/logout, session validation and renewal,
password change, recovery login, session revocation, persisted abuse controls,
sanitized authentication audit, strict REST contracts, hardened cookie/CSRF
presentation, and minimal Login and Settings > Security surfaces.

Exclude Microsoft/external identity, WebAuthn, magic links, password-reset email,
recovery-code regeneration, journal resources, provider integrations, workers,
model use, Graph access, notification delivery, and production deployment.

## Change surface

- Domain: normalized owner identifier, passphrase/recovery schemas, stable auth
  errors, authentication records, repository/transaction/crypto ports, and audit
  vocabulary.
- Application: bootstrap, login, recovery, session lifecycle, password change,
  revocation, rate limit, lockout, and audit orchestration.
- Infrastructure: Node crypto/Argon2id adapters and Drizzle authentication
  repositories/transaction manager.
- Schema: credentials, recovery codes, sessions, rate limits, and authentication
  events in migration `0002`.
- API/UI: eight `/api/auth/*` endpoints, `/login`, and
  `/settings/security`.
- Operations: bootstrap CLI, isolated authentication E2E runner, CI gate,
  threat model, and bootstrap/recovery/lockout/revocation runbook.

## Migration and rollback plan

`0002_wp04_local_owner_authentication.sql` upgrades the WP-03 schema without
changing resource rows. It adds singleton/Argon2id/hash/expiry constraints,
lookup indexes, and an update-rejecting authentication-event trigger. Empty and
seeded migration paths run in real PostgreSQL acceptance tests.

Before persistent data exists, rollback means reverting WP-04 and recreating the
database. After bootstrap or personal data exists, migrations remain
forward-only: stop writes, restore the last verified backup into a fresh
PostgreSQL 18/pgvector database, and deploy its matching application commit.
Deleting the owner credential or manually un-consuming recovery codes is not a
rollback.

## Tests and acceptance

The serial Playwright suite creates an isolated PostgreSQL cluster, applies all
migrations, builds the runtime packages, starts a live Next.js server, and
proves:

- exactly one owner bootstraps, the password column contains Argon2id, ten
  recovery rows contain only 64-character hashes, and a second bootstrap fails;
- login requires CSRF, failed login is generic and audited, successful login
  receives a hardened HttpOnly Strict session cookie, and logout invalidates it;
- renewal rotates the session and password change succeeds without returning
  credentials;
- one recovery code authenticates once, revokes prior sessions, never appears in
  a response, and fails generically on reuse;
- explicit all-session revocation invalidates the browser and the Security page
  is served;
- five failures lock the credential while public responses do not disclose the
  lock state.

Live integration tests also apply the authentication migration on empty and
seeded schemas. The full gate covers formatting, lint, strict type checking,
dependency direction, migration snapshots, unit/integration/E2E tests,
documentation/generated dictionary drift, and every production build.

## Security and privacy

Raw passphrases, recovery codes, bearer/CSRF tokens, IP addresses, and user-agent
values are excluded from persistence, audit, API response bodies, and ordinary
logs. Request metadata is hashed at the HTTP boundary. Public auth failures are
generic; more precise reason codes are confined to append-only audit rows.

Content tables retain WP-03 forced RLS. Authentication tables form the narrow
pre-owner-scope boundary required to resolve a credential or session and are
server-only through the explicit composition root. Least-privilege production
grants and TLS remain deployment requirements. Recovery code use is atomic
consume-and-revoke and intentionally does not mint API-visible replacements.

## Self-review

- Scope: no Microsoft, WebAuthn, magic-link, journal, worker, model, Graph, or
  notification capability entered the package.
- Architecture: application imports domain only; crypto and Drizzle remain
  adapters; only the exact web composition root imports infrastructure.
- Credential handling: Argon2id hashes passwords; SHA-256 hashes random opaque
  values; strict response schemas cannot serialize secret material.
- Session security: production cookies are host-only Secure/Strict, bearer is
  HttpOnly, CSRF is double-submit and session-bound, and idle/absolute expiry,
  rotation, and revocation are explicit. Idle touches are capped at absolute
  expiry and exercised at that boundary.
- Abuse resistance: persistent fingerprint/identifier rate limiting and
  credential lockout remain generic externally and auditable internally.
- Recovery: bootstrap displays codes once; consumption is atomic and concurrent
  reuse-safe; success revokes old sessions and returns no replacement secret.
- Operations: normal bootstrap, recovery, lockout, and emergency revocation have
  bounded procedures and prohibit destructive credential shortcuts.
- Simplicity: no provider abstraction, refresh-token subsystem, queue, or remote
  cache was added for a one-owner local boundary.

## Completion report

- Checks: formatting, lint, strict typecheck, 52-module/67-dependency
  architecture rules and negative fixture, Drizzle snapshot consistency, 5 unit
  files/18 tests, 1 integration file/4 live PostgreSQL tests, 7 live Next.js and
  PostgreSQL Playwright journeys, 85-document/generated-dictionary validation,
  and every workspace production build pass.
- Documentation: OpenAPI/auth conventions and errors, ADR-0004, generated data
  dictionary, package boundaries, threat/security models, local development,
  migrations, bootstrap/recovery/lockout/emergency-revocation runbooks, testing
  strategy, project state, roadmap, and changelog updated.
- Decisions: local-only singleton owner, Argon2id, hashed one-time recovery,
  opaque hashed sessions, strict cookies/session-bound CSRF, persistent abuse
  controls, and the narrow pre-authentication database boundary are recorded in
  ADR-0004. No decision-needed record or owner action was required.
- Risks retired: Microsoft-dependent access, plaintext/reusable database secret
  storage, recovery replay, unbounded guessing, non-revocable sessions, missing
  CSRF, bootstrap duplication, credential-bearing API bodies, and silent login
  failures.
- Limitations: recovery is finite; a compromised host/process/administrator
  remains trusted; production HTTPS, proxy trust, database grants, secret
  custody, monitoring, and backup operations remain deployment work.
- Rollback: recreate only while disposable; otherwise restore the last verified
  backup into a fresh database and deploy its matching revision.
- Next: WP-05 sequentially. No owner action required.

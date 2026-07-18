---
purpose: Plan and record WP-07 Microsoft connection and consent implementation.
audience: Owner, reviewers, contributors, operators, and coding agents.
authoritative-for: WP-07 scope, exclusions, migration, security, verification, live gate, and rollback evidence.
update-triggers: WP-07 plan, implementation, findings, checks, live consent, or completion state changes.
related-docs: ../../integrations/microsoft-calendar.md
---

# WP-07 — Microsoft connection and consent

## Status and dependencies

- Status: Complete
- Dependency: WP-06 complete at `2aa1d357fe6767788d7233932a84386f72e0762c`
- Branch: `wp-07-microsoft-connection-consent`
- Started: 18 July 2026
- Completion commit: `WP-07: Microsoft connection and consent`

## Scope and exclusions

Connect one personal Microsoft account through authorization code plus S256
PKCE, persist encrypted token custody, refresh rotated tokens, display connection
state, and keep append-only consent evidence. The exact approved delegated
scope tuple is `openid`, `profile`, `offline_access`, `User.Read`, and
`Calendars.Read`.

Exclude calendar event reads/sync, calendar writes, mail, Microsoft To Do,
shared calendars, application permissions, organizational accounts, provider
identity for Meridian login, scheduling, notifications, and external writes.

## Acceptance evidence

- Strict unit tests cover exact-scope rejection, consumers-only URLs, S256 PKCE,
  context-bound AES-256-GCM, sanitized token failures, minimal profile reads,
  local configuration, API non-disclosure, and environment-file policy.
- Eight live PostgreSQL tests cover empty/seeded migration, one-time state and
  verifier erasure, encrypted tokens, RLS, consent append-only enforcement,
  refresh rotation, disconnect, reauthorization, and atomic integration events.
- Eight live Next.js/PostgreSQL journeys retain prior behaviour and prove
  unauthenticated rejection, configured status, typed unavailable behaviour,
  and the Settings surface.
- The full repository gate passes: formatting, lint, strict types, 88
  modules/151 dependencies and negative fixture, migration consistency, 8 unit
  files/31 tests, 1 live PostgreSQL file/8 tests, 8 live Next.js/PostgreSQL
  journeys, 93 governed documents/current dictionary, OpenAPI parse, and all
  workspace production builds.
- Owner-controlled live Microsoft acceptance passed on 18 July 2026. The
  consent ledger recorded `granted` at 22:21:08 SAST and `disconnected` at
  22:22:55 SAST. Both records showed exactly `openid profile offline_access
User.Read Calendars.Read`; the consent request showed no additional
  permission.

## Security, privacy, and operations

The authorization callback consumes a random hashed state once within ten
minutes and never returns provider diagnostics. Tokens and PKCE verifiers are
encrypted with an external 32-byte key; access tokens never enter API contracts,
events, UI, or logs. Integration accounts and consent records use forced RLS.
Consent events contain opaque integration/correlation identities, state labels,
exact scopes, and timestamps—not journal or provider content.

Local Microsoft configuration is optional: without all four variables the
existing application remains available and Connect returns a stable 503. The
client secret, encryption key, codes, and tokens must never be pasted into chat,
committed, or logged.

## Live evidence

The live confidential Web/PKCE flow used the exact registered redirect URI
`http://localhost:3000/api/integrations/microsoft/callback` with a personal
Microsoft account. The owner observed successful connection, the exact
five-scope grant, local disconnect, and the corresponding append-only ledger
transition. Real environment files remained ignored; no credential, code,
verifier, or token entered source control or this evidence record.

## Completion report

- Scope: connection/consent only; no calendar data request, write, mail, To Do,
  shared-calendar, organizational, or application permission entered WP-07.
- Verification: full repository gate plus owner-controlled live grant and
  disconnect passed with the exact approved tuple.
- Security: consumers-only authorization code plus S256 PKCE, one-time hashed
  state, encrypted verifier/token custody, forced-RLS owner records, strict API
  non-disclosure, refresh rotation, and fail-closed broad-scope validation.
- Operations: placeholder names and exact local redirect are documented;
  `.env`, `.env.*`, and nested real environment files remain ignored.
- Rollback: disable configuration and disconnect locally; provider-side consent
  withdrawal remains a distinct owner action.
- Next: integrate the bounded commit, then begin WP-08 model bake-off and
  gateway without broadening Microsoft permissions.

## Rollback or reconciliation

Remove the local Microsoft configuration to disable new connections. Use the
authenticated disconnect command to erase stored local tokens; separately
withdraw provider consent in the Microsoft account if desired. Preserve the
append-only consent/event evidence. Recreate only disposable databases;
otherwise use a forward migration or restore a matching verified backup.

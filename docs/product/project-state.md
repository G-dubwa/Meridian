---
purpose: Give a continuously maintained, resumable view of implementation state.
audience: Owner, contributors, and coding agents.
authoritative-for: Current package, completed packages, checks, risks, gates, decisions, and deferred work.
update-triggers: Any work package starts, finishes, blocks, changes risk, or changes verification status.
related-docs: roadmap.md
---

# Project state

Last updated: 19 July 2026

## Current work package

- WP-08 — Model bake-off and gateway is complete on
  `wp-08-model-bakeoff-gateway`. The owner approved a restricted provisional
  Alpha policy: deterministic code, Sol/`none` bounded extraction to
  owner-confirmed Triage proposals, and Terra/`none` bounded classification
  without direct mutation. WP-09 is next after the package commit and main
  integration.

## Completed packages

- WP-01 — Repository and quality foundation. Commit `07f9fcfbb85ebc3f639f817f8b44bde771b233fa`.
- WP-02 — Domain and application boundaries. Commit `3099a3d601e17208af247a2ffbdd41e1ea4b4d1d`.
- WP-03 — Database and resource foundation. Commit `50618050361ecfa8c9bb31dfea1f37202b011b40`.
- WP-04 — Local owner authentication. Commit `12cd8cda20114193474baec2449098ae39814fe5`.
- WP-05 — Walking journal slice. Commit `e7d9d4c2f0fe631f2768b970559a48c5364fc1af`.
- WP-06 — Worker and reliable event processing. Commit
  `2aa1d357fe6767788d7233932a84386f72e0762c`.
- WP-07 — Microsoft connection and consent. Commit
  `a4255b680a9c374afa8dd7303e8126cc1b4d82c3`.
- WP-08 — Model bake-off and gateway. Completion commit is the current WP-08
  package commit and will be recorded by hash when WP-09 starts.

## Active branches or worktrees

- `wp-01-repository-quality-foundation` — WP-01 complete.
- `wp-02-domain-application-boundaries` — WP-02 complete and ready for integration.
- `wp-03-database-resource-foundation` — WP-03 complete.
- `wp-04-local-owner-authentication` — WP-04 complete.
- `wp-05-walking-journal-slice` — WP-05 complete.
- `wp-06-worker-reliable-event-processing` — WP-06 complete and ready for
  integration.
- `wp-07-microsoft-connection-consent` — WP-07 complete, pushed, and remotely
  verified at `a4255b680a9c374afa8dd7303e8126cc1b4d82c3`.
- `wp-08-model-bakeoff-gateway` — active WP-08 branch.
- Integration branch: remote `main` includes WP-07 at
  `a4255b680a9c374afa8dd7303e8126cc1b4d82c3` after verified fast-forward.

## Test status

- WP-01 green on Node.js 24.18.0 and pnpm 11.14.0: frozen install, format, lint, strict typecheck, dependency rules and negative fixture, Vitest, docs headers and links, and production build.
- WP-02 green: 119 modules pass dependency rules, both prohibited-import fixtures are rejected, 5 test files and 16 tests pass, 80 documents pass, and all workspace builds pass.
- WP-03 green: Drizzle snapshots are consistent; 5 unit files/16 tests and 1 live PostgreSQL file/4 tests pass, including empty and seeded migrations, non-owner two-user RLS, transactionality, and provenance deletion.
- WP-04 green: 52 modules/67 dependencies pass architecture rules; 5 unit files/18 tests, 1 live PostgreSQL file/4 tests, and 7 live-server Playwright authentication journeys pass; 85 documents and generated dictionary are current; every workspace build passes.
- WP-05 green: 67 modules/93 dependencies pass architecture rules; 6 unit files/20 tests, 1 live PostgreSQL file/5 tests, and all 8 authenticated Playwright scenarios pass, including the journal journey and SQL-level Private exclusion; 88 documents and the generated dictionary are current; every workspace build passes.
- WP-06 green: formatting, lint, strict typecheck, 78 modules/126 dependencies
  and negative fixture, Drizzle consistency, 7 unit files/23 tests, 1 live
  PostgreSQL file/7 tests including concurrent dispatch and terminal pg-boss
  dead letter, all 8 Playwright scenarios including owner-only worker health, 91
  documents/current generated dictionary, and every workspace build.
- WP-07 repository gate is green: formatting, lint, strict typecheck, 88
  modules/151 dependencies and negative fixture, migration consistency, 8 unit
  files/31 tests, 1 live PostgreSQL file/8 tests, all 8 live
  Next.js/PostgreSQL journeys, 93-document/current generated dictionary,
  OpenAPI YAML parse, and every workspace production build. Live owner
  acceptance also passed: the consent ledger recorded a grant at 22:21:08 SAST
  and disconnect at 22:22:55 SAST on 18 July 2026, both with exactly `openid
profile offline_access User.Read Calendars.Read` and no additional permission.
- WP-08 redesigned pre-paid gate is green: formatting, lint, strict typecheck,
  92 modules/164 dependencies and negative fixture, migration consistency, 12
  unit files/57 tests, 1 live PostgreSQL file/8 tests, all 8 live
  Next.js/PostgreSQL journeys, 95 governed documents/current dictionary, and
  every workspace production build. The OpenAI-only runner proves
  no-confirmation, insufficient-ceiling, and missing-key refusal before network
  I/O.
- WP-08 paid synthetic evidence is complete: 33/33 fresh matrix calls, every
  model/task aggregate at schema adherence 1.00, USD 0.134956 locally estimated
  matrix cost, and USD 0.135877 cumulative with the separate smoke. Seventeen
  of 27 aggregates failed at least one activation threshold. The owner approved
  only the restricted provisional Alpha routes, with no automatic fallback.
- Gitleaks is configured in CI; local binary is not required by the local gate.

## Known risks

- The default shell remains Node.js 21.6.0, but Node.js 24.18.0 is installed and is the verified repository runtime.
- Toolchain versions are current as of 18 July 2026 and must remain lockfile-pinned.
- Authentication tables are a pre-owner-scope technical boundary and depend on least-privilege production database grants at deployment; content tables remain forced-RLS protected.

## Open decisions

- ADR-0008 records the provider-neutral, privacy-first gateway and restricted
  provisional Alpha routing. Model confidence is never sufficient alone;
  deterministic validation, provenance, explicit uncertainty, and fail-closed
  behaviour govern the two active bounded routes.

## Human gates

- WP-07's Stage-A permission and live owner-consent gates are satisfied. The
  approved envelope remains exactly `openid profile offline_access User.Read
Calendars.Read`; no write, To Do, mail, shared-calendar, or application
  permission is approved for later packages by implication.
- WP-08's paid and routing gates are satisfied. The gate was approved and
  attempted on 19 July 2026. A retry stopped with
  HTTP 429 while model metadata access remained HTTP 200. The owner confirmed
  the cause was zero API credit and added prepaid credit. A separately approved
  Luna smoke test succeeded with HTTP 200 for USD 0.000921 locally estimated
  usage. Its single bounded-classification fixture passed schema and abstention
  checks but scored 0.667 quality, below the 0.90 activation threshold. A fresh
  33-call matrix then completed under the approved cumulative ceiling. The owner
  approved only deterministic code, Sol/`none` bounded proposal extraction, and
  Terra/`none` bounded classification/proposals as provisional Alpha routes.
- Later gates include production secrets, real-device delivery testing, and
  production deployment expenditure.

## Deferred work

- Provider identity, WebAuthn, password-reset email, recovery-code regeneration,
  broader model routes, external-provider model evaluation, Triage,
  embeddings, reminders/tasks, calendar data sync/writes,
  voice/offline capture, vector search, downstream product consumers, and broader
  product UI remain deferred.

## Next package

- Begin WP-09 interpretation, explicit-command routing, and Triage using only
  the restricted WP-08 Alpha model policy. WP-09 does not broaden Microsoft
  permission or activate later model task classes.

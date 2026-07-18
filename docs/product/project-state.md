---
purpose: Give a continuously maintained, resumable view of implementation state.
audience: Owner, contributors, and coding agents.
authoritative-for: Current package, completed packages, checks, risks, gates, decisions, and deferred work.
update-triggers: Any work package starts, finishes, blocks, changes risk, or changes verification status.
related-docs: roadmap.md
---

# Project state

Last updated: 18 July 2026

## Current work package

- WP-07 — Microsoft connection and consent: affected stream paused at the
  mandatory Stage-A permission gate before implementation or real-account use.

## Completed packages

- WP-01 — Repository and quality foundation. Commit `07f9fcfbb85ebc3f639f817f8b44bde771b233fa`.
- WP-02 — Domain and application boundaries. Commit `3099a3d601e17208af247a2ffbdd41e1ea4b4d1d`.
- WP-03 — Database and resource foundation. Commit `50618050361ecfa8c9bb31dfea1f37202b011b40`.
- WP-04 — Local owner authentication. Commit `12cd8cda20114193474baec2449098ae39814fe5`.
- WP-05 — Walking journal slice. Commit `e7d9d4c2f0fe631f2768b970559a48c5364fc1af`.
- WP-06 — Worker and reliable event processing. Commit title
  `WP-06: Worker and reliable event processing`; exact hash is reported after
  integration because a commit cannot contain its own hash.

## Active branches or worktrees

- `wp-01-repository-quality-foundation` — WP-01 complete.
- `wp-02-domain-application-boundaries` — WP-02 complete and ready for integration.
- `wp-03-database-resource-foundation` — WP-03 complete.
- `wp-04-local-owner-authentication` — WP-04 complete.
- `wp-05-walking-journal-slice` — WP-05 complete.
- `wp-06-worker-reliable-event-processing` — WP-06 complete and ready for
  integration.
- Integration branch: `main` through verified WP-06 after fast-forward.

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
- Gitleaks is configured in CI; local binary was not present. CI is not yet observable because the branch has not been pushed.

## Known risks

- The default shell remains Node.js 21.6.0, but Node.js 24.18.0 is installed and is the verified repository runtime.
- Toolchain versions are current as of 18 July 2026 and must remain lockfile-pinned.
- Authentication tables are a pre-owner-scope technical boundary and depend on least-privilege production database grants at deployment; content tables remain forced-RLS protected.

## Open decisions

- None in Foundation. Deliberately open later decisions remain in Specification
  §35.3; the WP-07 pause is a permission gate rather than an architecture gap.

## Human gates

- WP-07 Microsoft Stage A: owner approval is required for `openid`, `profile`,
  `offline_access`, delegated `User.Read`, and delegated `Calendars.Read`, plus a
  personal-account-capable app registration and exact redirect URI. No calendar
  write, To Do, mail, shared-calendar, or application permission is approved.
- This cannot be automated because registration control and consent bind the
  owner's Microsoft account. Safest default: no grant and no connection.
- Evidence to resume: owner confirmation of the exact scope list, application
  (client) ID, supported-account setting, and registered redirect URI. Supply
  secrets and tokens only through the later documented local secret mechanism,
  never chat or source control.
- Later gates include production secrets, materially tied model selection,
  real-device delivery testing, and production deployment expenditure.

## Deferred work

- Provider identity, WebAuthn, password-reset email, recovery-code regeneration, models, Triage, embeddings, reminders/tasks, integrations, voice/offline capture, vector search, downstream event consumers, and broader product UI remain deferred.

## Next package

- WP-07 — Microsoft connection and consent, gated. Isolated WP-08 evaluation
  groundwork could proceed without Microsoft access, but has not been started
  while the programme is stopped at this mandatory gate.

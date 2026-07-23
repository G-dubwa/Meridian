---
purpose: Give a continuously maintained, resumable view of implementation state.
audience: Owner, contributors, and coding agents.
authoritative-for: Current package, completed packages, checks, risks, gates, decisions, and deferred work.
update-triggers: Any work package starts, finishes, blocks, changes risk, or changes verification status.
related-docs: roadmap.md
---

# Project state

Last updated: 23 July 2026

## Current work package

- WP-15 deterministic scheduling and local planning proposals is complete on
  `wp-15-deterministic-local-scheduling`, based on verified WP-14 `main`.
- The package adds only local canonical plan intent and leaves every
  provider-dependent package inactive.
- WP-17 execution evidence and The Weekly is next; WP-16 remains deferred.

## Completed packages

- WP-01 — Repository and quality foundation. Commit
  `07f9fcfbb85ebc3f639f817f8b44bde771b233fa`.
- WP-02 — Domain and application boundaries. Commit
  `3099a3d601e17208af247a2ffbdd41e1ea4b4d1d`.
- WP-03 — Database and resource foundation. Commit
  `50618050361ecfa8c9bb31dfea1f37202b011b40`.
- WP-04 — Local owner authentication. Commit
  `12cd8cda20114193474baec2449098ae39814fe5`.
- WP-05 — Walking journal slice. Commit
  `e7d9d4c2f0fe631f2768b970559a48c5364fc1af`.
- WP-06 — Worker and reliable event processing. Commit
  `2aa1d357fe6767788d7233932a84386f72e0762c`.
- WP-07 — Microsoft connection and consent. Commit
  `a4255b680a9c374afa8dd7303e8126cc1b4d82c3`.
- WP-08 — Model bake-off and gateway. Commit
  `907c8a239dfe87185b510e136df855fa2e16dca0`.
- WP-09 — Interpretation, commands, and Triage. Commit
  `930a4b567004589ec32a2268994ce0097b5316ff`.
- WP-10 — Tasks and canonical reminders. Commit
  `718bc897939017a641e6c3ee20f593c9c7c35516`.
- Microsoft deferral governance. Commit
  `1c6979f3a5a1509ed7c31b70766039e88acacc8b`.
- Date-independent WP-10 integration fixture. Commit
  `b55331fe62880e39973059703d3459b5e37fbdf5`.
- WP-13A — Local Alpha Today. Commit
  `837443e9b779e727ea41f82f0ea2788e9d6530ec`.
- WP-14 — Goals, edges, and soft load guidance. Package completion commit is
  `50989cd0273324f32c110896b6aa5189c6a609ea`.
- WP-15 — Deterministic scheduling and local proposals. Package completion
  commit is the current package-sized branch commit.

## Branch disposition

- `main` and `origin/main` were verified at WP-14 commit
  `50989cd0273324f32c110896b6aa5189c6a609ea` before WP-15 began.
- `wp-15-deterministic-local-scheduling` contains the provider-independent
  package pending its package-sized integration.
- Remote `wp-11-microsoft-todo-delivery-spike` is preserved at
  `7538b4123cfcba7b65765cd68c4b53c7193a6f15`.
- The WP-11 branch is experimental, inactive, deliberately unmerged, and the
  authoritative technical starting point if Microsoft work resumes.

## Verification status

- WP-01–WP-10 passed their recorded complete repository gates.
- WP-10 passed formatting, lint, strict typecheck, architecture rules,
  migration consistency, 76 unit tests, nine live PostgreSQL tests, nine
  authenticated browser journeys, governed-document validation, and all
  production builds. It proved forced RLS, deterministic DST-fail-closed time
  resolution, atomic provenance, idempotency, Edit/Undo, content-free events,
  and no external provider call.
- WP-11 mocked implementation and local verification succeeded on its preserved
  branch. Live personal-account validation did not complete acceptance and
  remained fail closed. No live To Do delivery channel is accepted.
- WP-13A passes formatting, lint, strict typecheck, architecture and migration
  checks, 80 unit tests, 10 live PostgreSQL tests, 10 authenticated browser
  journeys, 103 governed documents/current dictionary, and all production
  builds. Evidence proves forced RLS, a concurrent-safe three-priority limit,
  exact-version undo, content-free Today events, and no provider call.
- WP-14 passes formatting, lint, strict typecheck, architecture and migration
  checks, 84 unit tests, 11 live PostgreSQL tests, 11 authenticated browser
  journeys, governed documents/current dictionary, and all production builds.
  Evidence proves forced RLS, lifecycle/version rules, advisory load
  acknowledgement, dependency-cycle rejection, content-free goal events, and
  no provider call.
- WP-15 passes formatting, lint, strict typecheck, architecture and migration
  checks, 88 unit tests, 12 live PostgreSQL tests, 12 authenticated browser
  journeys, 108 governed Markdown documents/current data dictionary, and all
  production builds. Evidence proves exact buffered proposals, forced RLS,
  owner isolation, idempotent acceptance/staleness, content-free events, no
  execution credit, and no provider/model call.
- The default shell remains Node.js 21.6.0; Node.js 24.18.0 with pnpm 11.14.0
  is the verified repository runtime.
- Gitleaks runs in CI; the local repository gate does not require its binary.

## Decisions and risks

- ADR-0008 retains restricted provisional model routing. WP-15 made no paid
  model call.
- ADR-0010 defers WP-11/WP-12 and sequences a provider-independent local Alpha.
- Canonical task, reminder, journal, goal, planning, memory, and knowledge
  models must remain independent of provider credentials and availability.
- In-app reminder state must never be represented as external notification
  delivery.
- Authentication tables retain their narrow pre-owner technical boundary;
  content tables remain forced-RLS protected.

## Human gates

- No further Microsoft authorization, Graph request, Entra change, list/task
  mutation, consent change, or cleanup is authorised.
- Google Calendar, web push, email, or another provider requires a separate
  governed proposal; none is selected by this deferral.
- Remaining mandatory gates include paid model use, personal-data transmission,
  destructive operations, production deployment, and new external-provider
  permissions.

## Deferred work

- WP-11 Microsoft To Do delivery and WP-12 Outlook read synchronisation.
- WP-13B external agenda and notification projections.
- WP-16 provider calendar writes, adoption, and reconciliation.
- Provider identity, WebAuthn, password-reset email, recovery-code
  regeneration, broader model routes/evaluations, automatic model invocation,
  external reminder delivery, external calendar data, voice/offline capture,
  and production deployment.

No live Microsoft acceptance criterion is waived or marked passed. The
deferral is based on programme sequencing and time-to-user-value, not a
conclusion that Microsoft To Do is technically unsuitable.

## Next package

WP-17 introduces provider-independent execution evidence and The Weekly. It
must preserve confirmed-versus-planned separation, provenance, missing-data
semantics, owner review authority, and the inactive provider boundary.

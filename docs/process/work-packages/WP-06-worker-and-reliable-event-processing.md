---
purpose: Plan and record WP-06 implementation and Foundation release evidence.
audience: Owner, reviewers, contributors, operators, and coding agents.
authoritative-for: WP-06 scope, exclusions, migration, reliability, verification, review, rollback, and release evidence.
update-triggers: WP-06 plan, implementation, findings, checks, or completion state changes.
related-docs: ../../product/Meridian_Design_Specification_v1.2.md
---

# WP-06 — Worker and reliable event processing

## Status and dependencies

- Status: Complete
- Dependency: WP-05 complete and green at `e7d9d4c`
- Branch: `wp-06-worker-reliable-event-processing`
- Started: 18 July 2026
- Completion commit: `WP-06: Worker and reliable event processing`

## Scope and exclusions

Activate the existing transactional outbox with a separate pg-boss worker,
atomic dispatch, idempotent processing, bounded exponential retry, terminal dead
letters, content-safe structured lifecycle observations, and an authenticated
owner health surface. Prove a journal event reaches terminal success and a
controlled failure retries before dead-lettering, then produce the Foundation
release report.

Exclude Microsoft/Graph/OAuth, provider reconciliation, models and Triage,
notifications, reminders/tasks, schedules, external writes, production
deployment, and any content-bearing job or log payload. The existing
`uncertain` external-side-effect state remains reserved for later integrations.

## Change surface

- Domain/application: explicit dispatch/processing/health ports and an
  orchestration service whose state machine owns attempt and terminal rules.
- Persistence/schema: forward migration for safe failure metadata and atomic
  outbox transitions; pg-boss retains its own governed schema.
- Worker/integration: one composition root, one versioned outbox queue, graceful
  startup/shutdown, actual PostgreSQL-backed dispatch and consumption.
- API/UI: authenticated read-only worker-health contract and Settings > System
  health view; no public diagnostics or mutation endpoint.
- Events: no new product event types; jobs carry identifiers and event type only,
  while the canonical event remains in the owner-scoped outbox row.
- Documentation: reliability ADR, event/operations/security/testing updates,
  package record, project state, roadmap, changelog, and Foundation release
  report.

## Tests and acceptance

- Unit tests prove strict identifier-only job/observation schemas, successful
  completion, duplicate terminal success, retry classification, stable failure
  code, and terminal dead letter without exception text.
- Seven live PostgreSQL tests prove empty/seeded migration, RLS and journal
  invariants, concurrent `SKIP LOCKED` dispatch creates exactly five jobs for
  five rows, four journal events succeed, and one controlled event retries three
  times into matching Meridian and pg-boss terminal state.
- Eight Playwright journeys prove the existing authentication/journal path plus
  401 without an owner session and a content-free five-pending health view after
  journal writes.
- The final combined repository gate passes with the exact counts recorded below.

## Security, privacy, observability, and operations

Worker jobs and logs may contain opaque user/outbox/event IDs, event type,
attempt, duration, state, and a stable sanitized error code only. Entry bodies,
hashes, event payloads, exceptions, database URLs, and credentials are
prohibited. Health data requires the owner session and RLS scope. The worker
uses the same least-privilege PostgreSQL boundary; pg-boss administration is not
exposed through the web application.

No paid provider, model, or external network cost is introduced. Queue latency,
pending age, attempts, and dead-letter counts are locally observable. Shutdown
stops new work and gives bounded in-flight work time to finish.

## Rollback or reconciliation

Stop the worker before rollback. While data is disposable, recreate PostgreSQL.
After personal data exists, retain forward-only migrations: restore the last
verified backup into fresh PostgreSQL and deploy its matching revision. Never
delete outbox or pg-boss rows to hide a failure; reconcile or explicitly replay
from the recorded event under the runbook.

## Self-review

- Scope: no provider, Microsoft, model, Triage, reminder/task, schedule,
  notification, external write, production deployment, or replay UI entered.
- Atomicity: pending row lock, job insertion, and in-flight transition share one
  transaction; concurrent live dispatch proves one identity each.
- Retry/idempotency: event ID is the consumer key; attempts are monotonic;
  succeeded/failed duplicates settle consistently; retry is bounded at three.
- Failure: terminal state is recorded before pg-boss settlement; Meridian and
  the dead-letter queue agree in live evidence. `uncertain` remains unused.
- Privacy: strict jobs/observations exclude payload/body/hash/exception; health
  is session/RLS scoped and pg-boss administration remains hidden.
- Dependency direction: worker runtime calls application; only its composition
  root constructs infrastructure. Application imports domain only.
- Compatibility: the bundled pg-boss Drizzle 1.x adapter was rejected after a
  live mismatch; a narrow documented postgres-js transaction wrapper preserves
  the verified Drizzle 0.45 pin and atomicity.
- Operations: bounded graceful shutdown, queue installation/grants, health,
  incident evidence, restore, and redrive cautions are documented.

## Completion report

- Checks: formatting, lint, strict typecheck, 78-module/126-dependency
  architecture rules and negative fixture, Drizzle snapshot consistency, 7 unit
  files/23 tests, 1 integration file/7 live PostgreSQL tests, 8 authenticated
  Next.js/PostgreSQL Playwright journeys, 91-document/generated-dictionary
  validation, and every workspace production build pass.
- Documentation: ADR-0006; event, state-machine, architecture, API/OpenAPI,
  security/privacy, worker/database, migration, local-development, deployment,
  runbook, troubleshooting, testing, project-state, roadmap, release, and
  changelog records updated. The Foundation release report is complete.
- Decisions: pg-boss jobs carry only stable identifiers and event type; dispatch
  and queue insertion share one PostgreSQL transaction; event ID is the consumer
  idempotency key; retry is bounded at three attempts; terminal failures persist
  in Meridian and pg-boss dead-letter state. ADR-0006 records the narrow
  postgres-js transaction wrapper required by the verified dependency versions.
- Risks retired: non-atomic outbox handoff, unbounded retry, invisible terminal
  work, content-bearing queue jobs/observations, and a worker coupled directly to
  product composition. No paid provider or external side effect was introduced.
- Limitations: the Foundation consumer deliberately performs no downstream
  product effect; replay remains an operator-controlled reconciliation; lists
  and health history are personal-scale; production monitoring, backup, and
  least-privilege grants remain deployment work.
- Rollback: stop the worker and restore a matching verified database/application
  revision; recreate only while data is disposable and never delete queue
  evidence to conceal a failure.
- Next: WP-07 is paused at the mandatory Microsoft permission gate. The owner
  must approve the Stage-A delegated scope envelope before the affected stream
  can connect a real account; no permission is granted by default.

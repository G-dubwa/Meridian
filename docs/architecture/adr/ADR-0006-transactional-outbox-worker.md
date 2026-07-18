---
purpose: Record the reliable asynchronous processing architecture activated in WP-06.
audience: Owner, reviewers, operators, contributors, and coding agents.
authoritative-for: Outbox dispatch, pg-boss queueing, retry, dead-letter, observation, and process boundaries.
update-triggers: Queue technology, outbox state machine, retry policy, worker topology, or observability boundary changes.
related-docs: ../../process/work-packages/WP-06-worker-and-reliable-event-processing.md
---

# ADR-0006 — Transactional outbox worker

Status: Accepted, 18 July 2026.

## Context

WP-05 writes state, a domain event, and a pending outbox row atomically. The
Foundation release still needs crash-safe transfer to a worker, bounded retry,
terminal visibility, and a process that later integrations can extend without
placing infrastructure in application services. The event payload is already
content-free and owner-scoped.

## Decision

Use pg-boss 12.26.1 in the existing PostgreSQL database. A scoped dispatcher
locks eligible pending outbox rows with `FOR UPDATE SKIP LOCKED`, inserts jobs
through pg-boss's database interface, and marks rows `in_flight` in the same raw
postgres-js transaction. Job identity equals outbox identity; job data contains
only schema version, owner/outbox/event IDs, and event type.

The worker calls `ReliableEventService`, which claims each numbered attempt,
passes the canonical stored event and event-ID idempotency key to an application
consumer, and records success or a stable error code. pg-boss performs two
exponentially backed-off retries, for three total attempts, then copies terminal
work to `meridian.outbox.dead.v1`. Meridian independently records `failed`, the
attempt count, error code, and dead-letter time. Duplicate delivery after a
recorded success completes harmlessly; delivery after a recorded terminal
failure remains terminal.

Use a narrow postgres-js transaction wrapper because pg-boss 12's bundled
Drizzle adapter targets Drizzle 1.x result shapes while Meridian remains pinned
to verified Drizzle 0.45. This compatibility choice is local to the database
adapter and does not change the ORM boundary.

Structured observations are strict content-free objects. The authenticated
health endpoint reads owner-scoped counts and dead-letter summaries from the
canonical outbox, not pg-boss administration tables.

## Consequences

- There is no queue/state dual-write gap during dispatch.
- Consumers must make later side effects idempotent using the event ID and must
  reconcile provider state before retrying an external write.
- A crash after an attempt claim may repeat consumer work on the next attempt;
  idempotency is therefore mandatory even though terminal recording is
  duplicate-safe.
- pg-boss schema installation requires a migration-capable credential; runtime
  access is least privilege and its administrative tables are never exposed.
- `uncertain` remains reserved for later external writes and is not manufactured
  by the Foundation no-op journal consumer.

## Alternatives rejected

- Poll and mark without a transactional queue insert: crash can lose or
  duplicate handoff state.
- Redis or a hosted queue: adds a second system and operating cost without a
  personal-scale need.
- Put pg-boss in application code: reverses dependency direction.
- Log raw exceptions or event payloads: violates privacy and creates unstable
  operational contracts.

## Rollback

Stop the worker first. Recreate only disposable databases; otherwise restore a
verified backup into fresh PostgreSQL and deploy its matching revision. Preserve
outbox and dead-letter evidence for reconciliation rather than deleting it.

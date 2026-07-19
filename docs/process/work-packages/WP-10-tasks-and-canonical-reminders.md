---
purpose: Plan and record WP-10 thin tasks, canonical reminder intent, authority, receipts, and lifecycle.
audience: Owner, reviewers, contributors, operators, and coding agents.
authoritative-for: WP-10 scope, persistence, API, provenance, security, verification, and rollback evidence.
update-triggers: WP-10 implementation, checks, review, or completion state changes.
related-docs: ../../domain/reminders.md
---

# WP-10 — Tasks and canonical reminders

## Status and dependencies

- Status: Complete on 19 July 2026.
- Dependency: WP-09 commit `930a4b567004589ec32a2268994ce0097b5316ff`, remotely verified on `main` before work began.
- Branch: `wp-10-tasks-canonical-reminders`.
- Next gate: WP-11 Microsoft To Do delivery spike and real-device evidence.

## Scope and exclusions

WP-10 introduces thin owner-scoped tasks, canonical reminder intent, initial
occurrence identity, documented lifecycles, deterministic explicit reminder
grammar, T1 internal execution, atomic T2 proposal acceptance, compact command
receipts, Edit, Undo, provenance, content-free audit events, REST contracts, and
the `/actions` owner UI.

WP-10 does not deliver a reminder, call Microsoft Graph, create a Microsoft To
Do task, read or write mail, modify a calendar, select a notification channel,
run an LLM for deterministic time resolution, activate goals, or implement
planning/weekly/safety workflows. Delivery policy is constrained to
`undecided`; the next package must not infer delivery authorization from an
internal reminder.

## Authority and atomicity

- T0 ambiguity asks for clarification and creates nothing.
- T1 accepts only explicit, deterministic, unambiguous, owner-confirmed,
  internal commands. Strict structured fields and the bounded “Remind me
  tomorrow (or YYYY-MM-DD) at HH:MM to …” grammar are deterministic code.
- T2 task, commitment, and reminder proposals create their canonical target
  only inside the same transaction that records owner acceptance. Reminder
  proposals additionally require the owner to confirm an exact trigger and
  IANA time zone. Inactive proposal types fail closed.
- T3 external effects remain unavailable. No receipt, task, or reminder grants
  authority to deliver externally.

Each successful create transaction persists the canonical resource and target,
receipt, optional initial occurrence, provenance where applicable, domain
event, and outbox row. Optimistic versions guard decisions, edits, and undo.
Undo terminalizes an internal task/reminder and cancels pending occurrences; it
does not erase the audit or evidence record.

## Schema, API, and events

Migration `0008_wp10_tasks_canonical_reminders.sql` adds forced-RLS `tasks`,
`reminders`, `reminder_occurrences`, and `command_receipts`, plus canonical
`resource.task@1` and `resource.reminder@1`. Owner-matching foreign keys prevent
cross-owner related resources or proposal provenance. `(reminder_id,
scheduled_for)` provides occurrence idempotency.

Authenticated no-store APIs list actions; create tasks/reminders; resolve the
bounded reminder command; edit receipt targets; and undo a receipt. Mutations
require session-bound CSRF, literal owner confirmation, strict schemas,
optimistic versions where applicable, and request correlation IDs. Triage
acceptance returns its target receipt; dismissal remains proposal-only.

Action events contain only target resource ID/type/state and receipt ID. Titles,
notes, purpose, times, recurrence, feedback, proposal content, and source text
are prohibited from event/outbox payloads.

## Tests and acceptance criteria

The completion gate must prove strict task/reminder/recurrence schemas;
documented state transitions; bounded deterministic parsing; invalid/ambiguous
DST rejection; future triggers; owner confirmation; unsupported authority
failure; atomic proposal target/provenance; edit and undo; cancelled occurrence
history; duplicate command correlation; forced RLS; cross-owner denial;
content-free events/outbox; authenticated and CSRF-protected REST; migration
upgrade; documentation; and production builds.

`pnpm check` completed successfully on Node.js 24.18.0 and pnpm 11.14.0:
formatting, lint, strict typecheck, 117 modules/220 dependencies plus the
negative fixture, Drizzle consistency, 15 unit files/76 tests, one live
PostgreSQL file/9 tests, 9 live-server owner journeys, 97 governed Markdown
documents/current generated dictionary, and every workspace production build.
All WP-10 fixtures were local/synthetic; no model or external provider request
ran and cost was USD 0.00.

## Privacy, security, observability, and operations

Task/reminder content remains only in owner-RLS canonical rows and authenticated
no-store responses. The deterministic parser makes no provider call. Accepted
proposal targets retain `source_proposal_id` plus a derivation link to the exact
immutable source revision/span. Audit events are content-free. Database checks
constrain states, authority, recurrence representation, delivery policy,
quiet-hours behavior, expiry, estimates, and optimistic versions.

There are no new environment variables, secrets, external adapters, OAuth
scopes, provider costs, or live-data transmissions. The existing Microsoft
allowlist remains exactly `openid profile offline_access User.Read
Calendars.Read`.

## Rollback and reconciliation

Rollback disables the action/Triage-target routes and UI, then uses a forward
migration to pause scheduled reminders and cancel pending occurrences while
retaining receipts, provenance, and audit history. Tables are removed only
after governed export/retention review. No external reconciliation is necessary
because WP-10 cannot deliver or mutate provider state.

## Self-review

Review must confirm that UI wording never promises delivery, event payloads are
content-free, accepted proposals cannot be recorded without their target,
daylight-saving ambiguity fails closed, task/reminder terminal transitions do
not reopen, no Microsoft or model adapter was added, and all delivery choices
remain behind the WP-11 human gate.

Self-review completed with those invariants intact. The package contains no To
Do client, delivery adapter, new secret, or expanded Microsoft scope. Direct
create correlation is idempotent; target and receipt versions fail closed;
accepted proposals cannot bypass atomic target creation; and SQL/live-server
tests inspect both cross-owner isolation and content-free events.

## Completion report

WP-10 is complete as one bounded package-sized commit. Internal canonical tasks
and reminder intent are available with deterministic resolution, provenance,
Edit, and Undo. WP-11 is next and is intentionally stopped at its mandatory
permission and real-device delivery gate.

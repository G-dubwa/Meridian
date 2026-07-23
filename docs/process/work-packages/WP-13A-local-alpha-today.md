---
purpose: Plan the provider-independent Local Alpha Today work package.
audience: Owner, reviewers, contributors, operators, and coding agents.
authoritative-for: WP-13A scope, exclusions, acceptance criteria, and provider boundary.
update-triggers: WP-13A implementation, checks, review, or completion state changes.
related-docs: ../../architecture/adr/ADR-0010-provider-independent-local-alpha.md
---

# WP-13A — Local Alpha Today

## Status and dependencies

- Status: Complete on 23 July 2026.
- Dependency: verified WP-10 `main` commit
  `718bc897939017a641e6c3ee20f593c9c7c35516`.

## Scope and exclusions

Build an authenticated Today read model and UI over canonical local tasks,
reminders, priorities, and owner-entered agenda blocks. Support in-app
completion, dismissal, edit, and undo. Limit owner-selected daily priorities
to three. Clearly state that external phone reminder delivery is inactive.

Preserve provider-neutral `CalendarPort` and `ReminderDeliveryPort` contracts
with mock/test adapters. No Microsoft credential, token, permission, consent,
account, or Graph availability may be required.

Exclude Outlook sync, external notifications, simulated delivery evidence,
provider writes, paid model use, production deployment, goals, scheduling,
Weekly Review, and analytics.

## Acceptance criteria

- Forced-RLS owner isolation covers every new row and relation.
- Canonical task/reminder records remain authoritative.
- Date/time and priority validation is deterministic and fails closed.
- At most three priorities can be selected for one owner-local date, including
  concurrent attempts.
- Agenda blocks are manual local records with provenance and lifecycle history.
- Completion, dismissal, edit, and undo are authenticated, CSRF-protected,
  idempotent or version-guarded, and produce content-free audit/outbox events.
- Today never reports an external notification as delivered.
- The complete repository check, live database tests, browser journeys, docs,
  and production builds pass without provider access.

## Change surface

- Domain/application: local-date bounds, agenda/priority/receipt records,
  `CalendarPort`, `ReminderDeliveryPort`, and `TodayService`.
- Schema: forward migration `0009_wp13a_local_alpha_today.sql` adds forced-RLS
  `agenda_blocks`, `daily_priorities`, and `today_receipts`.
- API/UI: strict `/api/today` snapshot/mutation routes and mobile-responsive
  `/today`.
- Events: nine content-free `today.*.v1` event types.
- Integrations: none composed; Microsoft and all alternative providers remain
  inactive.

## Verification

`pnpm check` passes on Node.js 24.18.0 and pnpm 11.14.0: formatting, lint,
strict typecheck, architecture rules and negative fixture, Drizzle consistency,
16 unit files/80 tests, one live PostgreSQL file/10 tests, 10 authenticated
browser journeys, governed documentation/current generated dictionary, and all
workspace production builds.

Tests prove deterministic Johannesburg and DST date bounds, invalid-range
rejection, forced owner isolation, migration upgrade, the SQL/concurrent
three-priority boundary, version conflict handling, task/reminder/agenda
lifecycle and undo, CSRF/authentication, content-free events, and zero provider
events or calls. Fixtures were local and synthetic; paid model cost and
personal-data transmission were both zero.

## Security, privacy, observability, and operations

Task/reminder content remains canonical; priorities store identifiers, date,
and position only. Agenda content is owner-RLS local data. Today receipts store
identifiers, action, structural prior state, and versions, never content.
Events/outbox rows exclude titles, notes, purposes, dates, and time zones.
Mutations require owner session, session-bound CSRF, literal confirmation, and
correlation identity; optimistic versions and database uniqueness fail closed.

No new secret, environment variable, OAuth scope, token access, provider
request, background delivery, or external notification claim exists.

## Rollback and next package

Disable the Today mutations and surface, then use a forward migration to
terminalise new local projections while retaining canonical records and audit
history. No external reconciliation is required. WP-14 goals, edges, and load
guidance follows after completion.

## Self-review and completion

Review found no domain-to-adapter inversion, provider dependency, delivery
claim, content-bearing event, cross-owner relation, unbounded priority count,
or unsafe last-write-wins path. A stale target prevents undo. Manual agenda is
clearly distinguished from provider events. Canonical tasks/reminders remain
the source of truth.

WP-13A is one revertible package-sized commit. Its completion closes the local
provider-independent Alpha slice; WP-13B and the original external
delivery/calendar acceptance criteria remain deferred and unpassed.

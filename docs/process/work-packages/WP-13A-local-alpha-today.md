---
purpose: Plan the provider-independent Local Alpha Today work package.
audience: Owner, reviewers, contributors, operators, and coding agents.
authoritative-for: WP-13A scope, exclusions, acceptance criteria, and provider boundary.
update-triggers: WP-13A implementation, checks, review, or completion state changes.
related-docs: ../../architecture/adr/ADR-0010-provider-independent-local-alpha.md
---

# WP-13A — Local Alpha Today

## Status and dependencies

- Status: Next.
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

## Rollback and next package

Disable the Today mutations and surface, then use a forward migration to
terminalise new local projections while retaining canonical records and audit
history. No external reconciliation is required. WP-14 goals, edges, and load
guidance follows after completion.

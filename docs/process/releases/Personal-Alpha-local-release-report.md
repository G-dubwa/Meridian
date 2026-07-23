---
purpose: Record exit evidence and limitations for the provider-independent Personal Alpha local slice.
audience: Owner, reviewers, operators, contributors, and coding agents.
authoritative-for: Local Alpha package evidence, exclusions, rollback, and provider limitations.
update-triggers: WP-13A reconciliation or later provider-dependent Alpha addendum.
related-docs: ../../architecture/adr/ADR-0010-provider-independent-local-alpha.md
---

# Personal Alpha local release report

Status: Provider-independent local slice complete on 23 July 2026.

## Included

- Independent local owner authentication.
- Versioned journal, processing classes, activity, Triage, and restricted
  proposal routes.
- Canonical tasks and reminder intent with deterministic times, receipts,
  provenance, Edit, and Undo.
- Local Today with manual agenda blocks, at most three owner-selected
  priorities, in-app task/reminder/agenda lifecycle, and guarded undo.
- Provider-neutral model, calendar, and reminder-delivery boundaries.
- Forced RLS, owner-matching relationships, content-free events/outbox, and
  same-origin authenticated REST.

## Verification

The WP-13A repository gate passes on the pinned Node.js/pnpm toolchain,
including 80 unit tests, 10 live PostgreSQL tests, 10 authenticated browser
journeys, migrations, architecture rules, documentation, generated schema
dictionary, and production builds. Provider environment values are not
required by the Today journey. No Microsoft authorization, Graph request,
external-provider request, paid model call, or real personal-data transmission
occurred.

## Explicit limitations

Outlook agenda synchronisation, Microsoft To Do, external phone notification,
and every alternative provider are inactive. The UI explicitly labels
external delivery inactive and never treats local state as a delivery receipt.
WP-11, WP-12, WP-13B, and their live/device criteria remain deferred and
unpassed. This report does not claim the original provider-dependent two-week
Alpha exit test.

Goals, scheduling proposals, execution evidence, Weekly Review, knowledge,
retrieval, protocol safety, analytics, and hardening remain later packages.

## Rollback and operations

WP-13A can be disabled at its routes/UI and reconciled by forward migration
while retaining canonical task/reminder state and audit history. No external
cleanup is required. PostgreSQL backup/restore and local owner recovery remain
the Foundation runbooks; production deployment is not authorised by this
report.

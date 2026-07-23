---
purpose: Define provider-independent Local Alpha Today data, authority, lifecycle, and delivery-status semantics.
audience: Owner, reviewers, contributors, operators, and coding agents.
authoritative-for: Today composition, manual agenda blocks, daily priorities, lifecycle receipts, and external-channel wording.
update-triggers: Today data, priority rules, lifecycle controls, provider projections, or delivery status changes.
related-docs: ../architecture/adr/ADR-0010-provider-independent-local-alpha.md
---

# Local Alpha Today

Today is an owner-scoped read model over canonical Meridian tasks and reminders,
manual local agenda blocks, and up to three priorities for one owner-local
calendar date. Tasks and reminders remain authoritative; Today does not copy
their content into a projection table.

## Daily priorities

Each priority references one active canonical task, a validated `YYYY-MM-DD`
owner-local date, and position 1, 2, or 3. PostgreSQL uniqueness plus a
transaction-scoped advisory lock enforce at most three distinct tasks and
positions even under concurrent requests. Selection requires owner
confirmation and returns a reversible Today receipt.

## Manual agenda

An agenda block is a canonical owner resource with title, notes, exact start
and end instants, IANA time zone, optimistic version, and
`planned | completed | cancelled` state. It is manually entered and has no
provider identifier. Blocks cannot exceed 24 hours. Completion/cancellation
returns a reversible lifecycle receipt; edits are version guarded.

## In-app lifecycle and undo

Today can complete an active task, complete or dismiss an internal reminder,
and complete or cancel a planned agenda block. Each transition atomically
updates canonical state, appends a content-free event/outbox row, and stores a
receipt containing identifiers, structural prior state, and the resulting
version—never title, notes, purpose, or time.

Undo succeeds only while the target still has the exact resulting version. It
restores the prior state (or removes the just-selected priority), increments
the target and receipt versions, and appends another content-free event. A
subsequent edit or concurrent change fails closed rather than overwriting it.

## Time and provider boundaries

The query date is resolved to exact start/end instants with an explicit IANA
time zone. Invalid dates and ambiguous or missing local boundaries fail closed.
`CalendarPort` and `ReminderDeliveryPort` are domain-owned provider boundaries,
but neither is composed into WP-13A. Local agenda blocks do not impersonate
calendar events.

Every Today response states `externalDeliveryActive: false`. The UI says
external phone delivery is inactive and never presents in-app completion,
dismissal, or due state as evidence that an external notification was sent or
received.

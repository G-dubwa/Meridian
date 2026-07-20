---
purpose: Record the permission, ownership, authority, and gate decision for the Microsoft To Do spike.
audience: Owner, architects, security reviewers, contributors, and coding agents.
authoritative-for: WP-11 Microsoft To Do containment and activation constraints.
update-triggers: Permission envelope, ownership mechanism, live evidence, or channel decision changes.
related-docs: ../../integrations/microsoft-todo-spike.md
---

# ADR-0009 — Contained Microsoft To Do spike

Status: Accepted for mocked implementation on 20 July 2026; live activation is
not accepted.

## Context

Meridian needs to test whether Microsoft To Do can provide reliable cross-device
reminder delivery and completion evidence without surrendering canonical intent
or becoming a general task synchronizer. Delegated `Tasks.ReadWrite` is broader
than a single list, and Microsoft identifiers, retries, sharing, revocation, and
time-zone presentation create material containment risks.

## Decision

Request exactly `openid profile offline_access User.Read Calendars.Read
Tasks.ReadWrite` only through a separately gated incremental flow. Validate the
Graph token's exact `scp` set independently as `User.Read Calendars.Read
Tasks.ReadWrite`; reject missing and additional permissions. Keep the current
five-scope route unchanged until live approval.

Create a dedicated normal list named `Meridian` with an opaque open-extension
ownership marker, preferably in the same create request. Store the list ID and
marker under owner RLS. Mutate only that list and locally bound tasks bearing
their own marker. Never adopt by name, import existing tasks, traverse shared
tasks, or implement general bidirectional sync.

Meridian's reminder and occurrence are authoritative. To Do is a projection and
completion-evidence channel. Every experimental write requires owner
confirmation and deterministic validation. Unknown identity, scope, ownership,
state, or network outcome fails closed. Operation and consent evidence is
content-free.

Keep the channel experimental through the separately approved live test and at
least seven days of observation. WP-12 may advance independently; observation
does not activate To Do.

## Consequences

The adapter deliberately underuses the technical breadth of
`Tasks.ReadWrite`. Name-only recovery and personal/shared task import are not
available. One canonical recurrence occurrence maps to one non-recurring To Do
task, avoiding competing recurrence engines. Disconnect leaves verified
external objects in place by default and marks them unmanaged; cleanup is a
separate confirmed destructive action.

The approach adds local bindings, operation evidence, and reconciliation work,
but gives deterministic duplicate prevention and a defensible rollback path.
Failure of permissions, markers, device reliability, time mapping, duplicate
controls, or the scorecard rejects To Do without compromising canonical data.

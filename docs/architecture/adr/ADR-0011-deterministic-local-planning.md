---
purpose: Record the provider-independent deterministic scheduling boundary.
audience: Owner, architects, contributors, and coding agents.
authoritative-for: WP-15 scheduling package dependencies and local plan authority.
update-triggers: Scheduler arithmetic moves, external availability activates, or calendar projection is approved.
related-docs: ../module-map.md, ../../domain/scheduling.md
---

# ADR-0011 — Deterministic local planning

Status: Accepted on 23 July 2026.

## Decision

Activate `packages/scheduling` as a pure deterministic policy package. It may
import domain contracts and deterministic time-zone invariants only. Application services supply owner-scoped local busy
intervals and persist proposals and approved canonical blocks through domain
ports. The application package may import scheduling; presentation and
infrastructure may not invoke its policy as an authority bypass.

WP-15 uses only owner-entered concrete working windows, local manual agenda,
and accepted local planning blocks. `CalendarPort` stays provider-neutral and
uncomposed. Exact owner confirmation creates internal plan intent; it performs
no external write and produces no execution credit.

## Consequences

Scheduling arithmetic is testable without a database, provider, model, secret,
or network. Local availability is intentionally incomplete and labelled as
such. Provider availability and calendar projections can be added later
without changing canonical proposal or block identity, but require separate
governed work and permission.

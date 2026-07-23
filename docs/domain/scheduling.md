---
purpose: Define deterministic local scheduling proposals and canonical planning blocks.
audience: Owner, contributors, and coding agents.
authoritative-for: WP-15 local availability, proposal, approval, and planning-block semantics.
update-triggers: Scheduling inputs, arithmetic, proposal lifecycle, or provider projection changes.
related-docs: state-machines.md, ../architecture/adr/ADR-0011-deterministic-local-planning.md
---

# Deterministic local scheduling

Meridian calculates planning proposals from owner-entered working windows and
local busy intervals. Busy intervals are planned manual agenda blocks and
already accepted local calendar blocks. No external calendar is queried, and
the result cannot imply complete availability outside the entered windows.

The deterministic input includes estimated effort, earliest start, deadline,
IANA time zone, buffer, minimum and maximum block size, daily deep-work limit,
and one or more exact working windows. It returns exact candidate blocks,
capacity and scheduled-minute arithmetic, a `feasible`, `tight`, or
`infeasible` verdict, exclusions, and alternative levers. Busy intervals use
half-open `[start, end)` overlap rules and receive the owner-selected buffer.

## Authority and lifecycle

A proposal begins `pending`. The owner sees every exact start, end, and
duration before accepting. Acceptance requires the current version and literal
confirmation. Availability is recalculated under an owner planning lock; a
changed result makes the proposal `stale` and creates no blocks. An infeasible
proposal cannot be accepted. A terminal linked task/goal also makes acceptance
stale. Target lifecycle and local busy writes share the planning lock so they
cannot race the final validation. Dismissal creates no blocks.

Successful acceptance atomically creates one canonical local calendar block per
candidate and retains original/current times, planned effort, proposal link,
task/goal link, time zone, approval time, and state. These are Meridian plan
intent only. They are not provider events, notification receipts, or execution
evidence, and no completion is inferred from elapsed calendar time.

The provider-neutral `CalendarPort` remains uncomposed. A future projection
adapter must pass its own governed permission and external-write package.

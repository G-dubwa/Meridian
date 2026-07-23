---
purpose: Record the deferred disposition of WP-12 Outlook fixed-window read synchronisation.
audience: Owner, reviewers, operators, contributors, and coding agents.
authoritative-for: WP-12 status, exclusions, dependency boundary, and resume gate.
update-triggers: WP-12 resumes or its provider permission and data boundary changes.
related-docs: ../../integrations/microsoft-calendar.md
---

# WP-12 — Outlook fixed-window read sync

## Status and dependencies

- Status: Deferred before implementation on 23 July 2026.
- Microsoft-dependent prerequisites are not Alpha dependencies.

## Scope and exclusions

No Outlook event read, cache, recurrence expansion, delta window, Graph
request, permission change, or provider reconciliation is active on `main`.
No acceptance criterion from the specification is waived or passed.

Provider-independent Today functionality moves to WP-13A. A future WP-12
resume requires a new explicit programme decision and must retain
`CalendarPort`, forced owner isolation, privacy handling, fixed-window
reconciliation, time-zone fixtures, content-free audit, and fail-closed
consent/error behaviour.

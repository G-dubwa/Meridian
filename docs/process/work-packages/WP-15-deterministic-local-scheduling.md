---
purpose: Record WP-15 scope, evidence, exclusions, and completion.
audience: Owner, contributors, and coding agents.
authoritative-for: WP-15 deterministic scheduling and local planning proposals.
update-triggers: WP-15 is corrected or its acceptance is reconciled.
related-docs: ../../domain/scheduling.md
---

# WP-15 — Deterministic scheduling and local proposals

## Status and dependency

- Status: Complete on 23 July 2026.
- Dependency: verified WP-14 `main` commit
  `50989cd0273324f32c110896b6aa5189c6a609ea`.

## Scope

WP-15 adds pure deterministic block arithmetic; exact owner-entered working
windows; local agenda and accepted-block conflict exclusion; buffers, block
preferences, and daily load bounds; explainable feasibility/capacity results;
pending, accepted, dismissed, and stale proposal states; and owner-approved
canonical local calendar blocks.

Every proposal links an existing local task or goal. Acceptance is an exact
T3 preview with literal confirmation, optimistic version, transaction planning
lock, and pre-write availability recalculation. Planning blocks retain original
and current times, planned effort, approval, provenance, and canonical resource
identity. Local busy and linked-target lifecycle writes share the same owner
planning lock, preventing a successful acceptance from racing a conflicting
agenda or terminal target change.

## Exclusions

No model inference, provider availability, Microsoft/Graph operation, external
calendar write, calendar adoption/reconciliation, reminder delivery,
notification, automatic acceptance, execution inference, personal-data
transmission, paid request, or production deployment is in scope. WP-16 and all
provider gates remain deferred.

## Verification, privacy, and rollback

`pnpm check` passes on Node.js 24.18.0 and pnpm 11.14.0: formatting, lint,
strict typecheck, dependency rules over 157 modules/312 dependencies, migration
consistency, 18 unit files/88 tests, one live PostgreSQL file/12 tests, 12
authenticated browser journeys, 108 governed Markdown documents/current data
dictionary, and all production builds. Unit tests prove buffer/overlap, split,
capacity, daily-load, and strict-input rules. PostgreSQL tests prove migration
upgrade, forced RLS, owner isolation, idempotency, atomic acceptance, and
content-free events. The authenticated browser journey proves CSRF, exact
preview, explicit confirmation contract, local blocks, and inactive provider
status. All fixtures were synthetic and local; paid-model cost and
personal-data transmission were zero.

Proposal and block labels remain forced-RLS owner content. Audit payloads retain
only proposal identifier, state, verdict, and block count. Rollback disables
the planning API/UI and uses a forward migration to make proposals terminal;
accepted internal plan records and audit history remain. No provider cleanup is
required.

Self-review found no provider dependency, model arithmetic, external-effect
claim, automatic acceptance, cross-owner relation, unbuffered overlap,
content-bearing event, or calendar-time execution credit. WP-17 execution
evidence and The Weekly is next; WP-16 remains deferred.

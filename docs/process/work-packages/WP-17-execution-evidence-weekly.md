---
purpose: Record WP-17 scope, evidence, exclusions, and completion.
audience: Owner, contributors, and coding agents.
authoritative-for: WP-17 execution evidence and The Weekly.
update-triggers: WP-17 is corrected or its acceptance is reconciled.
related-docs: ../../domain/execution-evidence.md
---

# WP-17 — Execution evidence and The Weekly

## Status and dependency

- Status: Complete on 24 July 2026, pending owner integration approval.
- Dependency: verified WP-15 plus integrated INFRA-01 `main` commit
  `c586b173db9d9f9e219c6321040fd868bccb772e`.

## Scope

WP-17 adds the complete E1–E6 vocabulary and deterministic confidence classes;
forced-RLS execution records with owner-matching links; atomic E1 capture and
retraction through Today completion/undo; owner-confirmed E2/E6 post-block
responses; explicit E5 elapsed reconciliation; content-free events; and an
owner-only Weekly surface.

The Weekly keeps planned, confirmed, partial, not-completed, rescheduled, and
unknown time distinct. It exposes a confirmation inbox and at most three
deterministic evidence-linked observations, alongside task completion, reminder
response, due-date postponement, and open-Triage counts.

## Exclusions

No model inference, provider request, Microsoft/Graph work, external calendar
or task read/write, notification, automated owner response, execution claim
from elapsed time, productivity score, calibration, paid request, personal-data
transmission, destructive operation, or production deployment is in scope.
E3 focus sessions and E4 external task completion are reserved but inactive.

## Acceptance and rollback

`pnpm check` passes on Node.js 24.18.0 and pnpm 11.14.0: formatting, lint,
strict typecheck, dependency rules over 167 modules/339 dependencies, migration
consistency, 20 unit files/98 tests, one live PostgreSQL file/13 tests, 13
authenticated browser journeys, 113 governed Markdown documents/current data
dictionary, and all production builds. Tests prove owner confirmation and
partial-duration semantics, deterministic confidence mapping, migration
upgrade, forced RLS, owner isolation, idempotent E1/E2/E5 capture and
retraction, planned-versus-confirmed separation, content-free events, and no
provider activity. All fixtures were synthetic and local; paid-model cost and
personal-data transmission were zero.

Rollback disables the execution routes and Weekly navigation, then uses a
forward migration if schema retirement is required. Existing evidence and
audit history remain retained and retracted rather than silently deleted. No
provider cleanup or consent change is involved.

Self-review found no provider dependency, model inference, elapsed-time progress
credit, automatic owner response, cross-owner relation, content-bearing audit,
or productivity-score claim. WP-18 knowledge-source ingestion is next after
owner approval and integration.

---
purpose: Record WP-14 scope, evidence, exclusions, and completion.
audience: Owner, contributors, and coding agents.
authoritative-for: WP-14 goals, resource edges, and soft active-load guidance.
update-triggers: WP-14 is corrected or its acceptance is reconciled.
related-docs: ../../domain/goals-and-edges.md
---

# WP-14 — Goals, edges, and soft load guidance

## Status and dependency

- Status: Complete on 23 July 2026.
- Dependency: verified WP-13A `main` commit
  `837443e9b779e727ea41f82f0ea2788e9d6530ec`.

## Objective and scope

Deliver provider-independent, owner-authored outcome and behavioural goals,
their specified lifecycle, canonical typed resource relationships, deterministic
dependency guidance, and a configurable soft active-goal guide.

The package includes:

- incubating, active, paused, completed, retired, and merged goal states;
- owner-authored title, narrative, type, success criteria, target date, and
  life domain;
- registered `part_of`, `depends_on`, `blocks`, `conflicts_with`, `supports`,
  and lifecycle-owned `merged_into` edges;
- deterministic dependency-cycle rejection and blocked-by explanations;
- the existing default-five owner setting, configurable from 1 to 20;
- explicit acknowledgement before an activation at or above the guide;
- linked canonical tasks and a local Goals & Load surface.

## Exclusions

No model inference, Triage-to-goal materialisation, scheduling, calendar block,
execution evidence, metric, Activity Pulse, predictive score, provider call,
external write, notification, personal-data transmission, or production
deployment is in scope. A soft guide never becomes a database cap.

## Authority, schema, API, and events

All writes are T1 owner-authored internal commands requiring authenticated
session, session-bound CSRF, literal confirmation, correlation identity, and
optimistic versions. Merge creation is restricted to the lifecycle transition.

Migration `0010_wp14_goals_edges_load_guidance.sql` creates forced-RLS `goals`
and `edges`, the system-owned edge vocabulary, same-owner composite foreign
keys, active-edge uniqueness, and the registered `resource.goal@1` type.
Same-origin `/api/goals` routes expose strict v1 contracts. Six `goal.*.v1`
event types contain only identifiers, enums, state, and the numeric soft
guide—never titles, narratives, criteria, domains, dates, or task content.

## Verification

`pnpm check` passes on Node.js 24.18.0 and pnpm 11.14.0: formatting, lint,
strict typecheck, dependency rules, migration consistency, 17 unit files/84
tests, one live PostgreSQL file/11 tests, 11 authenticated browser journeys,
governed documentation/current generated dictionary, and every production
build.

Tests prove lifecycle validation, real-date validation, owner isolation, forced
RLS, migration upgrade, exact-version conflicts, default and changed guides,
acknowledged over-limit activation, dependency-cycle rejection, blocker
resolution, linked tasks, CSRF, idempotent commands, and content-free events.
All fixtures were synthetic and local; paid-model cost and personal-data
transmission were zero.

## Privacy, rollback, and self-review

Goal prose remains owner-RLS content. Edges retain canonical resource
identifiers and governed relationship semantics. Load guidance is a transparent
count and subtraction, never a performance, probability, or wellbeing claim.

Rollback disables the goal routes/surface and uses a forward migration to
terminalise goal records while retaining audit and provenance. No provider
cleanup or external reconciliation exists.

Self-review found no provider dependency, domain inversion, autonomous
activation, hard five-goal invariant, cyclic dependency path, cross-owner edge,
content-bearing audit payload, calendar-time progress credit, or composite
score. WP-15 deterministic local scheduling and planning proposals is next.

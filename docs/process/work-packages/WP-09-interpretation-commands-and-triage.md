---
purpose: Plan and record WP-09 deterministic authority routing and owner-reviewed Triage.
audience: Owner, reviewers, contributors, operators, and coding agents.
authoritative-for: WP-09 scope, proposal lifecycle, provenance, API, evaluation, and verification evidence.
update-triggers: WP-09 implementation, checks, review, or completion state changes.
related-docs: ../../domain/state-machines.md
---

# WP-09 — Interpretation, commands, and Triage

## Status and dependencies

- Status: Complete on 19 July 2026.
- Dependency: WP-08 integrated locally at `907c8a239dfe87185b510e136df855fa2e16dca0`.
- Branch: `wp-09-interpretation-commands-triage`.
- Completion commit: this record is part of the package-sized WP-09 completion commit; see project history.

## Scope and exclusions

WP-09 adds deterministic authority routing; strict, source-bound proposal output; dedupe and suppression; owner accept/edit/dismiss decisions; current-Standard-revision eligibility; proposal invalidation on source revision; Triage REST/UI; and synthetic authority/over-extraction evaluations.

WP-09 does not create a task, reminder, goal, memory, calendar item, message, or any external effect. A T1 direct-command decision is a typed handoff only until WP-10 owns the target, receipt, Edit, and Undo transaction. Ambiguous interpretation never executes automatically. Weekly review, knowledge extraction, contextual reasoning, planning, synthesis, and safety-sensitive review remain inactive. No Microsoft permission or model provider is broadened.

## Change surface

- Domain/application: proposal schemas, authority router, deterministic validation, Triage lifecycle, stale-source invalidation, content-free events.
- Schema: owner-RLS `proposals`, canonical `resource.proposal`, source-revision FK, spans, payload, authority/assertion, confidence, uncertainty, dedupe, expiry/suppression, status, and optimistic version.
- API/UI: authenticated no-store proposal list, CSRF-protected owner decision
  route, explicitly confirmed Standard-revision extraction route, journal
  action, and `/triage` review surface.
- Evaluation: committed synthetic routing and over-extraction cases; no provider request.
- Integrations: none; dormant Anthropic/Google adapters and exact Microsoft Stage-A permissions are unchanged.

## Tests and acceptance criteria

The gate must prove ambiguity-first clarification, deterministic T1 classification, T2 inference, T3 exact-preview classification, T4 rejection, maximum-seven proposals, strict source spans and revision identity, dedupe locking, uncertainty/confidence fail-closed handling, hypothesis non-acceptance, owner confirmation, optimistic transitions, dismissal suppression, source-change staleness, forced RLS, content-free events/outbox, authenticated/CSRF REST, Triage UI, migrations, documentation, and builds.

`pnpm check` completed successfully on Node.js 24.18.0 and pnpm 11.14.0:
formatting, lint, strict typecheck, 103 modules/191 dependencies plus the
negative fixture, Drizzle consistency, 14 unit files/71 tests, one live
PostgreSQL file/8 tests, 8 live-server journeys, 96 governed Markdown
documents/current generated dictionary, and all workspace builds. No provider
request ran. Integration uses a local adapter and proves exact
Sol/`none`/proposal-only metadata, Private zero-call behaviour, all three owner
decisions, concurrent dedupe, suppression, source staleness, RLS, provenance,
and content-free delivery.

## Security, privacy, observability, and operations

Only current Standard revisions may enter the interpretation result boundary. Private and Sensitive fail before proposal persistence. Model confidence is calibration metadata and is never sufficient: schema, provenance, span, uncertainty, authority, status, owner confirmation, and optimistic version checks are conjunctive. Proposal events contain only proposal ID/type/status. Raw source content is not copied into proposal rows, events, URLs, or logs.

Implementation and automated verification make no provider request and incur
USD 0.00. Runtime composition is optional and owner initiated: the journal UI
explains the OpenAI transfer and requires an explicit confirmation before the
Sol/`none` bounded-extraction request. Missing configuration fails with a
sanitized 503 and creates nothing. Requests retain `store: false`, strict
schema, timeout, bounded output, and content-free observations.

## Rollback or reconciliation

Before downstream proposal consumers exist, rollback is a forward migration that disables Triage routes, marks pending proposals stale, and later removes the table only after export/retention review. Source revisions and derivation evidence remain authoritative. Removing the UI or model key cannot create a dangling external effect because WP-09 has none.

## Self-review

No out-of-scope durable-target or external mutation was added. Review confirmed
current-Standard eligibility before the adapter and again before persistence;
explicit owner transfer confirmation; optional-key fail closed; strict prompt
and output contracts; transient exact source-text/span validation; deterministic
dedupe hashes and transaction locks; forced RLS; optimistic lifecycle;
dismissal suppression; stale-source invalidation inside the journal transaction;
content-free observations/events; no confidence-only activation; and no source
text in secondary storage or telemetry. Goals, memories, planning, safety, and
external actions remain excluded from the production prompt.

## Completion report

WP-09 is complete as one bounded package. The owner can explicitly request
review-only proposals from a Standard journal revision when the inherited
`OPENAI_API_KEY` is configured; all automated evidence remains synthetic and
local. Rollback is configuration/UI disablement plus forward staleness of
pending proposals. WP-10 is next and owns canonical task/reminder targets and
the atomic receipt/Edit/Undo behaviour that WP-09 deliberately cannot perform.

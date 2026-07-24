---
purpose: Define Meridian execution evidence, confidence, reconciliation, and Weekly Review semantics.
audience: Owner, contributors, reviewers, and coding agents.
authoritative-for: WP-17 execution records and provider-independent Weekly behaviour.
update-triggers: Evidence vocabulary, confidence mapping, capture source, reconciliation, or Weekly aggregation changes.
related-docs: ../product/spec.md
---

# Execution evidence

## Evidence is not inference

Accepted calendar blocks retain planned intent. Their elapsed duration never
becomes completed work automatically. Meridian records progress only from a
defined evidence source; a block that ends without confirmation becomes
`calendar_elapsed_unknown` and contributes zero confirmed minutes.

| Type | Evidence                   | Confidence class       | Active WP-17 source                     |
| ---- | -------------------------- | ---------------------- | --------------------------------------- |
| E1   | `user_completed_task`      | `owner_confirmed`      | Today task completion                   |
| E2   | `post_block_confirmed`     | `owner_confirmed`      | Post-block owner response               |
| E3   | `focus_session_recorded`   | `locally_observed`     | Reserved; inactive                      |
| E4   | `external_task_completed`  | `externally_confirmed` | Reserved; inactive                      |
| E5   | `calendar_elapsed_unknown` | `unknown`              | Explicit elapsed reconciliation or skip |
| E6   | `user_reported_not_done`   | `owner_confirmed`      | Post-block owner response               |

The confidence class is a deterministic description of provenance, not a model
score and not a probability. Database checks require the evidence type and
confidence class to match.

## Post-block responses

Only an authenticated, CSRF-protected request with literal owner confirmation
may record a response. `done` records the planned effort as confirmed;
`partly_done` requires a positive owner-reported duration below planned effort;
`not_done` records E6; `rescheduled` records an unknown rescheduled outcome; and
`skip` records E5 unknown. A block must have ended, remain planned, match the
expected version, and have no active evidence record.

Request correlation makes a successful retry idempotent. Evidence rows,
content-free domain events, and outbox rows commit atomically. Today task
completion creates E1 in the same transaction, while exact-version Today undo
retracts that evidence rather than deleting history.

## Elapsed reconciliation

Reconciliation is an explicit local command bounded by a supplied instant that
cannot be in the future. It serializes against post-block writes and creates E5
only for ended, planned blocks with no active evidence. Retrying the same
correlation returns the recorded count. The summary audit contains no block
content or exact times.

## The Weekly

The owner selects a local week and IANA time zone. Meridian reports planned,
confirmed-completed, confirmed-partial, explicitly-not-completed, unknown, and
rescheduled minutes separately. It also counts E1 task completions, local
reminder responses, later due-date edits, open Triage proposals, and the
post-block confirmation inbox.

Up to three deterministic, evidence-linked observations may describe sparse
evidence, an excess of unknown time, confirmed time broadly matching the plan,
or repeated postponement. They are not productivity scores, forecasts, health
claims, or model advice. Unknown time is excluded from progress claims.

## Privacy and provider boundary

Execution records are owner-scoped under forced PostgreSQL RLS and
owner-matching foreign keys. Audit payloads exclude titles, notes, due dates,
exact times, durations, and personal content. WP-17 makes no model request,
provider request, calendar write, external task read, or notification delivery.
The provider-neutral calendar and reminder-delivery ports remain uncomposed.

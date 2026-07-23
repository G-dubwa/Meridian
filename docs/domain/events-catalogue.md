---
purpose: Catalogue versioned domain events.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Event catalogue

Every event provides schema version `1`, branded event identity, non-empty type,
offset-aware time, `UserScope`, correlation identity, optional causation and
aggregate resource identity, and a validated payload.

## Journal events v1

| Event                                 | Emitted when                           | Payload                                 |
| ------------------------------------- | -------------------------------------- | --------------------------------------- |
| `journal.entry_created.v1`            | Entry and revision 1 commit            | entry/revision IDs, number, class, kind |
| `journal.entry_revised.v1`            | A revision advances current            | entry/revision IDs, number, class, kind |
| `journal.entry_privacy_changed.v1`    | Current processing class changes       | content-free revision payload           |
| `journal.entry_archived.v1`           | Active entry becomes archived          | entry ID and resulting entry version    |
| `journal.entry_deletion_requested.v1` | Confirmed deletion request is recorded | entry ID and resulting entry version    |

All use the entry resource as aggregate, request UUID as correlation, and one
pending outbox message with topic equal to event type. Body, raw text, content
hash, and history are prohibited payload fields. Strict schema tests reject
unknown fields including body text.

## Reliable delivery

Each committed event has exactly one owner-matching outbox row. WP-06 dispatches
one `meridian.outbox.v1` job whose ID equals the outbox ID and whose strict data
contains only schema version, owner/outbox/event IDs, and event type. The worker
loads the canonical envelope from owner-scoped storage and passes event ID as
the consumer idempotency key. Queue jobs and observations never copy payloads.

Two backed-off retries produce three total attempts. Exhaustion or a classified
non-retryable error records `failed` with a stable code/time and moves pg-boss
work to `meridian.outbox.dead.v1`. These are delivery states, not new domain
events, so no product event vocabulary was added in WP-06.

## Microsoft integration events v1

| Event                                               | Emitted when                                     | Payload                                              |
| --------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| `integration.microsoft_connected.v1`                | Exact consent and encrypted token custody commit | integration ID, exact scopes, connected status       |
| `integration.microsoft_disconnected.v1`             | Owner confirms local disconnect                  | integration ID, exact scopes, disconnected status    |
| `integration.microsoft_reauthorization_required.v1` | Refresh consent is no longer valid               | integration ID, exact scopes, reauthorization status |

These events and their outbox rows commit with connection/consent state. They
never contain Microsoft subject/display name, tokens, codes, verifier, client
secret, provider diagnostics, journal content, or calendar data. The existing
reliable worker accepts the `integration.` type prefix and otherwise applies the
same identifier-only delivery policy.

## Proposal events v1

| Event                         | Emitted when                           | Payload                 |
| ----------------------------- | -------------------------------------- | ----------------------- |
| `proposal.batch_created.v1`   | One validated proposal batch commits   | proposal IDs and count  |
| `proposal.accepted.v1`        | Owner accepts without editing          | proposal ID/type/status |
| `proposal.edited_accepted.v1` | Owner edits then accepts               | proposal ID/type/status |
| `proposal.dismissed.v1`       | Owner dismisses and starts suppression | proposal ID/type/status |

Payloads omit source text, proposal title/detail, uncertainty, confidence, and
provider output. Source provenance stays in the owner-scoped proposal and
derivation rows. Staleness is caused by the already-audited journal revision;
WP-09 does not emit a second stale event.

## Task and reminder action events v1

| Event                        | Emitted when                                |
| ---------------------------- | ------------------------------------------- |
| `action.task_created.v1`     | Explicit or accepted-proposal task commits  |
| `action.task_updated.v1`     | An active task receipt edit commits         |
| `action.task_completed.v1`   | A later governed completion commits         |
| `action.reminder_created.v1` | Internal canonical reminder intent commits  |
| `action.reminder_updated.v1` | A scheduled reminder receipt edit commits   |
| `action.receipt_undone.v1`   | Owner undo and terminal target state commit |

Every payload contains only target resource ID/type/state and nullable receipt
ID. Target title, notes, purpose, time, recurrence, feedback, source text, and
delivery material stay out of events and outbox rows. WP-10 emits no delivery
event because it has no delivery adapter.

## Local Today events v1

| Event                             | Emitted when                                  |
| --------------------------------- | --------------------------------------------- |
| `today.agenda_block_created.v1`   | Manual local agenda block commits             |
| `today.agenda_block_updated.v1`   | Version-guarded local agenda edit commits     |
| `today.priority_selected.v1`      | One of three daily task positions commits     |
| `today.task_completed.v1`         | Owner completes a canonical task in-app       |
| `today.reminder_completed.v1`     | Owner completes a canonical reminder in-app   |
| `today.reminder_dismissed.v1`     | Owner dismisses a canonical reminder in-app   |
| `today.agenda_block_completed.v1` | Owner completes a local agenda block          |
| `today.agenda_block_cancelled.v1` | Owner cancels a local agenda block            |
| `today.change_undone.v1`          | Exact-version lifecycle/priority undo commits |

Payloads contain only action enum, target resource ID/type, and nullable Today
receipt ID. Agenda/task/reminder content, dates, time zones, and priority dates
are prohibited. These are local application events, not notification or
calendar-provider evidence.

## Goal and edge events v1

| Event                        | Emitted when                                 |
| ---------------------------- | -------------------------------------------- |
| `goal.created.v1`            | Manual incubating goal commits               |
| `goal.updated.v1`            | Version-guarded goal content edit commits    |
| `goal.transitioned.v1`       | Valid lifecycle transition commits           |
| `goal.edge_created.v1`       | Registered owner-scoped relationship commits |
| `goal.edge_removed.v1`       | Removable relationship is terminally removed |
| `goal.load_limit_updated.v1` | Owner changes the advisory active-goal guide |

Payloads contain only action/state/edge enums, resource and edge identifiers,
and the numeric soft guide where applicable. Goal title, narrative, success
criteria, target date, life domain, and linked task content are prohibited.
They are local audit events and provide no execution or provider evidence.

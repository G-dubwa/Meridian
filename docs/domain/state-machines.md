---
purpose: Document governed domain lifecycles.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# State machines

## Journal entry

`active → archived → deletion_requested` or `active → deletion_requested`.
Only active entries accept revisions. Each transition increments the optimistic
version and is idempotent under the same correlation ID. WP-05 has no unarchive,
request cancellation, or deletion execution.

## Journal revision

Revisions have no mutable lifecycle. Append establishes number, body, class,
change kind, hash, occurrence/creation time, and author. PostgreSQL rejects every
update. The current pointer may advance but an earlier revision never changes.

## Outbox delivery

`pending → in_flight → succeeded` is the normal path.
`in_flight → in_flight` records a retry attempt; terminal exhaustion or a
non-retryable classification yields `in_flight → failed`. `succeeded` and
`failed` are terminal under duplicate delivery. `uncertain` remains reserved
for a later external write whose provider state cannot yet be reconciled.

Dispatch changes pending to in-flight in the same transaction as pg-boss job
creation. Attempt counts increase monotonically. Succeeded requires
`processed_at`; failed requires `dead_lettered_at` and a sanitized error code.

## Microsoft connection

No account becomes `connected` until code exchange, exact token-response scope
validation, signed ID-token/nonce/account-continuity validation, encrypted token
storage, grant consent row, domain event,
and outbox row commit atomically. `connected → disconnected` occurs only after
owner confirmation and clears token ciphertext. A revoked refresh produces
`connected → reauthorization_required` and also clears tokens. Either terminal
local state can return to connected only through a fresh one-time authorization.

OAuth authorization sessions are `pending → consumed` or expire. Consumption
atomically matches the SHA-256 state hash, returns the encrypted verifier to the
server process once, and overwrites its stored ciphertext with `v1.consumed`.
The stored nonce hash binds the signed ID-token nonce to that consumed session.
Consent records have no mutable state; each transition appends a new row.

## Proposal

`pending → accepted | edited_accepted | dismissed | stale | expired`.
Only pending, unexpired proposals accept an owner-confirmed optimistic decision.
In WP-10, task/commitment/reminder acceptance and canonical target creation are
one transaction; a reminder additionally needs an exact owner-confirmed instant
and zone. A hypothesis can be dismissed, made stale, or expire but cannot be
accepted as durable structure. Dismissal records
a 90-day dedupe suppression; active proposals expire after 30 days. A material
source revision change makes every pending proposal from the prior revision
stale in the same journal transaction.

## Task

`open → scheduled | done | dropped | superseded` and `scheduled → open | done |
dropped | superseded`. Terminal states never reopen. Due-field receipt edits
move between open and scheduled. Undo of creation moves an active task to
dropped while retaining the target, receipt, provenance, and audit event.

## Reminder and occurrence

Canonical reminder intent follows `scheduled → due → delivered → completed |
dismissed | snoozed`; `due → completed | dismissed | snoozed`; `snoozed →
scheduled`; `scheduled → paused | expired | dismissed`; and `paused →
scheduled`. Completed, dismissed, and expired are terminal. WP-10 creates and
edits only scheduled internal intent; delivery transitions remain inactive.

Occurrence state is `pending → due → acknowledged | dismissed`, with pending
also able to become cancelled when the trigger is edited or creation is undone.
The unique reminder/instant key prevents duplicate occurrence identity. An edit
cancels rather than rewrites old pending occurrences.

## Command receipt

`active → undone` after owner confirmation and optimistic receipt/target
validation. Undone is terminal. Receipt edits leave the receipt active while
advancing the target version and appending an action event. A receipt is
evidence and a reversible-control handle, not external-action authority.

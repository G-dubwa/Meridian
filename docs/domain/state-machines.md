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

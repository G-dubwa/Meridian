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

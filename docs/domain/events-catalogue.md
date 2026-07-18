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

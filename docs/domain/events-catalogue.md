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

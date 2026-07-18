---
purpose: Define processing classes and non-disclosure invariants.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../domain/journal.md
---

# Privacy

The owner chooses processing class before each journal create or revision. A
future local pre-screen may raise but never lower that choice. WP-05 performs no
remote processing.

| Class     | Storage/display                      | AI-intended repository |
| --------- | ------------------------------------ | ---------------------- |
| Standard  | Owner-scoped PostgreSQL and local UI | Current active only    |
| Sensitive | Owner-scoped PostgreSQL and local UI | Excluded               |
| Private   | Owner-scoped PostgreSQL and local UI | Excluded invariant     |

The query applies `processing_class = 'standard'` and active/current joins in
PostgreSQL; it never fetches disallowed rows for caller filtering. A later
Sensitive route needs a separate port, consent, and threat-model change.

Bodies and hashes are forbidden from ordinary logs, events/outbox payloads,
activity items, URLs, and errors. They appear only in authenticated journal
responses and owner-scoped revision storage. Private remains visible to its
owner; it means local display only.

A deletion request does not claim erasure. Until later governed propagation
completes, the entry and revisions remain with `deletion_requested` status.

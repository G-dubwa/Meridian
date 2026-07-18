---
purpose: Catalogue versioned domain events.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Event catalogue

WP-02 defines `DomainEventEnvelopeV1` only. No concrete domain event is registered yet.

Every future event must provide schema version `1`, branded event identity, non-empty type, offset-aware ISO timestamp, `UserScope`, correlation identity, optional causation and aggregate resource identity, and a versioned validated payload. A concrete event and payload schema must be added together with producer/consumer contract tests.

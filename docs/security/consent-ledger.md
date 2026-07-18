---
purpose: Define owner consent records and staged provider permissions.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Consent ledger

WP-07 records Microsoft consent as owner-scoped, append-only rows. Each row has
an action, the exact five-scope tuple, timestamp, integration account identity,
and correlation identity. Allowed actions are `granted`, `disconnected`, and
`reauthorization_required`. Tokens, authorization codes, PKCE material,
provider error text, and personal content are prohibited.

A grant row is appended only after code exchange, exact-scope validation,
minimal profile retrieval, encrypted token persistence, domain event, and outbox
write succeed in one transaction. Disconnect and revoked-refresh transitions
also atomically clear tokens and append their evidence. PostgreSQL rejects
row updates so later status cannot rewrite consent history, and application
code exposes no deletion path;
owner-data deletion may later cascade under its separately governed policy.
This is a record of Meridian's local handling. It is not proof that consent was
removed at Microsoft; provider-side withdrawal remains an owner action.

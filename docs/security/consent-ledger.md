---
purpose: Define owner consent records and staged provider permissions.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Consent ledger

Microsoft consent is recorded as owner-scoped, append-only rows. Each row has
an action, the exact requested OAuth/OIDC scope tuple, the exact delegated Graph
access-token `scp` permissions, timestamp, integration account identity, and
correlation identity. Allowed actions are `granted`, `disconnected`, and
`reauthorization_required`. Tokens, authorization codes, PKCE material,
provider error text, and personal content are prohibited.

Stage A correlates exactly `openid profile offline_access User.Read
Calendars.Read` requested with exactly `User.Read Calendars.Read` in Graph
`scp`. The gated WP-11 envelope correlates exactly those five plus
`Tasks.ReadWrite` with exactly `User.Read Calendars.Read Tasks.ReadWrite` in
Graph `scp`. OIDC scopes are not required to appear identically in the token or
consent display. Missing, duplicate, mismatched, or additional Graph
permissions fail closed before a grant is persisted.

A grant row is appended only after code exchange, exact-scope validation,
minimal profile retrieval, encrypted token persistence, domain event, and outbox
write succeed in one transaction. Disconnect and revoked-refresh transitions
also atomically clear tokens and append their evidence. PostgreSQL rejects
row updates so later status cannot rewrite consent history, and application
code exposes no deletion path;
owner-data deletion may later cascade under its separately governed policy.
This is a record of Meridian's local handling. It is not proof that consent was
removed at Microsoft; provider-side withdrawal remains an owner action.

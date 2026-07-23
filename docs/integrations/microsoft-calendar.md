---
purpose: Define Outlook calendar ownership, synchronisation, and reconciliation behaviour.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Microsoft calendar

## WP-07 connection boundary

Meridian can connect one personal Microsoft account independently of local
owner authentication. It uses the `consumers` authority and requests exactly
`openid profile offline_access User.Read Calendars.Read`. `User.Read` supports
the connection label through `/me?$select=id,displayName`; `Calendars.Read` is
approved now so WP-12 can introduce fixed-window read sync without a second
permission escalation. WP-07 performs no calendar event request.

The Settings surface states each purpose before consent, shows the exact granted
tuple and append-only consent history, and can disconnect locally. A disconnect
deletes stored token ciphertext but does not claim that Microsoft-side consent
was revoked. Microsoft `invalid_grant` produces `reauthorization_required` and
also clears local tokens.

## Programme deferral

On 23 July 2026 the owner deferred WP-12 and all further live Microsoft work to
prioritise a provider-independent local Alpha. Meridian must not contact Graph,
change Entra permissions, or initiate consent as part of WP-13A. The existing
WP-07 implementation and historical consent evidence remain recorded; local
configuration is neither altered nor treated as an Alpha dependency.

No WP-12 acceptance criterion is waived or passed. When Microsoft work resumes,
it requires a new explicit programme decision and its original permission,
privacy, reconciliation, and live-evidence gates.

## Deferred calendar behaviour

Calendar selection, fixed-window reads, recurrence expansion, delta handling,
private-item treatment, reconciliation, throttling, and 410 recovery remain
WP-12 work. Calendar writes are deferred beyond Personal Alpha. Mail, To Do,
shared-calendar, and application permissions are not part of this connection.

See ADR-0007 for OAuth and token custody, ADR-0010 for the provider-independent
Alpha sequence, and `.env.example` for local configuration names.

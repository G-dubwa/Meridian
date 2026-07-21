---
purpose: Define Meridian security boundaries and required controls.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: threat-model.md
---

# Security model

## Local owner identity

Meridian currently has exactly one local owner credential and no remote identity
provider dependency. Bootstrap is an explicit operator action, executes once,
and stores an Argon2id password hash. Ten one-time recovery codes are displayed
once; only SHA-256 hashes are persisted. Consuming a recovery code marks it used
atomically and revokes every existing session. No REST response returns recovery
material.

Authentication sessions use random opaque bearer tokens. Only their SHA-256
hashes and a session-bound CSRF hash enter PostgreSQL. Sessions expire after 30
minutes idle or 12 hours absolute, can be renewed by rotation, and can be
revoked individually or owner-wide. Production cookies use the `__Host-`
prefix, `Secure`, `HttpOnly` for the bearer credential, `SameSite=Strict`, and
`Path=/`. All state changes require double-submit CSRF verification plus the
stored session binding.

Authentication attempts are rate-limited by normalized identifier and a
one-way request fingerprint. Five failed password attempts within 15 minutes
lock the credential for 15 minutes; ten attempts per fingerprint/identifier
within that window trigger the broader rate limit. Public failures remain
generic. Append-only audit events record outcomes and reason codes without
passwords, recovery codes, session tokens, raw addresses, or journal content.

## Database trust boundary

Every user-owned WP-03 table stores an owner identifier. PostgreSQL forced row-level security compares it with the transaction-local `meridian.user_id`; the application transaction manager sets that value before exposing repositories. Repository methods also require `UserScope` where owner identity is not already carried by the record.

The application role is not a table owner, superuser, `BYPASSRLS` role, or migration role. Administrative connections are privileged and must never serve requests. Connection pooling is safe only because scope is local to a transaction and cleared by PostgreSQL at transaction end.

Owner-matching composite foreign keys prevent cross-owner subtype, revision, event, outbox, and derivation relationships. Entry creation requires its canonical resource in the same successful transaction. Entry revisions and domain events are append-only for updates; governed hard deletion can cascade to remove evidence and links.

Journal routes require a valid owner session and transaction-local RLS scope.
Bodies never enter auth audit or domain-event/outbox payloads. The AI-intended
adapter selects only active current Standard revisions in SQL; Private/Sensitive
exclusion is not entrusted to presentation or model code.

The worker is a separate process with one narrow composition root. It resolves
the singleton owner through the technical authentication boundary, then every
outbox read/update sets transaction-local owner scope. Queue dispatch inserts a
pg-boss job and advances the outbox in one PostgreSQL transaction. Runtime jobs
carry identifiers and event type only; the canonical envelope stays behind RLS.
The health endpoint requires the owner session and never exposes pg-boss
administration or event payloads.

Authentication tables are a deliberately separate pre-authentication boundary.
Credential lookup, rate limiting, and session-token resolution must occur before
an owner scope exists, so those technical tables do not use owner RLS. They are
reachable only from server-side authentication adapters through the
authentication transaction manager. Deployment must grant the application role
only the required table operations and must keep migration/table-owner
credentials out of request processes. User content remains behind forced RLS.

## Microsoft integration boundary

Microsoft is a separately consented integration, never Meridian authentication.
The confidential Web flow uses S256 PKCE, random state and nonce values stored
only as hashes, atomic one-time consumption, a ten-minute expiry, and the fixed `consumers`
authority. The exact allowed tuple is `openid profile offline_access User.Read
Calendars.Read`; broader token-response scope metadata fails closed. Graph
access tokens remain opaque. The signed ID token is verified with the issuer,
JWKS URI, and signing algorithms fetched from the official `consumers`
discovery document. JOSE validation requires the GUID consumer issuer, exact
client audience, v2 token, signature, `exp`/`nbf`/`iat` with five-second clock
tolerance, nonce binding, consumer `tid`, and stable `sub`/`oid` identity. The
continuity key is `(consumer tid, oid)`, never display name or email;
insufficient legacy identity stops for owner review.

Access/refresh tokens and pending PKCE verifiers use AES-256-GCM envelopes with
purpose-specific authenticated context. The 32-byte base64 key and client secret
remain environment secrets. Integration accounts and consent records have
forced owner RLS; the OAuth session store is a narrow technical callback table
available only to server-side adapters. Consuming a session erases its encrypted
verifier. API/UI/events/logs never contain codes, verifiers, secrets, or tokens.

Refresh-token rotation is persisted atomically. Revoked consent or disconnect
clears local tokens while append-only consent evidence remains. Local login and
journal access continue when Microsoft is missing or unavailable.

## Current limits

Local authentication does not protect a compromised application process,
database administrator, host, browser profile, or owner mailbox/backup containing
recovery codes. Encryption-key management, production secret custody,
least-privilege production role provisioning, database encryption at rest,
connection TLS, and backup automation become deployment controls in their
governing packages. Tests prove owner isolation and the real local authentication
path; they do not claim protection from a compromised administrator.

pg-boss schema installation and upgrades require a migration credential.
Ongoing worker credentials must not own Meridian/pg-boss tables, bypass RLS, or
retain schema-creation authority. Later external-effect consumers add provider
reconciliation and per-effect idempotency before they can use retry safely.

Provider-token encryption does not protect a compromised application process or
host holding the encryption key. Production needs secret rotation and a governed
token re-encryption procedure. Local disconnect does not prove Microsoft-side
consent withdrawal.

---
purpose: Record Microsoft OAuth, consent, and token-custody decisions introduced in WP-07.
audience: Owner, reviewers, operators, contributors, and coding agents.
authoritative-for: Microsoft authority, OAuth flow, delegated scopes, callback boundary, token encryption, refresh, and disconnect semantics.
update-triggers: Microsoft authority, permission envelope, OAuth flow, token storage, refresh, or disconnect behaviour changes.
related-docs: ../../process/work-packages/WP-07-microsoft-connection-and-consent.md
---

# ADR-0007 — Microsoft OAuth and token custody

Status: Accepted, 18 July 2026.

## Context

Meridian needs a personal Microsoft connection for later read-only Outlook
calendar sync. Local owner authentication must continue independently. WP-07
needs verifiable consent history and refreshable delegated access without
introducing calendar reads or any broader permission.

## Decision

Use the OAuth 2.0 authorization-code flow with S256 PKCE and a confidential Web
app registration. Fix the authority to `consumers`; organizational tenants are
out of scope. Request exactly `openid profile offline_access User.Read
Calendars.Read`. Reject token responses containing an unapproved scope and do
not use `.default`. Treat Graph access tokens as opaque and derive granted
permissions only from the token endpoint response's `scope` metadata. Fetch the
`consumers` OpenID discovery document, use its issuer, JWKS URI, and permitted
signing algorithms with JOSE verification, and require a v2 token, exact client
audience, five-second clock tolerance, nonce binding, consumer tenant, and
stable identity claims. Account continuity is the `(tid, oid)` tuple: `tid` is
the fixed consumer tenant and Microsoft documents ID-token `oid` as the same
immutable identifier returned by Graph user `id`. Meridian treats that value
as a bounded opaque Microsoft identifier rather than imposing RFC UUID bits.
Display name and email are never continuity identifiers. An invalid historical object ID requires
owner review instead of rebinding. No Graph request is needed during
connection except the separately gated legacy bridge below. WP-07 does not read
calendar data.

### Legacy continuity amendment — 22 July 2026

WP-07 stored the personal-account Graph `/me.id`. Later signed-ID-token
validation exposed a live case where that retained opaque value did not equal
the ID-token `oid`, despite Microsoft's general documentation describing them
as equivalent. Meridian must not accept a display-name/email match, silently
replace the value, or repeatedly ask the owner to alter Entra permissions.

Only an exact, eligible WP-11 six-scope upgrade may bridge this legacy record.
After token-response scope, signed ID-token, nonce, tenant, and required-claim
validation, a direct identifier match remains sufficient. Otherwise Meridian
performs at most one read-only `GET /me?$select=id`, compares only the returned
ID with the historical value, and retains neither response content nor
candidate credentials on failure. A match permits atomic replacement with the
validated `(tid, oid)` identity alongside encrypted tokens and consent
evidence. Future callbacks then use direct identity continuity. The bridge is
approved for mocked implementation only; live Graph execution requires a
separate owner gate.

Store only SHA-256 hashes of the one-time state and OIDC nonce. Encrypt the PKCE verifier while
it is pending and erase its ciphertext on atomic consumption. The callback may
complete without Meridian's Strict SameSite session cookie because the random,
single-use, ten-minute state binds it to an owner and exact redirect URI.

Encrypt access tokens, refresh tokens, and pending PKCE verifiers with
AES-256-GCM. A distinct authenticated-data context binds each envelope to its
owner, purpose, and integration/session identity. The 32-byte base64 encryption
key and Microsoft client secret stay outside PostgreSQL and source control.
ID-token display-name basics, granted scope tuple, expiry, status, and consent history remain
owner-scoped data protected by forced RLS.

Refresh shortly before access-token expiry. Persist a rotated refresh token
atomically when Microsoft returns one; retain the prior refresh token when it
does not. `invalid_grant` clears locally stored token ciphertext, marks the
connection `reauthorization_required`, and appends consent/event evidence.
Disconnect also clears local tokens and appends evidence; it does not claim to
revoke Microsoft-side consent.

## Consequences

- Local login and journal access do not depend on Microsoft availability.
- The OAuth session table is a narrow server-only technical callback boundary;
  integration accounts and consent records use owner RLS.
- A database disclosure alone does not reveal usable provider tokens, but a
  compromised application process or host with the encryption key can.
- Encryption-key rotation needs an explicit re-encryption procedure before
  production deployment.
- Calendar data access remains deferred to WP-12; write, mail, To Do,
  shared-calendar, and application permissions require a separate gate.

## Alternatives rejected

- Device code or public-client flow: does not match the server-hosted callback
  and confidential secret custody boundary.
- `common` or `organizations`: broadens supported identities beyond the
  approved personal-account scope.
- Plaintext or database-managed token keys: a database disclosure would expose
  both ciphertext and its protection material.
- Stateless callback data or reusable state: weakens replay control and owner
  binding.
- Microsoft login as Meridian identity: would make diary access depend on a
  provider connection.

## Rollback

Disable the four Microsoft environment variables to prevent new connections.
Disconnect any existing account through the owner UI before retiring the app
registration. Preserve consent records and content-free events as evidence;
never expose or copy encrypted token material during reconciliation.

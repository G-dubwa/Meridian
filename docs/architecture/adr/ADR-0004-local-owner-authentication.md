---
purpose: Record local owner credential, recovery, session, CSRF, and audit decisions.
audience: Owner, contributors, operators, and coding agents.
authoritative-for: WP-04 local authentication architecture and security controls.
update-triggers: Identity provider, credential, recovery, session, CSRF, or authentication audit design changes.
related-docs: ../../security/threat-model.md
---

# ADR-0004 — Local owner authentication

- Status: Accepted
- Date: 18 July 2026
- Supersedes: None

## Context

Meridian needs an independent local login before Microsoft or any other provider
is configured. It is a single-owner personal system, but its browser, database,
and operational boundaries still require resistant password storage, recoverable
access, revocable sessions, CSRF protection, abuse controls, and an audit trail
that cannot itself leak credentials.

## Decision

Create exactly one local owner through an operator-only CLI. Store passphrases
with the maintained Node `argon2` implementation using Argon2id defaults and
require at least 16 characters. Generate ten human-readable recovery codes,
display them once, and persist only SHA-256 hashes. Recovery consumes one code
atomically and revokes all prior sessions; it does not issue replacement codes.

Use cryptographically random opaque browser sessions. Persist only bearer and
CSRF hashes. Enforce 30-minute idle and 12-hour absolute expiry, touch active
sessions at a bounded interval, rotate on renewal, and support both other-session
and all-session revocation. Harden production cookies with the `__Host-` prefix,
`Secure`, `SameSite=Strict`, `Path=/`, and `HttpOnly` for the bearer. Require a
double-submit CSRF value that is also bound to the persisted session.

Persist rate-limit state and append-only authentication events in PostgreSQL.
Normalize identifiers, keep public failures generic, hash request fingerprint
inputs immediately, and prohibit secrets or user content in API responses and
audit records. Authentication orchestration remains in `application`; Argon2 and
crypto primitives live in `infrastructure-auth`; PostgreSQL adapters live in
`infrastructure-db`; the web composition root is the only presentation file that
constructs them.

## Consequences

Local access has no Microsoft availability dependency. A database disclosure
does not directly disclose reusable bearer, CSRF, or recovery values, though
offline password attacks and privileged tampering remain risks. Recovery is
deliberately finite: losing both the password and all unused codes has no bypass
in WP-04. Operators must secure one-time terminal output and follow the runbook.

Pre-authentication technical tables cannot rely on an already-established owner
RLS scope. They stay server-only and require least-privilege runtime grants,
while user-content tables retain forced RLS. WebAuthn, remote identity,
recovery-code regeneration, password-reset email, and security notifications are
deferred.

## Migration and rollback

Migration `0002_wp04_local_owner_authentication.sql` adds credentials, recovery
codes, sessions, rate limits, and authentication events plus constraints,
indexes, and the append-only event trigger. It upgrades both empty and WP-03
seeded databases without modifying resource data.

Before persistent data exists, revert WP-04 and recreate the disposable
database. After bootstrap or user data exists, migrations remain forward-only:
stop writes, restore a verified backup into a fresh database, and deploy its
matching application revision. Never roll back by deleting the owner credential
or weakening session/recovery constraints in place.

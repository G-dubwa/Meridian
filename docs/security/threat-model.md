---
purpose: Track assets, threats, mitigations, and residual risks.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: model.md
---

# Threat model

## Scope and assets

WP-04 covers local owner bootstrap, password and recovery authentication,
browser sessions, CSRF, revocation, rate limiting, and authentication audit. The
primary assets are the owner credential, recovery capability, active sessions,
owner identity, authentication availability, and the separation between an
unauthenticated request and user content. Journal content and provider tokens
are out of this package but are protected downstream by the authenticated owner
boundary.

Trust boundaries are the operator terminal, browser, Next.js presentation
process, application service, PostgreSQL connection, and database. Network TLS,
host hardening, proxy trust configuration, and production secret custody are
deployment responsibilities.

## Threats and controls

| Threat                                      | Controls                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Offline password cracking                   | Argon2id hashes, minimum 16-character passphrase, no password response or log material.                |
| Credential stuffing or guessing             | Generic failures, persisted 15-minute attempt window, credential lockout, fingerprint rate limiting.   |
| Account enumeration                         | Unknown, incorrect, locked, consumed, and invalid recovery proofs share public failure semantics.      |
| Stolen database rows                        | Passwords use Argon2id; recovery, session, CSRF, and fingerprint values are one-way hashes.            |
| Session theft or fixation                   | Cryptographic opaque tokens, production hardened cookies, rotation on renewal, absolute/idle expiry.   |
| Cross-site request forgery                  | Strict SameSite cookies plus cookie/header double submit and session-bound CSRF hash.                  |
| Recovery-code replay                        | Atomic consume-once update, hashed-only storage, concurrent reuse rejection, all-session revocation.   |
| Bootstrap race or second owner              | Transactional existence check plus singleton database uniqueness/check constraint.                     |
| Audit manipulation                          | Authentication events reject updates; application code provides append-only access.                    |
| Secret leakage through telemetry or API     | Strict response schemas, no-store responses, generic errors, hashed request metadata, synthetic tests. |
| Cross-owner content access                  | Auth resolves one owner; content repositories retain transaction-local forced RLS from WP-03.          |
| Denial of service through repeated failures | Bounded persistent limits; operator runbook distinguishes expiry from emergency session revocation.    |

## Security invariants

- Raw passphrases, recovery codes, session tokens, CSRF tokens, network
  addresses, and user agents are not persisted in authentication records or
  events.
- Bootstrap recovery codes are the only secret material written to stdout, and
  only during the successful first bootstrap.
- Recovery-code use is consume-and-revoke, not regeneration. A consumed code is
  never replaced through the API because doing so would expose new recovery
  material to a possibly compromised session.
- Browser state-changing routes require a valid active session where applicable
  and valid CSRF proof. Login and recovery also require pre-authentication CSRF.
- Microsoft availability or configuration has no bearing on local login.

## Residual risks and follow-up

Recovery codes must be transferred from the bootstrap terminal into secure
offline custody; Meridian cannot recover them if lost. An attacker controlling
the host or application process can observe secrets before hashing. A database
administrator can alter or delete authentication records and audit events. A
shared or compromised browser can use a live session until expiry or revocation.
Proxy-derived fingerprint inputs are advisory abuse signals, not identity.

Production deployment must add HTTPS termination, trusted-proxy configuration,
least-privilege database grants, encrypted backups, secret rotation, monitoring,
and restore evidence. WebAuthn, external identity, recovery-code regeneration,
and notification of security events remain later decisions and must receive
their own threat-model updates.

## WP-05 journal extension

Journal assets add bodies, processing choices, history, and deletion intent.
Forced RLS/authenticated routes prevent cross-owner reads; append-only triggers
and optimistic versions prevent silent evidence mutation; SQL-level Standard
eligibility prevents Private/Sensitive disclosure to future AI callers;
content-free events/activity prevent secondary logging leaks; and exact deletion
confirmation records intent without claiming erasure.

Residual risks include a compromised browser/session/process/administrator,
future response-size growth, and retention after a deletion request until a
later deletion executor is governed and tested.

## WP-06 worker extension

| Threat                            | Controls                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Lost outbox-to-queue handoff      | Row lock, pg-boss insert, and `in_flight` transition share one transaction.                               |
| Concurrent duplicate dispatch     | `SKIP LOCKED`, one job ID per outbox ID, and unique pg-boss identity; live race test.                     |
| Duplicate consumer execution      | Numbered claim, event-ID idempotency key, terminal duplicate handling; later side effects must reconcile. |
| Infinite retry pressure           | Two exponential retries, three total attempts, terminal Meridian and pg-boss dead letter.                 |
| Content leakage through jobs/logs | Strict identifier-only job and observation schemas; raw exception and payload omission tests.             |
| Cross-owner health/processing     | Session-required health, transaction-local RLS, job/row owner and event identity match.                   |
| Queue administration exposure     | Separate `pgboss` schema, least-privilege runtime grants, no administrative API/UI.                       |

Residual risks are a compromised worker/host/database administrator, incorrect
future consumer idempotency, operator redrive without provider reconciliation,
and queue-schema privilege misconfiguration. WP-06 performs no external side
effect, so `uncertain` is reserved rather than guessed.

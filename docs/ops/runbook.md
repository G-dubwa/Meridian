---
purpose: Define routine operation, health checks, and incident response.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../security/threat-model.md
---

# Operations runbook

## Initial owner bootstrap

1. Start PostgreSQL, set `DATABASE_URL` to the migrated database, and run
   `pnpm db:migrate` with the migration credential.
2. Switch to the runtime database credential. From a private terminal run
   `pnpm auth:bootstrap -- --identifier <owner-identifier> --timezone
<IANA-zone> --locale <locale>`.
3. Enter and confirm a passphrase of at least 16 characters at the hidden
   prompts. For controlled automation only, pipe two identical newline-delimited
   values and add `--password-stdin`; never place a passphrase in argv or shell
   history.
4. Move the ten displayed recovery codes into encrypted offline custody. This is
   their only display. Do not capture terminal output in CI or tickets.
5. Verify `/login`, then run the bootstrap command again and confirm it exits
   with `BOOTSTRAP_COMPLETE` without printing secret material.

Bootstrap creates exactly one owner. Do not delete the singleton credential to
"retry" against a database containing data; restore the matching backup or use
the governed recovery procedure.

## Routine authentication checks

- `GET /health` proves only that the web process responds.
- A login followed by `GET /api/auth/session` proves the credential, cookie,
  session store, and database path.
- The Security page shows the normalized identifier and active session count.
- Inspect `auth_events` by event type, outcome, reason, request ID, and time. Do
  not copy hashes into general-purpose logs or support records.

Sessions have a 30-minute idle and 12-hour absolute lifetime. Renewal rotates
the bearer and CSRF values. Password change revokes other sessions and keeps the
current verified session. "Sign out other sessions" preserves the current
session; "Sign out everywhere" includes it.

## Recovery-code use

Use `/login` recovery mode from a trusted browser with the owner identifier and
one offline code. A successful use atomically marks that code consumed, revokes
all prior sessions, and creates one new session. Move the consumed code out of
the unused set. Codes are not regenerated or returned by the API. If no unused
codes remain and the password is unavailable, stop: WP-04 has no bypass or
operator password reset. Restore an accepted backup only if that recovery point
and its consequences are understood.

## Lockout response

Five failed password attempts in 15 minutes lock the credential for 15 minutes;
the wider per-identifier/fingerprint limiter allows ten attempts in that window.
All client responses remain generic.

1. Confirm the failure volume and reason codes in `auth_events` without querying
   or exposing credential hashes.
2. If activity is expected, wait for the recorded `locked_until`/rate-limit
   expiry, then attempt once from the trusted device. Do not modify counters to
   shorten routine lockout.
3. If activity is unexpected, treat active sessions as potentially compromised
   and follow emergency revocation before trying recovery.

## Emergency session revocation

Preferred: from an authenticated trusted browser choose "Sign out everywhere"
in Settings > Security. This uses the audited application service and includes
the current session.

If no trusted session exists but a recovery code does, perform recovery; success
revokes every prior session automatically. If the web process is suspected,
isolate it first and rotate deployment/database credentials under the deployment
incident procedure. Direct database modification is last-resort administrative
work: stop the application, take and verify a backup, set `revoked_at` for all
active rows in `auth_sessions`, record an external incident audit trail, restart,
and confirm old cookies receive `SESSION_INVALID`. Never delete credential or
recovery rows as a revocation shortcut.

## Incident evidence

Preserve timestamps, application revision, request IDs, audit event IDs, event
types/outcomes/reasons, and affected session IDs. Exclude passwords, recovery
codes, bearer/CSRF values, hashes, database URLs, and journal content. A suspected
secret disclosure requires rotation/recovery, revocation, and a threat-model
review before closure.

---
purpose: Report the independently deployable Meridian Foundation release at WP-06.
audience: Owner, reviewers, operators, contributors, and coding agents.
authoritative-for: Foundation WP-01–WP-06 release evidence, limitations, and handoff.
update-triggers: Foundation reconciliation, verification correction, or superseding release evidence.
related-docs: ../work-packages/WP-06-worker-and-reliable-event-processing.md
---

# Foundation release report

Release date: 18 July 2026. Scope: WP-01 through WP-06.

## Delivered capability

Foundation is a local-owner Meridian slice with a governed TypeScript monorepo,
strict dependency direction, PostgreSQL/pgvector resource foundation, hardened
local authentication, a walking journal with immutable revision history and
processing-class-first capture, content-free event/outbox records, and a
separate pg-boss worker with retry, dead-letter, and owner health visibility.

The walking journal and reliable processing operate together in live evidence:
create/revise/archive/deletion-request writes remain atomic with their outbox;
concurrent dispatch produces one job per outbox identity; four controlled
journal events complete; one controlled failure retries three times and appears
consistently in Meridian and pg-boss dead-letter state. Private evidence remains
outside the AI-intended query and no journal body enters a job or observation.

## Verification evidence

The release gate passes formatting, lint, strict typecheck,
78-module/126-dependency architecture rules and their negative fixture,
migration/snapshot drift, 7 unit files/23 tests, 1 integration file/7 live
PostgreSQL migration/RLS/queue tests, 8 live Next.js authentication/journal/
health journeys, 91 documentation files and the generated data dictionary, and
every workspace production build.

## Security and privacy posture

Owner routes use hardened sessions and CSRF; content tables remain forced-RLS
scoped. Passwords use Argon2id; recovery/session values are hashed. Entry bodies
and hashes are absent from auth audit, events, outbox job data, activity,
observations, errors, and health responses. Standard-only AI eligibility is
enforced in SQL. No Microsoft, model, notification, or external-write data has
crossed a provider boundary.

## Operations and rollback

Run web and worker as separate processes against the migrated PostgreSQL
database. Monitor Settings > System health and content-safe worker observations.
Stop the worker before database restore or application rollback. Restore a
matching off-box verified backup into fresh PostgreSQL once data is persistent;
do not reverse migrations or delete queue evidence.

## Known limitations and next gate

This is a Foundation release, not Personal Alpha: there is no Microsoft
connection, model interpretation, Triage, task/reminder delivery, calendar,
voice/offline capture, provider reconciliation, export, or executed deletion.
The journal consumer intentionally acknowledges Foundation events without a
downstream product effect. Lists remain personal-scale and unpaginated.

WP-07 is next, but granting Microsoft OAuth permissions is a mandatory owner
gate. Stage A is limited to the OIDC scopes `openid`, `profile`, and
`offline_access` plus delegated Microsoft Graph `User.Read` and
`Calendars.Read`; it excludes calendar write, To Do, mail, shared-calendar, and
application permissions. The owner must approve that envelope and create or
select a personal-account-capable app registration with the eventual exact
redirect URI. The safest default is no registration change, no consent, and no
provider connection until the registration and encrypted token-custody plan are
reviewed. Do not place a client secret or token in documentation or chat.

---
purpose: Record journal identity, immutable revision, privacy, concurrency, and event decisions.
audience: Owner, contributors, operators, and coding agents.
authoritative-for: WP-05 journal persistence and application architecture.
update-triggers: Entry revision, lifecycle, processing eligibility, concurrency, or journal event semantics change.
related-docs: ../../domain/journal.md
---

# ADR-0005 — Immutable journal revisions

- Status: Accepted
- Date: 18 July 2026
- Supersedes: None

## Context

Journal text is primary personal evidence. Editing it in place would erase what
future proposals or decisions were based on, while sending Private text into a
generic processing query would violate the processing-class boundary. Concurrent
browser writes and transport retries must not silently duplicate or overwrite
evidence.

## Decision

Keep one canonical `resources`/`entries` identity and append an
`entry_revisions` row for every content or privacy edit. Advance
`entries.current_revision_id`, sensitivity, updated time, and optimistic version
in the same owner-scoped transaction. Existing revisions remain protected by the
update-rejecting trigger. SHA-256 content hashes are exactly 64 hex characters.

Select processing class before create or revise. The dedicated
`findCurrentForAiProcessing` query joins active entries to current revisions and
selects `standard` in SQL. Private and Sensitive rows are excluded before
leaving persistence; later consent routes require different explicitly named
ports.

Create, revise, privacy change, archive, and deletion request write a versioned,
content-free event and matching pending outbox message transactionally. Mutation
request UUIDs are correlation/idempotency identities. A repeated type and
correlation returns the existing aggregate. Material-change invalidation is a
no-op application hook in WP-05; later workflows consume reliable events.

Archive and `deletion_requested` are explicit states. A hard-deletion request
requires confirmation but does not remove evidence in WP-05.

## Consequences

Revision append, current-pointer advancement, event, and outbox either all
commit or roll back. Optimistic conflicts return `409`. Body content is present
only in owner-authenticated journal responses and revision rows, never in
event/outbox payloads or activity items. Archived/deletion-requested entries are
not processing candidates. Pagination is deferred until measured size requires
it.

## Migration and rollback

Migration `0003_wp05_walking_journal_slice.sql` expands entry lifecycle states,
normalises pre-WP-05 placeholder hashes from body evidence, adds the hash
constraint, and indexes owner/class/time. The append-only trigger is disabled
only for the migration backfill and re-enabled in the same migration.
Migration `0004_wp05_command_idempotency.sql` uniquely constrains owner, event
type, and correlation; transaction-scoped advisory locking makes simultaneous
retries return the first committed aggregate instead of surfacing a race.

Before journal data exists, revert and recreate the disposable database.
Afterwards, stop writes and restore a verified matching backup into a fresh
database. Never roll back by mutating or dropping selected revisions.

---
purpose: Plan and record WP-05 implementation and acceptance evidence.
audience: Owner, reviewers, contributors, and coding agents.
authoritative-for: WP-05 scope, exclusions, migration, privacy, verification, review, and rollback evidence.
update-triggers: WP-05 plan, implementation, findings, checks, or completion state changes.
related-docs: ../../architecture/adr/ADR-0005-immutable-journal-revisions.md
---

# WP-05 — Walking journal slice

## Status and dependencies

- Status: Complete
- Dependency: WP-04 complete and green at `12cd8cd`
- Branch: `wp-05-walking-journal-slice`
- Started: 18 July 2026
- Completion commit: `WP-05: Walking journal slice`

## Scope and exclusions

Add authenticated create, revise, list, detail/history, archive, hard-deletion
request, processing-class selection, activity ledger, typed client, versioned
events/outbox, material-change no-op hook, and Standard-only AI-intended query.

Exclude model calls, Triage, embeddings, Microsoft, reminders/tasks, voice,
offline support, deletion execution, derived objects, and workers.

## Change surface

- Domain/application: journal schemas, lifecycle/event vocabulary, expanded ports,
  immutable/optimistic/idempotent orchestration, invalidation interface.
- Persistence: migrations `0003`/`0004`, history/activity, advisory command lock,
  uniqueness, and AI-query adapters.
- API/UI: six journal route groups, generated typed methods, composer, timeline,
  detail/edit/history, archive/deletion request, and activity view.
- Events: created, revised, privacy changed, archived, deletion requested; one
  pending outbox message per event, no body content.
- Documentation: OpenAPI, ADR-0005, journal/event/model/state/privacy/security,
  migration/testing/operations, state, roadmap, and changelog.

## Tests and acceptance

- Unit tests validate body/content-free payload schemas and the no-op hook.
- Live PostgreSQL tests prove seeded/empty migration, immutable trigger,
  append/current atomicity, optimistic state, correlation retry, privacy
  invalidation, event/outbox parity, RLS, and Standard-only query.
- One Playwright journal journey creates Standard, revises it, inspects both
  revisions, creates Private, proves the real AI-intended port returns only
  Standard, renders Journal/detail, archives, requests deletion, and reads five
  content-free activity events.
- Full `pnpm check` covers formatting, lint, types, architecture, snapshots,
  unit/integration/E2E, docs/dictionary, and builds.

## Security, privacy, observability, and operations

Every route authenticates owner scope; mutations require session-bound CSRF.
RLS and owner predicates remain defense in depth. Private/Sensitive exclusion
occurs in SQL. Bodies/hashes never enter ordinary logs, events, outbox, activity,
URLs, or errors. Lifecycle writes use expected versions; repeated command UUIDs
are idempotent. Deletion request requires literal confirmation and does not claim
erasure.

No model/provider cost or latency exists. Personal-scale history/list responses
are bounded by current usage; pagination is a recorded future scale limitation.

## Rollback or reconciliation

Before journal data, recreate the disposable database. Afterwards stop writes,
restore the last verified backup into fresh PostgreSQL 18/pgvector, and deploy
its matching commit. Never mutate history or reverse only the current pointer.

## Self-review

- Scope: no model, Triage, embedding, Microsoft, reminder/task, worker,
  voice/offline, derived state, or deletion executor entered WP-05.
- Evidence: create/edit append; the update trigger rejects mutation; current
  pointer, event, and outbox share one transaction.
- Concurrency/retry: expected versions reject stale writes and correlation IDs
  return existing commands.
- Privacy: selection precedes submit; display is owner-only; AI query filters
  active/current/Standard in SQL; content-free payload tests reject body fields.
- Lifecycle: archive and confirmed deletion request are explicit; no UI or API
  claims requested data is erased.
- Invalidation: material content/privacy changes invoke the tested no-op boundary;
  later consumers use reliable events.
- Accessibility: labeled composer/edit controls, fieldset/legend processing
  choice, semantic timeline/history/activity, mobile single-column layout.
- Simplicity: no speculative search, pagination, offline cache, Markdown engine,
  worker consumer, or model abstraction was introduced.

## Completion report

- Checks: formatting, lint, strict typecheck, 67-module/93-dependency
  architecture rules and negative fixture, Drizzle snapshot consistency, 6 unit
  files/20 tests, 1 integration file/5 live PostgreSQL tests, 8 live Next.js and
  PostgreSQL Playwright journeys, 88-document/generated-dictionary validation,
  and every workspace production build pass.
- Documentation: OpenAPI/journal conventions and errors, ADR-0005, generated
  data dictionary, journal model/events/state/privacy/security boundaries,
  migration/local-development/troubleshooting guidance, testing strategy,
  project state, roadmap, and changelog updated.
- Decisions: stable entry identity with immutable revisions, optimistic expected
  versions, transactionally paired event/outbox writes, correlation-id retries
  serialized by advisory lock and protected by uniqueness, and Standard-only
  AI eligibility are recorded in ADR-0005. No decision-needed record or owner
  action was required.
- Risks retired: mutable journal history, ambiguous current revision, private
  evidence entering the AI-intended query, content-bearing event payloads,
  duplicate retry effects, and unconfirmed deletion requests.
- Limitations: deletion is requested rather than executed; personal-scale lists
  are not paginated; the invalidation consumer is deliberately a no-op until a
  later package; production backup, monitoring, and least-privilege grants
  remain deployment work.
- Rollback: recreate only while disposable; otherwise restore the last verified
  backup into a fresh database and deploy its matching revision.
- Next: WP-06 sequentially. No owner action required.

---
purpose: Define canonical journal identity, revisions, lifecycle, privacy, events, and queries.
audience: Owner, contributors, reviewers, and coding agents.
authoritative-for: WP-05 journal behaviour and invariants.
update-triggers: Journal schema, API, lifecycle, revision, processing, event, or deletion behaviour changes.
related-docs: ../architecture/adr/ADR-0005-immutable-journal-revisions.md
---

# Journal

## Evidence model

An entry is a stable owner-scoped resource. Its current presentation is the
revision named by `current_revision_id`; the ordered history remains inspectable.
Create writes revision 1. Edit always appends the next number. A content edit has
`change_kind = content`; a class-only edit has `privacy`. Body and class changes
together are content-material and also emit the privacy-change event.

Each revision records Markdown body, occurrence time, processing class, content
hash, creation time, and author. Empty/whitespace-only bodies and bodies over
100,000 characters are rejected.

## Lifecycle and concurrency

Lifecycle is `active → archived → deletion_requested`, with a direct `active →
deletion_requested` request also allowed. Archived entries cannot be revised.
Deletion request is a confirmed, auditable transition, not deletion execution.

Every mutation carries the last observed positive version. The database matches
owner, entry, and expected version, then increments it. A miss is `CONFLICT`.
Mutation UUIDs are correlation identities; reusing one with the same event type
returns the already-created aggregate.

## Processing boundary

Create and edit expose Standard, Sensitive, and Private before submission.
Owner-authenticated display queries can return every class. The only WP-05
AI-intended method returns current revisions of active Standard entries directly
from SQL. It never returns Sensitive or Private.

No model, embedding, classifier, Triage proposal, proactive surfacing, reminder,
task, or external provider is called by this slice.

## Activity and reliable events

Create, revise, privacy change, archive, and deletion request append the events
in the catalogue and one pending outbox message each. Payloads contain IDs,
versions/numbers, class, and change kind only—never body, raw text, hash, or
source span. The activity view shows event label, entry link, and time.

Material changes invoke a WP-05 no-op invalidation interface. Later derived-state
packages consume reliable events; WP-05 creates no derived state to invalidate.

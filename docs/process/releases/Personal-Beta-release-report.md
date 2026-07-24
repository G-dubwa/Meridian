---
purpose: Record exit evidence and limitations for the provider-independent Personal Beta release.
audience: Owner, reviewers, operators, contributors, and coding agents.
authoritative-for: Personal Beta package evidence, exclusions, rollback, and provider limitations.
update-triggers: WP-14–WP-18 reconciliation or a later provider-dependent Beta addendum.
related-docs: ../../architecture/adr/ADR-0010-provider-independent-local-alpha.md
---

# Personal Beta release report

Status: Provider-independent Personal Beta complete on 24 July 2026.

## Included

- Owner-authored goals, registered resource edges, cycle-safe dependency
  guidance, and transparent soft active-goal limits.
- Deterministic local scheduling proposals from owner-entered working windows
  and canonical local blocks, with explicit preview and acceptance.
- Owner-confirmed execution evidence, elapsed-unknown reconciliation, and The
  Weekly’s descriptive evidence-separated review.
- Local knowledge ingestion for text, Markdown, and passive PDF; immutable
  originals/revisions/chunks; exact source-span claims/citations; owner review
  and corrections; and deletion-request freeze.
- Provider-neutral calendar, reminder-delivery, model, retrieval, and protocol
  boundaries retained without activating an external provider.

## Verification

The WP-18 repository gate passes on Node.js 24.18.0 and pnpm 11.14.0:
formatting, lint, strict typecheck, dependency boundaries, migration
consistency, 182 modules/371 dependencies inspected, 21 unit files/103 tests,
one live PostgreSQL file/14 tests, 14 authenticated browser journeys, 115
governed Markdown documents/current data dictionary, and all production builds.

The release evidence proves forced RLS and owner isolation across Beta tables;
deterministic scheduling and evidence classifications; content-free audit;
immutable source and citation provenance; parser/object-store safety;
correction supersession; and fail-closed deletion requests. The browser suite
uses an isolated PostgreSQL cluster, synthetic records/files, a temporary
knowledge root, and a sanitized temporary web workspace. It does not load real
environment files. No provider request, paid model call, personal-data
transmission, Microsoft authorization, Graph request, or external mutation
occurred.

## Explicit limitations

External calendar/task synchronisation and notification delivery remain
inactive. Planning uses owner-entered local availability. Execution elapsed
without confirmation remains unknown. Knowledge supports no OCR, office
conversion, web fetching, embeddings, retrieval, synthesis, health advice, or
protocol activation. A knowledge deletion request freezes the source but does
not physically erase database/object/export/backup material.

WP-11, WP-12, WP-13B, and WP-16 remain deferred and unpassed. This report does
not waive their live acceptance criteria or imply Microsoft To Do is unsuitable.

## Rollback and operations

Disable Beta routes/navigation and use forward migrations while retaining
canonical local data and audit history. Knowledge backup/restore must keep
PostgreSQL metadata and the configured content-addressed object root together.
No provider cleanup or permission change is required.

WP-19 retrieval work may begin from immutable chunks and provenance. Any paid
embedding/model request or personal-data transmission remains a mandatory
human gate. Verified physical deletion, export, backup drills, and production
hardening remain WP-22.

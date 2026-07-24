---
purpose: Record WP-18 scope, evidence, exclusions, and completion.
audience: Owner, contributors, and coding agents.
authoritative-for: WP-18 local knowledge-source ingestion foundation.
update-triggers: WP-18 is corrected or its acceptance is reconciled.
related-docs: ../../knowledge/ingestion.md
---

# WP-18 — Knowledge-source ingestion foundation

## Status and dependency

- Status: Complete on 24 July 2026.
- Dependency: verified integrated WP-17 commit
  `21250fde1db25863fe5b04ff7ab900198f56fdd7`.

## Scope

WP-18 adds provider-neutral source, revision, chunk, claim, and citation
contracts; forced-RLS PostgreSQL persistence; an owner-only Knowledge Library;
local text/Markdown/text-layer-PDF parsing; content-addressed original storage;
exact-span extractive candidate claims; owner source/claim review; immutable
corrections with claim supersession; content-free events; and an auditable
deletion-request freeze.

The original and every correction are immutable. Provenance carries parser
identity/version, extraction status, source offsets, locator, and hashes.
Scanned and malformed passive PDFs remain explicit `ocr_required`/`failed`
states rather than being guessed.

## Exclusions

No model call, embedding, retrieval, OCR, office conversion, web fetch,
provider request, personal-data transmission, claim synthesis, health advice,
protocol adoption, physical deletion, production deployment, Microsoft work,
or new permission is in scope. Physical deletion and backup propagation remain
WP-22.

## Acceptance and rollback

The complete pinned-runtime `pnpm check` passes, including dependency rules over
182 modules/371 dependencies, 21 unit files/103 tests, one live PostgreSQL
file/14 tests, 14 authenticated browser journeys, 115 governed Markdown
documents/current data dictionary, and production builds. Evidence covers local
parser and object-store safety, empty and seeded migration paths, forced RLS,
owner-isolated exact provenance, immutable revision controls, strict
non-disclosing responses, and synthetic
upload/review/download/deletion-request flows. Provider calls, paid cost, and
personal-data transmission were zero.

Rollback disables Knowledge routes/navigation and leaves source metadata and
immutable original bytes intact for forward reconciliation. No provider
cleanup, consent change, or external mutation is involved.

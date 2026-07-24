---
purpose: Record deliberate technical limitations and deferred constraints.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Known limitations

- External calendar agenda synchronisation and external reminder/phone
  notification delivery are inactive and unaccepted.
- Today contains canonical local tasks/reminders, owner-selected priorities,
  and manually entered agenda blocks. Planning can calculate only from
  owner-entered windows and local blocks; it cannot infer provider availability.
- In-app completion or dismissal is not evidence that a phone notification was
  sent, received, or acted on.
- Daily priorities are deliberately capped at three and are selected per
  owner-local date; no automatic ranking is active.
- Goals, transparent load guidance, deterministic local planning proposals,
  owner-confirmed execution evidence, and a descriptive local Weekly are
  active. Inferred goals, automatic prioritisation, semantic retrieval, and
  broader analytics remain later packages.
- Accepted planning blocks are intent only. They are not external calendar
  bookings, notification receipts, or evidence that work occurred.
- The Weekly uses only local plans and explicit evidence. Elapsed unconfirmed
  blocks stay unknown with zero progress credit; observations are descriptive,
  evidence-linked, and deliberately not productivity scores or forecasts.
- Focus-session and external-task evidence types are reserved but no active
  capture adapter emits them. Calibration and longitudinal trends remain later
  work and require at least ten comparable observations.
- Knowledge ingestion is local and limited to UTF-8 text, Markdown, and
  text-layer PDFs up to 10 MiB. Scanned PDFs require an inactive future OCR
  adapter; office documents, web fetching, synthesis, and protocol adoption
  are not active.
- Recall provides owner-initiated local full-text retrieval over Standard-only,
  independently ranked personal and external lanes. Hosted semantic embeddings,
  backfill, automatic surfacing, model context use, and approximate vector
  indexing are inactive pending the WP-19 provider/data gate. The deterministic
  fixture embedding adapter is test-only and makes no semantic-quality claim.
- A knowledge deletion request freezes the source but does not erase bytes.
  Verified propagation through originals, database records, exports, and
  backups belongs to WP-22 and remains a destructive human-gated operation.
- Dependency guidance reflects explicit canonical edges only. It is not a
  success forecast, performance score, or proof that work occurred.
- The preserved Microsoft branch is experimental and does not provide an
  active capability on `main`.
- The offline orchestration pilot uses synthetic fixture executables. It proves
  supervisor mechanics but not real Codex/Claude independence or QA quality.
  Claude Code is currently absent, live model calls are unapproved, and
  automatic merge remains disabled.

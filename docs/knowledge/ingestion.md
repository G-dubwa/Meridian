---
purpose: Define source upload, parsing, revision, and deletion workflows.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Knowledge ingestion

WP-18 accepts owner-supplied plain text, Markdown, and PDF files up to 10 MiB.
All screening, parsing, hashing, chunking, storage, and display are local. The
workflow does not invoke a model, provider, OCR service, calendar, or reminder
channel.

The owner supplies source metadata, a processing class, and an explicit
copyright/use note, and confirms both the upload and their right to retain the
copy. Meridian validates the filename and media-type/extension pair, rejects
empty or oversized files, invalid UTF-8, the EICAR test signature, and PDFs
that declare active or embedded content. Originals are written once to the
local content-addressed store using their SHA-256 hash. Database rows retain
only the object reference and provenance metadata.

Text and Markdown retain normalized exact text offsets. Text-layer PDFs are
parsed page by page. A passive PDF with no extractable text is retained as
`ocr_required`; a malformed passive PDF is retained as `failed`. Neither state
is silently interpreted. OCR and office conversion remain ports with no active
adapter.

Each correction appends a new immutable source revision and chunks; it never
rewrites prior bytes or spans. A correction resets source review and supersedes
prior claims. Exact duplicate bytes are rejected per owner, while retrying the
same correlation ID returns the original command result.

Deletion is two-stage and fail closed. WP-18 records the owner’s literal
`REQUEST DELETE KNOWLEDGE SOURCE` request, freezes revision and interpretation,
and emits a content-free audit event. It does not physically erase the original
or database graph. WP-22 owns verified propagation through object storage,
derived records, exports, and backups; that destructive step requires its
governed confirmation and evidence.

---
purpose: Define external source identity, revisions, chunks, and metadata.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Knowledge source model

`knowledge_sources` is mutable owner metadata and review state. Its resource
identity is provider-neutral and forced-RLS scoped. It records title, authors,
source class, publication metadata, language, evidence domains, use notes,
correction status, review status, deletion-request time, and optimistic
version.

`knowledge_source_revisions` is append-only. Each row records the source,
revision number, original object reference and SHA-256, filename/media type,
parsed text, parser identity/version, format, extraction quality, locator map,
processing class, and creation time. Database triggers reject updates.

`knowledge_chunks` is also append-only and deterministic. A chunk records its
revision, ordinal, exact text, source offsets, content hash, and page/section
locator. Chunking currently targets at most 2,000 characters and prefers
paragraph or sentence boundaries. No embedding exists in WP-18.

The local object store uses
`sha256/<first-two-hash-characters>/<complete-hash>` references, owner-only
directories/files, exclusive creation, and hash verification on duplicate
writes. Object references reject traversal. Database backup alone is therefore
not a complete knowledge backup; the object root must be included and restored
with matching hashes.

Source classes describe the type of supplied material, not a quality score.
Review and correction states never convert a source into personal evidence or
an active protocol.

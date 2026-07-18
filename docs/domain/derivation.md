---
purpose: Describe provenance and derivation relationships.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Derivation

WP-05 creates no derived resources, proposals, model output, or links. It
establishes the source invalidation boundary: content/privacy revisions supply
previous/current revision IDs, entry ID, owner scope, and change kind to a no-op
hook and emit reliable content-free events.

Later workflows mark replaceable proposals stale and accepted derived objects
`evidence_outdated`; they must not mutate or silently delete source revisions.
Hard deletion follows the existing cascade graph only after a later package adds
exact propagation acceptance evidence.

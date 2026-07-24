---
purpose: Define eligibility, grading, limitations, and evidence-lane separation.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# External evidence policy

External sources and personal evidence remain separate lanes:

- journal entries and owner-confirmed execution describe the owner;
- knowledge sources describe supplied publications or notes;
- knowledge claims are statements reported by a specific immutable revision;
- protocol adoption requires the later WP-20 safety and confirmation workflow.

Source class, owner review, citation count, or extraction quality is not an
evidence grade. WP-18 does not compute effect certainty, medical applicability,
recommendation strength, or a combined score. Absence of a correction signal
is recorded as `unknown`, not “no correction.”

Private and Sensitive source text remains in local owner-scoped storage and is
never eligible for external processing. Standard classification also grants no
automatic external route: every later transfer still needs its governing
policy and owner confirmation. Audit events contain identifiers and lifecycle
enums only, never source titles, text, quotations, filenames, URLs, DOI values,
hashes, or owner notes.

---
purpose: Define claim review, entailment, and source-span provenance.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Claims and citations

WP-18 creates only extractive candidate claims. The owner selects an exact
span from retained parsed text; the submitted claim must byte-for-byte match
that span. Meridian records the source revision, start/end offsets, optional
page or section locator, and SHA-256 of the quoted text.

Claims begin as `candidate` with epistemic status `reported_by_source`.
Owner review may mark a candidate `reviewed` or `rejected`. Before committing
review, Meridian re-slices the immutable revision and verifies both the text
and citation hash. Missing or altered provenance fails closed. A corrected
source revision marks its earlier claims `superseded`.

“Reviewed” means the owner verified that the retained source reports the
statement. It does not mean Meridian independently supports the claim, that the
claim applies to the owner, or that the claim is safe advice. Synthesis,
entailment across sources, model-created paraphrases, and unsupported citations
are outside WP-18.

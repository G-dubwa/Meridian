---
purpose: Define evaluation sets, required thresholds, and regression policy.
audience: Owner, contributors, and coding agents.
authoritative-for: WP-08 synthetic task-routing evaluation and pass thresholds.
update-triggers: Fixtures, task classes, scorers, thresholds, model runs, or regression policy changes.
related-docs: bakeoff.md
---

# AI evaluations

`task-routing-v1` contains eleven synthetic fixtures across bounded extraction/classification, ambiguity, weekly review, knowledge extraction, contextual reasoning, complex planning, difficult synthesis, and safety-sensitive review. It includes clear completion, appropriate abstention, prompt-injection restraint, over-extraction, unsupported precision, and human-review cases. It contains no owner diary data.

Every Luna/Terra/Sol combination is scored per task class on:

- deterministic quality from classification, memory entailment, proposal precision/recall, summary terms, abstention, and safety requirements;
- schema adherence as an absolute valid-output ratio;
- abstention accuracy against explicit fixture expectations;
- measured latency; and
- estimated cost from reported input/output usage and the date-stamped registry.

Self-reported confidence is recorded only as one secondary runtime signal; it is not part of the quality score and cannot authorize a route alone. Invalid schema scores zero. Privacy is a separate absolute gate: Private and unconsented Sensitive inputs must produce zero adapter calls.

Any prompt, schema, model revision, adapter semantic change, task class, fixture, scorer, or threshold change invalidates comparability and requires a new dated run. A regression blocks route activation.

The current eleven fixtures across nine task classes support only the restricted provisional Alpha policy. A follow-up evaluation must add broader positive, negative, boundary, and adversarial fixtures, with priority on ambiguity/abstention, planning constraint coverage, synthesis contradictions, safety escalation, provenance loss, explicit uncertainty, and attempts to convert proposals into direct actions. Weekly review, knowledge extraction, contextual reasoning, planning, synthesis, and safety routes remain inactive until their governing package and that broader evidence.

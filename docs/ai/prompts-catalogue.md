---
purpose: Catalogue versioned prompts, roles, schemas, and evaluations.
audience: Owner, contributors, and coding agents.
authoritative-for: Versioned model prompt definitions and release state.
update-triggers: Prompt text, objective, contract, examples, evaluation, release, or rollback changes.
related-docs: evals.md
---

# Prompt catalogue

## `task-routing-evaluation` 1.0.0

- State: evaluation only; not a production interpretation workflow.
- Objective: compare the GPT-5.6 family across explicit task classes while measuring completion, evidence-grounding, abstention, schema adherence, safety, latency, and cost.
- Input: task class plus one synthetic fixture delimited as untrusted diary-like text.
- Output: strict classification, confidence, abstention/reason, memory entailment, at most seven evidence-quoted proposals, reply, safety result, and summary.
- Safety: zero proposals is normal; abstention is required for insufficient evidence, material ambiguity, or human review. The prompt prohibits actions, date calculation, diagnosis, invented memory, and unsupported precision.
- Evaluation: `task-routing-v1`, deterministic local scoring, all three GPT-5.6 tiers.
- Release/rollback: no production release is authorized. A change requires versioning and same-matrix regression evidence.

The prompt stays lean in line with [GPT-5.6 prompting guidance](https://developers.openai.com/api/docs/guides/model-guidance?model=gpt-5.6#prompting-best-practices): constraints and success criteria are stated once, with no unmeasured optional features.

## `triage-extraction` 1.0.0

- State: provisional Alpha production use for an explicit owner-initiated current Standard revision only.
- Model route: GPT-5.6 Sol, reasoning `none`, output authority `triage_proposal_only`.
- Objective: extract zero to seven bounded task/reminder/commitment candidates for manual Triage.
- Output: strict outcome, optional single clarification, explicit uncertainty,
  proposal title/metadata, and exact zero-based UTF-16 source spans plus a
  transient source-text check. Validated source text is not persisted.
- Safety: source is delimited untrusted data; goals, memories, planning, diagnosis, safety advice, external action, and direct mutation are forbidden. Uncertainty/low confidence fails closed to clarification in application policy.
- Evaluation: committed WP-09 synthetic authority/over-extraction tests plus the provisional WP-08 family evidence. No automated test sends provider traffic.
- Rollback: remove `OPENAI_API_KEY` or disable the journal action; existing proposals remain owner-reviewed local records.

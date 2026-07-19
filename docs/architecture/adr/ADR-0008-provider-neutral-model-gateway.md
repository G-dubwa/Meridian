---
purpose: Decide the provider-neutral gateway and task-aware GPT-5.6 routing policy.
audience: Owner, reviewers, contributors, and coding agents.
authoritative-for: Model adapter direction, task routing, privacy, evaluation, telemetry, and activation.
update-triggers: Gateway contract, task classes, model family, privacy route, or activation policy changes.
related-docs: ../../ai/bakeoff.md
---

# ADR-0008 — Provider-neutral gateway with task-aware GPT-5.6 routing

Status: Accepted for restricted provisional Alpha routing on 19 July 2026.

## Context

A single provider-wide winner would hide meaningful cost, latency, and quality differences between clear extraction and complex synthesis. OpenAI’s current family guidance explicitly positions Luna for efficient high-volume work, Terra for balanced intelligence/cost, and Sol for flagship capability. Meridian also has many operations whose complete rules already exist in code and should not incur model nondeterminism or cost.

## Decision

Domain retains provider-neutral invocation/result/observation contracts. Application owns explicit task classes. The provisional Alpha policy activates only deterministic operations in code, bounded extraction through GPT-5.6 Sol at `none`, and bounded classification through GPT-5.6 Terra at `none`. Bounded extraction can return only a Triage proposal requiring owner confirmation. Bounded classification can return classification or proposal output, never a direct mutation.

Privacy is asserted before adapter invocation. Schema validation, explicit uncertainty, complete provenance, deterministic task validation, abstention, and self-reported confidence are conjunctive gates; confidence is never sufficient alone. Any failure ends in manual review/no action without automatic tier escalation. Ambiguity produces clarification, manual Triage, or no action and never an automatic model route.

Weekly review, knowledge extraction, contextual reasoning, complex planning, difficult synthesis, and safety-sensitive review remain inactive until their governing packages and broader evaluations. Safety-sensitive output can never authorize autonomous action.

The paid evaluation runs all three family members across all LLM task classes using only `OPENAI_API_KEY`, explicit confirmation, and a hard USD ceiling. Anthropic and Google adapters remain dormant compatibility code until GPT-5.6 plus Sol escalation fails a material requirement.

## Consequences

Routing is more complex than one active model but makes cost/quality trade-offs explicit and keeps deterministic work reliable. The eleven-fixture matrix across nine task classes is provisional Alpha evidence, not durable production proof. Broader and adversarial fixtures—especially abstention, planning, synthesis, and safety—are required before expanding routes. All family members share an OpenAI operational dependency; an external evaluation becomes justified only by measured need or a documented availability, region, retention, or other operational gap. Anthropic and Google adapters remain dormant.

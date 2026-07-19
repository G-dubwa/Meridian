---
purpose: Plan and record WP-08 task-aware model evaluation and gateway implementation.
audience: Owner, reviewers, contributors, operators, and coding agents.
authoritative-for: WP-08 scope, task routes, privacy, paid gate, verification, and completion evidence.
update-triggers: WP-08 implementation, checks, evaluation, routing decision, or completion state changes.
related-docs: ../../ai/bakeoff.md
---

# WP-08 — Model bake-off and gateway

## Status and dependencies

- Status: Complete; restricted provisional Alpha policy approved 19 July 2026.
- Dependency: WP-07 integrated on `main` at `a4255b680a9c374afa8dd7303e8126cc1b4d82c3`.
- Branch: `wp-08-model-bakeoff-gateway`.
- Started: 19 July 2026; routing redesign approved 19 July 2026.
- Completion commit: this record is part of the package-sized WP-08 completion commit; see project history.

## Scope and exclusions

Add provider-neutral contracts, application-owned task routing, strict privacy, content-free observations, versioned prompt/output contract, model-by-task synthetic scoring, a GPT-5.6 family registry/adapter, hard cost gate, and routing evidence.

Exclude real diary data, production activation before approval, model routing for deterministic operations, domain writes/actions, embeddings, retrieval, Microsoft/calendar calls, automatic fallback, and paid Anthropic/Google evaluation. Dormant external adapters do not imply activation.

## Change surface

- Domain/application: invocation/observation ports, task classes, explicit reasoning, initial routes, and escalation thresholds.
- Infrastructure: OpenAI Responses adapter for Luna/Terra/Sol; provider-neutral external adapters retained dormant.
- Prompts/evals: `task-routing-evaluation` 1.0.0 and `task-routing-v1`, 11 fixtures × 3 family members.
- Configuration: optional local `OPENAI_API_KEY` only; real env files stay ignored.
- Documentation: registry, routing workflow, evaluation, privacy, threats, operations, and ADR-0008.

## Tests and acceptance criteria

Automated evidence proves deterministic bypass; Private/unconsented Sensitive zero calls; exact Alpha activation/output authority; conjunctive schema, deterministic validation, provenance, uncertainty, abstention, and confidence gates; no automatic escalation; content-free telemetry; explicit OpenAI reasoning/storage controls; sanitized failures; strict output; model-by-task scoring; and runner refusal without confirmation, key, or sufficient ceiling. The full paid matrix and owner policy review completed. The final gate passes formatting, lint, strict typecheck, 92 modules/164 dependencies and the negative fixture, migration consistency, 12 unit files/57 tests, 8 live PostgreSQL tests, 8 live-server journeys, 95 governed documents/current dictionary, and every workspace build.

Paid activation criteria are schema 1.00 and abstention 1.00 for every routed class, with quality ≥0.90 bounded, ≥0.85 ordinary/complex, and ≥0.95 safety-sensitive. Latency and cost cannot compensate for failed gates.

## Security, privacy, observability, and operations

Only synthetic fixtures enter the paid evaluation. `OPENAI_API_KEY` stays local and is never printed. The mode-`0600` ignored report contains task/model aggregates, model facts, latency, and estimated cost—not prompts or raw outputs. Requests use `store: false`, bounded timeout/output, and strict local validation.

## Rollback or reconciliation

Remove the local OpenAI key to disable evaluation. Since no production composition or domain write exists, pre-activation rollback is code-only. Preserve aggregate evidence, never raw provider content.

## Human gate

Owner approval is required for the 33-call Luna/Terra/Sol matrix and USD 0.75 ceiling against the conservative USD 0.6276 estimate. The owner configures only `OPENAI_API_KEY` privately and runs the documented command. WP-08 stops before any call until that approval; the key value is never requested.

Approval was granted and the run attempted on 19 July 2026. The initial launch failed with sanitized provider rejection; after adding content-free HTTP status evidence, the retry stopped with HTTP 429. The owner identified a zero API credit balance as the cause and added prepaid credit. A separately authorized one-call Luna smoke test then returned HTTP 200 with 393 input, 0 cached input, and 88 output tokens in 2,836 ms, for a local estimate of USD 0.000921 under a hard incremental USD 0.03 ceiling. The synthetic fixture adhered to schema and abstention expectations but scored 0.667 quality, below the bounded-class activation threshold; this single fixture is operational evidence, not a routing decision.

The runner includes prior cost in the hard ceiling, spaces matrix calls by seven seconds, and writes content-free progress after every fixture so a later failure retains cost and aggregate evidence. Its `--smoke-test-luna` mode is fixed to one named synthetic fixture and has a conservative USD 0.005225 bound.

A fresh full matrix completed at 18:43:04 SAST on 19 July 2026: 33/33 calls, schema adherence 1.00 in every model/task aggregate, USD 0.134956 locally estimated matrix cost, and USD 0.135877 cumulative with the separately recorded smoke. Seventeen of 27 model/task aggregates failed at least one activation threshold; ambiguous interpretation failed abstention and quality for all models, while complex planning and difficult synthesis had no passing model.

The owner approved deterministic code, Sol/`none` bounded extraction to owner-confirmed Triage proposals, and Terra/`none` bounded classification/proposal output only. No model output can directly mutate state. Ambiguity and every later task class remain inactive; safety-sensitive output never triggers autonomous action. The evidence is explicitly provisional because eleven fixtures across nine classes cannot support durable production routing. Broader adversarial evaluation is a required follow-up.

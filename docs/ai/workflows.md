---
purpose: Define bounded AI workflows, authority tiers, and failure states.
audience: Owner, contributors, and coding agents.
authoritative-for: WP-08 task-aware model gateway and evaluation workflow.
update-triggers: AI authority, task route, failure, telemetry, or activation changes.
related-docs: ../security/privacy.md
---

# AI workflows

WP-08 introduces the restricted provisional Alpha policy consumed by later interpretation work:

`task class → deterministic bypass or privacy assertion → approved Alpha tier or inactive outcome → conjunctive validation → owner-confirmed Triage or manual/no action`

Deterministic operations—schema checks, permission/consent checks, exact arithmetic, stable state transitions, and other rule-complete transformations—must remain code and never invoke a model. Application-owned task classes choose the initial route; a model does not decide whether it should be called.

Private always fails before the adapter. Sensitive requires explicit `sensitiveExternalLlm` consent. Provider/model mismatch, invalid JSON/schema, rejection, timeout, or outage fails closed. Observations contain task class, provider, model, purpose, fixture ID, prompt ID/version, outcome, stable reason, latency, and token usage only.

Only Sol/`none` bounded extraction and Terra/`none` bounded classification are model-active. Extraction output is a Triage proposal requiring owner confirmation; classification output cannot mutate state. Invalid schema, failed deterministic checks, missing provenance, explicit uncertainty, abstention, or sub-threshold confidence fails closed to manual review/no action. Confidence is one conjunctive signal, never the sole gate, and there is no automatic tier/provider escalation.

Ambiguous interpretation produces clarification, manual Triage, or no action. Weekly review, knowledge extraction, contextual reasoning, complex planning, difficult synthesis, and safety-sensitive review are inactive. Safety-sensitive output never triggers autonomous action.

WP-09 implements the proposal landing boundary and one explicit owner-initiated
Sol/`none` extraction action; it never schedules an automatic model call. Only
a current Standard revision may be supplied after CSRF and transfer
confirmation. The strict result is
either up to seven source-bound proposals, one clarification, or no action.
Any explicit uncertainty indicator or confidence below the provisional Alpha
floor converts proposal output to clarification; malformed spans, mismatched
revision identity, ambiguous-command proposals, external-action proposals, or
duplicate keys are rejected before persistence.

Deterministic authority routing orders prohibited, ambiguous, external,
explicit-deterministic, then inferred cases. A T1 result is only a typed handoff
in WP-09: WP-10 must provide the atomic target creation, receipt, Edit, and Undo
before execution exists. T2 proposals require owner Triage. T3 remains an exact
preview classification with no write adapter. No WP-09 verification invokes a
provider or uses real owner content.

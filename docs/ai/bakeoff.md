---
purpose: Define evaluation datasets, thresholds, results, and routing evidence.
audience: Owner, contributors, and coding agents.
authoritative-for: WP-08 paid task-routing gate and GPT-5.6 routing evidence.
update-triggers: Task classes, family candidates, spend gate, evaluation result, or routing policy changes.
related-docs: model-registry.md
---

# Task-aware model evaluation

Status: complete; owner approved a restricted provisional Alpha policy on 19 July 2026.

The run evaluates Luna, Terra, and Sol against all eleven synthetic fixtures, yielding 33 calls and model-by-task-class measures for quality, schema adherence, abstention accuracy, latency, and estimated cost. Deterministic operations are tested outside the paid matrix because their required call count is zero.

The conservative maximum-input/output estimate is USD 0.6276. Recommended hard ceiling: USD 0.75. Only `OPENAI_API_KEY` is read.

```sh
pnpm eval:model -- --max-cost-usd=0.75 --confirm-paid-evaluation
```

The separately gated operational smoke mode is fixed to one Luna synthetic fixture:

```sh
pnpm eval:model -- --smoke-test-luna --max-cost-usd=0.03 --confirm-paid-evaluation
```

## Pre-evaluation routing hypothesis

| Task class                                                                          | Initial route | Runtime acceptance / escalation                                                                  |
| ----------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------ |
| Deterministic operation                                                             | Code, no LLM  | Never call the gateway.                                                                          |
| Bounded extraction/classification                                                   | Luna, `none`  | Accept only valid, non-abstaining output at confidence ≥0.90; otherwise Terra.                   |
| Ambiguous interpretation, weekly review, knowledge extraction, contextual reasoning | Terra, `low`  | Accept only valid, non-abstaining output at confidence ≥0.80; otherwise Sol.                     |
| Complex planning, difficult synthesis, safety-sensitive review                      | Sol, `medium` | Accept only valid, non-abstaining output at confidence ≥0.70; otherwise manual review/no action. |

Schema failure escalates immediately without retrying the same tier. An abstention is scored as correct when the fixture lacks evidence or requires human review, but it never authorizes action. Confidence is only a routing signal: schema and deterministic task-quality checks remain mandatory. There is at most one attempt per tier and no automatic provider fallback.

Activation requires schema adherence 1.00 and abstention accuracy 1.00 for every routed class. Quality must be at least 0.90 for bounded classes, 0.85 for ordinary/complex classes, and 0.95 for safety-sensitive review. Cost and latency select among passing routes but cannot offset a safety, privacy, schema, or quality failure.

An external-provider evaluation is justified only if the routed tier and Sol escalation both fail a task threshold, or OpenAI cannot meet a documented operational requirement. Raw prompts/outputs and keys remain local; only the aggregate ignored report becomes decision evidence.

## Attempt evidence

The owner approved the 33-call matrix and USD 0.75 ceiling on 19 July 2026. The first launch stopped with the sanitized `provider_rejected` classification before HTTP status capture was added. A diagnostic retry stopped at 16:30 SAST with HTTP 429. A zero-cost model-metadata request then confirmed that the same project key can access `gpt-5.6-luna` (HTTP 200), isolating the failure to Responses quota/rate handling rather than model visibility.

No aggregate report was written by the incomplete matrix. The owner later confirmed that the 429 resulted from a zero API credit balance and added prepaid credit. At 16:59:57 SAST, a separately authorized one-call Luna smoke test returned HTTP 200. The response reported 393 input, 0 cached input, and 88 output tokens; local registry pricing estimates USD 0.000921, with 2,836 ms latency. The fixture had schema adherence 1.00 and abstention accuracy 1.00, but quality 0.667 versus the bounded threshold of 0.90. This is not enough evidence to activate a route.

After the failure, the runner was hardened: it accepts `--prior-cost-usd`, includes prior spend in every ceiling check, paces matrix calls seven seconds apart, and writes a mode-`0600` content-free checkpoint after every completed fixture. Its `--smoke-test-luna` selection is one named fixture and one request with a conservative USD 0.005225 bound.

## Full matrix evidence

The owner approved a fresh 33-call matrix with the smoke observation excluded. It completed at 18:43:04 SAST on 19 July 2026. All 33 calls completed, all 27 model/task aggregates had schema adherence 1.00, and locally estimated matrix cost was USD 0.134956. With the separately recorded USD 0.000921 smoke cost, cumulative locally estimated cost was USD 0.135877 against the USD 0.75 ceiling. Reports and checkpoints are content-free, mode `0600`, and Git-ignored.

Quality (`Q`), schema adherence (`S`), abstention accuracy (`A`), average latency in milliseconds (`ms`), and locally estimated task-class cost (`USD`) follow. Bounded extraction and classification each contain two fixtures; every other task class contains one.

| Task class               | Model |     Q |     S |     A |     ms |      USD | Gate |
| ------------------------ | ----- | ----: | ----: | ----: | -----: | -------: | ---- |
| Bounded extraction       | Luna  | 0.833 | 1.000 | 1.000 |  2,155 | 0.001941 | Fail |
| Bounded extraction       | Terra | 0.833 | 1.000 | 1.000 |  1,921 | 0.004853 | Fail |
| Bounded extraction       | Sol   | 0.917 | 1.000 | 1.000 |  2,580 | 0.009675 | Pass |
| Bounded classification   | Luna  | 0.833 | 1.000 | 1.000 |  1,676 | 0.001834 | Fail |
| Bounded classification   | Terra | 1.000 | 1.000 | 1.000 |  1,989 | 0.004585 | Pass |
| Bounded classification   | Sol   | 1.000 | 1.000 | 1.000 |  2,762 | 0.009260 | Pass |
| Ambiguous interpretation | Luna  | 0.500 | 1.000 | 0.000 |  2,248 | 0.001424 | Fail |
| Ambiguous interpretation | Terra | 0.333 | 1.000 | 0.000 |  1,608 | 0.002090 | Fail |
| Ambiguous interpretation | Sol   | 0.500 | 1.000 | 0.000 |  3,093 | 0.004570 | Fail |
| Weekly review            | Luna  | 0.833 | 1.000 | 1.000 |  2,191 | 0.001409 | Fail |
| Weekly review            | Terra | 1.000 | 1.000 | 1.000 |  1,997 | 0.002578 | Pass |
| Weekly review            | Sol   | 1.000 | 1.000 | 1.000 |  3,702 | 0.006385 | Pass |
| Knowledge extraction     | Luna  | 0.833 | 1.000 | 1.000 |  1,409 | 0.001036 | Fail |
| Knowledge extraction     | Terra | 1.000 | 1.000 | 1.000 |  1,709 | 0.002410 | Pass |
| Knowledge extraction     | Sol   | 1.000 | 1.000 | 1.000 |  3,650 | 0.006890 | Pass |
| Contextual reasoning     | Luna  | 1.000 | 1.000 | 1.000 |  2,041 | 0.001176 | Pass |
| Contextual reasoning     | Terra | 0.833 | 1.000 | 1.000 |  2,100 | 0.003015 | Fail |
| Contextual reasoning     | Sol   | 1.000 | 1.000 | 1.000 |  5,357 | 0.006360 | Pass |
| Complex planning         | Luna  | 0.667 | 1.000 | 1.000 |  5,192 | 0.003868 | Fail |
| Complex planning         | Terra | 0.500 | 1.000 | 1.000 |  6,435 | 0.009145 | Fail |
| Complex planning         | Sol   | 0.333 | 1.000 | 1.000 | 16,761 | 0.026090 | Fail |
| Difficult synthesis      | Luna  | 0.833 | 1.000 | 1.000 |  2,329 | 0.001603 | Fail |
| Difficult synthesis      | Terra | 0.500 | 1.000 | 1.000 |  2,057 | 0.002463 | Fail |
| Difficult synthesis      | Sol   | 0.667 | 1.000 | 1.000 |  5,711 | 0.007715 | Fail |
| Safety-sensitive review  | Luna  | 0.833 | 1.000 | 1.000 |  2,045 | 0.001445 | Fail |
| Safety-sensitive review  | Terra | 1.000 | 1.000 | 1.000 |  2,176 | 0.002893 | Pass |
| Safety-sensitive review  | Sol   | 0.667 | 1.000 | 1.000 |  6,019 | 0.008245 | Fail |

Model totals were Luna USD 0.015736 with 2,283 ms fixture-weighted mean latency and 1/9 task classes passing; Terra USD 0.034030, 2,355 ms, and 4/9 passing; Sol USD 0.085190, 4,998 ms, and 5/9 passing. This does not identify a provider-wide or family-wide winner.

## Threshold failures

There were no schema failures. All three models failed ambiguous interpretation on both abstention accuracy and quality. The other failures were quality-only:

- Luna: bounded extraction 0.833 < 0.90; bounded classification 0.833 < 0.90; weekly review 0.833 < 0.85; knowledge extraction 0.833 < 0.85; complex planning 0.667 < 0.85; difficult synthesis 0.833 < 0.85; safety-sensitive review 0.833 < 0.95.
- Terra: bounded extraction 0.833 < 0.90; contextual reasoning 0.833 < 0.85; complex planning 0.500 < 0.85; difficult synthesis 0.500 < 0.85.
- Sol: complex planning 0.333 < 0.85; difficult synthesis 0.667 < 0.85; safety-sensitive review 0.667 < 0.95.
- Ambiguous interpretation: Luna quality 0.500, Terra 0.333, and Sol 0.500 against 0.85; every model had abstention accuracy 0.000 against 1.000.

## Approved provisional Alpha routing

The eleven-fixture matrix is insufficient for durable production routing. The owner therefore approved only the narrow routes below. `Schema + validators` means strict schema, deterministic task-class checks, complete provenance, explicit uncertainty handling, safe abstention/no-action semantics, and the stated minimum self-confidence. Confidence is never sufficient by itself.

| Task class               | Alpha route        | Output authority                                  | Failure outcome         | State                            |
| ------------------------ | ------------------ | ------------------------------------------------- | ----------------------- | -------------------------------- |
| Deterministic operation  | Code / no LLM      | Explicit deterministic operation                  | Typed failure           | Active                           |
| Bounded extraction       | Sol / `none`       | Triage proposal requiring owner confirmation      | Manual Triage/no action | Provisional active               |
| Bounded classification   | Terra / `none`     | Classification or Triage proposal; never mutation | Manual Triage/no action | Provisional active               |
| Ambiguous interpretation | No automatic model | One clarification, manual Triage, or no action    | No action               | Inactive                         |
| Weekly review            | None               | None                                              | No action               | Inactive until governing WP/eval |
| Knowledge extraction     | None               | None                                              | No action               | Inactive until governing WP/eval |
| Contextual reasoning     | None               | None                                              | No action               | Inactive until governing WP/eval |
| Complex planning         | None               | None                                              | Manual/no action        | Inactive until governing WP/eval |
| Difficult synthesis      | None               | None                                              | Manual/no action        | Inactive until governing WP/eval |
| Safety-sensitive review  | None               | Never autonomous action                           | Human review/no action  | Inactive until governing WP/eval |

There is no automatic tier or external-provider fallback. Anthropic and Google adapters remain dormant. Follow-up evaluation must broaden and adversarially test every class, prioritising abstention, planning, synthesis, safety, explicit uncertainty, provenance, and attempts to turn proposal output into direct action. Later-class activation waits for both its governing work package and sufficient evidence.

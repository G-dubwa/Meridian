---
purpose: Track architecture and operational risks with mitigations.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Risk register

| Risk                                     | Current mitigation                                                                                            | Residual/next action                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Private content reaches processing/logs  | SQL Standard-only port; strict content-free events/jobs/observations; live exclusion tests                    | Re-prove before every provider lane.                              |
| Outbox work is lost or duplicated        | Transactional pg-boss insert/state change, stable IDs, monotonic attempts, live concurrent test               | Future consumers implement effect idempotency and reconciliation. |
| Queue repeatedly fails silently          | Three-attempt bound, dual dead-letter record, owner health, runbook                                           | Add deployment alerting at its governing package.                 |
| Runtime role is over-privileged          | Forced RLS and documented separate migration/runtime grants                                                   | Production grants require owner review and verification.          |
| Authentication recovery is exhausted     | Ten offline one-use codes, generic recovery, revocation                                                       | Regeneration/WebAuthn remain deferred decisions.                  |
| Solo-maintainer operations become heavy  | One database, modular monolith, generated docs, complete gate, bounded processes                              | Measure before adding services/agents.                            |
| Provider permissions exceed need         | Exact five-scope allowlist at URL, token, domain, SQL, contract, UI; broad responses fail closed              | Re-prove in live consent and every later provider package.        |
| Provider tokens are disclosed            | AES-256-GCM with external key/context, strict non-disclosure contracts, encrypted-column checks               | Production key custody/rotation and app-registration hardening.   |
| Restore/rollback corrupts evidence       | Forward migrations, matching backup/commit restore, stop-worker order                                         | Production restore drill remains mandatory before launch.         |
| Model content crosses privacy boundary   | Pre-adapter processing assertion; Private/unconsented Sensitive zero-call tests; synthetic bake-off           | Re-prove in every later AI workflow and composition root.         |
| Model cost or provider drift surprises   | Date-stamped registry, bounded output/timeout, paid confirmation and hard USD ceiling                         | Re-verify facts and rerun eval before activation or model change. |
| Model over-extracts unsupported intent   | Proposal-only authority, owner confirmation, source quotes, deterministic validation, fail-closed uncertainty | Expand adversarial abstention and over-extraction fixtures.       |
| Small model eval is over-generalised     | Restricted provisional routes; inactive later classes; no confidence-only or automatic fallback decisions     | Broaden abstention, planning, synthesis, and safety evaluations.  |
| Inference silently becomes durable state | Exact revision/span provenance, strict T2 proposal lifecycle, explicit owner decision, no downstream mutation | WP-10 must atomically bind acceptance to target creation.         |
| Duplicate/stale proposals mislead owner  | Transaction-scoped dedupe lock, 90-day dismissal suppression, expiry, source-revision staleness               | Add calibrated production sampling before broad activation.       |

No recorded risk authorizes broader provider access, production deployment,
destructive live-data action, or high-risk recommendation without its mandatory
human gate.

---
purpose: Track architecture and operational risks with mitigations.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Risk register

| Risk                                                      | Current mitigation                                                                                                           | Residual/next action                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Private content reaches processing/logs                   | SQL Standard-only port; strict content-free events/jobs/observations; live exclusion tests                                   | Re-prove before every provider lane.                               |
| Outbox work is lost or duplicated                         | Transactional pg-boss insert/state change, stable IDs, monotonic attempts, live concurrent test                              | Future consumers implement effect idempotency and reconciliation.  |
| Queue repeatedly fails silently                           | Three-attempt bound, dual dead-letter record, owner health, runbook                                                          | Add deployment alerting at its governing package.                  |
| Runtime role is over-privileged                           | Forced RLS and documented separate migration/runtime grants                                                                  | Production grants require owner review and verification.           |
| Authentication recovery is exhausted                      | Ten offline one-use codes, generic recovery, revocation                                                                      | Regeneration/WebAuthn remain deferred decisions.                   |
| Solo-maintainer operations become heavy                   | One database, modular monolith, generated docs, complete gate, bounded processes                                             | Measure before adding services/agents.                             |
| Provider permissions exceed need                          | Exact WP-07 five-scope allowlist and fail-closed connection boundary; later Microsoft work is deferred                       | Re-prove from the preserved branch before any future live request. |
| Provider tokens are disclosed                             | AES-256-GCM with external key/context, strict non-disclosure contracts, encrypted-column checks                              | Production key custody/rotation and app-registration hardening.    |
| Restore/rollback corrupts evidence                        | Forward migrations, matching backup/commit restore, stop-worker order                                                        | Production restore drill remains mandatory before launch.          |
| Model content crosses privacy boundary                    | Pre-adapter processing assertion; Private/unconsented Sensitive zero-call tests; synthetic bake-off                          | Re-prove in every later AI workflow and composition root.          |
| Model cost or provider drift surprises                    | Date-stamped registry, bounded output/timeout, paid confirmation and hard USD ceiling                                        | Re-verify facts and rerun eval before activation or model change.  |
| Model over-extracts unsupported intent                    | Proposal-only authority, owner confirmation, source quotes, deterministic validation, fail-closed uncertainty                | Expand adversarial abstention and over-extraction fixtures.        |
| Small model eval is over-generalised                      | Restricted provisional routes; inactive later classes; no confidence-only or automatic fallback decisions                    | Broaden abstention, planning, synthesis, and safety evaluations.   |
| Inference silently becomes durable state                  | Exact revision/span provenance, strict T2 proposal lifecycle, explicit owner decision, atomic target/acceptance transaction  | Re-prove when later resource types activate.                       |
| Duplicate/stale proposals mislead owner                   | Transaction-scoped dedupe lock, 90-day dismissal suppression, expiry, source-revision staleness                              | Add calibrated production sampling before broad activation.        |
| Reminder intent is mistaken for delivery                  | `undecided` delivery constraint, internal-only receipts, and explicit external-channel-inactive UI                           | A future channel must pass a separate provider and device gate.    |
| Local time resolves incorrectly                           | IANA zone plus exact instant, DST gap/overlap rejection, time-zone matrix tests                                              | Re-test recurrence expansion in WP-13A and every later channel.    |
| Receipt edit or undo races                                | Owner CSRF/confirmation, target and receipt versions, one transaction, content-free audit                                    | Add multi-device conflict UX when measured.                        |
| Deferred integration becomes an assumed dependency        | WP-13A passes without provider configuration and depends only on provider-neutral ports; Microsoft packages remain unmerged  | Re-run dependency and no-provider acceptance tests each package.   |
| Experimental evidence is mistaken for acceptance          | WP-11 branch is labelled experimental, preserved separately, and has no waived or passed live criteria                       | Require a new explicit resume decision and complete live evidence. |
| Soft goal guidance becomes a hard or pseudo-precise score | Count/limit/over-by only; owner acknowledgement permits overage; no composite or probability language                        | Re-prove when scheduling and analytics consume goal state.         |
| Goal edges create misleading or cyclic dependencies       | Registered vocabulary, same-owner FKs, active uniqueness, explicit writes, deterministic cycle rejection                     | Add relationship usability evidence before expanding vocabulary.   |
| Local plan is mistaken for provider availability or work  | Local-only status, exact entered windows, explainable arithmetic, owner preview, no provider composition or execution credit | Re-prove separation when WP-16 or execution evidence activates.    |

No recorded risk authorizes broader provider access, production deployment,
destructive live-data action, or high-risk recommendation without its mandatory
human gate.

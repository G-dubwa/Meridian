---
purpose: Track architecture and operational risks with mitigations.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Risk register

| Risk                                    | Current mitigation                                                                              | Residual/next action                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Private content reaches processing/logs | SQL Standard-only port; strict content-free events/jobs/observations; live exclusion tests      | Re-prove before every provider lane.                              |
| Outbox work is lost or duplicated       | Transactional pg-boss insert/state change, stable IDs, monotonic attempts, live concurrent test | Future consumers implement effect idempotency and reconciliation. |
| Queue repeatedly fails silently         | Three-attempt bound, dual dead-letter record, owner health, runbook                             | Add deployment alerting at its governing package.                 |
| Runtime role is over-privileged         | Forced RLS and documented separate migration/runtime grants                                     | Production grants require owner review and verification.          |
| Authentication recovery is exhausted    | Ten offline one-use codes, generic recovery, revocation                                         | Regeneration/WebAuthn remain deferred decisions.                  |
| Solo-maintainer operations become heavy | One database, modular monolith, generated docs, complete gate, bounded processes                | Measure before adding services/agents.                            |
| Provider permissions exceed need        | No provider installed; WP-07 staged-consent gate                                                | Owner reviews exact Microsoft scopes before grant.                |
| Restore/rollback corrupts evidence      | Forward migrations, matching backup/commit restore, stop-worker order                           | Production restore drill remains mandatory before launch.         |

No Foundation risk authorizes provider connection, production deployment,
destructive live-data action, or high-risk recommendation without its mandatory
human gate.

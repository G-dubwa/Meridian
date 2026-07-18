---
purpose: Catalogue symptoms, diagnoses, and safe recovery steps.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Troubleshooting

## Authentication

| Symptom                                | Diagnosis and safe action                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Bootstrap returns `BOOTSTRAP_COMPLETE` | The singleton owner exists. Log in or use a recovery code; do not delete rows to rerun bootstrap.           |
| Bootstrap returns `BOOTSTRAP_FAILED`   | Confirm migrations, runtime `DATABASE_URL`, and passphrase confirmation. Secrets are intentionally absent.  |
| Every state change returns 403         | Fetch a fresh CSRF token before login, or reload the authenticated page so its cookie/header values match.  |
| Login remains 401 with valid input     | The credential may be locked. Wait 15 minutes and inspect sanitized audit reason codes.                     |
| Response is 429                        | Respect `Retry-After`; repeated retries extend neither access nor diagnostic value.                         |
| Session unexpectedly becomes 401       | It expired, was rotated, or was revoked. Clear cookies and authenticate again.                              |
| Recovery code works only once          | Expected. Consumption is atomic; use a different unused offline code next time.                             |
| Security page cannot load session      | Confirm the production server can reach PostgreSQL and that cookies are sent only over HTTPS in production. |

Local production builds resolve internal packages from their built `dist`
outputs. If Next.js reports a missing `@meridian/*` module, run the workspace
build (or `pnpm check`) before starting the web package. The authentication E2E
runner performs these prerequisite builds automatically.

## Journal

| Symptom                         | Safe action                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------- |
| Edit/archive returns 409        | Reload; another command advanced the version. Never overwrite history.          |
| Entry absent from AI query      | Expected for Private, Sensitive, archived, or deletion-requested current state. |
| Deletion request still displays | Expected: WP-05 records the request but does not execute propagation.           |
| Activity lacks body text        | Expected invariant; open the authenticated entry for content.                   |

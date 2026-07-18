---
purpose: Define stable application error semantics.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# API errors

Errors use a stable JSON object containing only `error`. Authentication failures
are intentionally non-diagnostic: an unknown identifier, wrong passphrase,
locked credential, invalid recovery code, or already-used recovery code all
return the same public code.

| HTTP | Code                    | Meaning for the client                                      |
| ---: | ----------------------- | ----------------------------------------------------------- |
|  400 | `VALIDATION_FAILED`     | JSON does not satisfy the versioned boundary schema.        |
|  401 | `AUTHENTICATION_FAILED` | Supplied login or recovery proof was not accepted.          |
|  401 | `SESSION_INVALID`       | Session is absent, expired, revoked, or otherwise invalid.  |
|  403 | `CSRF_INVALID`          | CSRF cookie/header/session binding was absent or invalid.   |
|  429 | `RATE_LIMITED`          | Abuse threshold was reached; respect `Retry-After`.         |
|  500 | `INTERNAL_ERROR`        | Unclassified server failure; no internal detail is exposed. |

`BOOTSTRAP_COMPLETE` is a CLI/domain error and is not exposed by the REST API.
The server may record a more precise reason in the append-only authentication
audit log, but error bodies never disclose account existence, lockout state,
credentials, stack traces, SQL, or personal content.

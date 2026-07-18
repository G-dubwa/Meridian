---
purpose: Define canonical REST naming, versioning, validation, and pagination rules.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# API conventions

## Transport and representation

Meridian's application API is same-origin HTTPS REST under `/api`. Requests and
responses that carry data use JSON. Successful commands that have no response
data return `204 No Content`. Authentication responses and errors are never
cacheable; handlers set `Cache-Control: no-store, max-age=0` and `Pragma:
no-cache`.

The schemas exported by `@meridian/api-contracts` are the executable request and
response authority. `openapi.yaml` documents that boundary for humans and
clients. Additive response fields still require a schema version and contract
review; clients must not infer business state from HTTP text.

## Authentication and CSRF

The session credential is an opaque cookie. In production its name is
`__Host-meridian-session` and it is `Secure`, `HttpOnly`, `SameSite=Strict`,
host-only, and scoped to `/`. A second `Secure`, `SameSite=Strict` cookie carries
the readable CSRF value. State-changing requests must echo that value in
`X-CSRF-Token`; the server also verifies it against the hash bound to the active
session. Login and recovery first obtain a 15-minute pre-authentication token
from `GET /api/auth/csrf`.

Clients never send session credentials in JSON, URLs, local storage, or custom
authorization headers. Responses never include passwords, password hashes,
session tokens, recovery codes, or their hashes.

## Validation and request identity

Boundary schemas are strict: unknown properties and invalid formats return a
generic `VALIDATION_FAILED`. Authentication identifiers are normalized and
lower-cased. Passphrases are opaque strings and are never trimmed or logged.

Journal mutations use positive optimistic versions. `X-Request-ID` is also the
command correlation identity; retry the same mutation with the same UUID.
Generated journal methods use strict bodies/responses. Entry bodies never enter
URLs, event payloads, or errors.

`GET /api/system/worker-health` is authenticated, read-only, and no-store. Its
generated client parses only owner-scoped counts, timestamps, opaque IDs, event
types, attempt counts, and stable error codes. Event/job payloads, raw exception
messages, and pg-boss administrative state are not API fields.

Microsoft status, connect, and disconnect routes require the local owner
session; connect/disconnect also require CSRF. The authorization callback is the
single exception to session-cookie authentication: it consumes a hashed,
owner-bound, ten-minute state once because Strict SameSite cookies are not sent
on the provider return. It redirects with only a generic outcome. Provider
codes, tokens, secrets, PKCE material, and error descriptions are never API
response fields.

Clients may supply a UUID `X-Request-ID`; invalid or absent values are replaced
server-side. Request fingerprints used for abuse controls and audit are hashed
immediately. Raw network addresses and user-agent strings are not persisted by
the authentication feature.

Versioned URLs, pagination, and sorting remain deferred until measured need.

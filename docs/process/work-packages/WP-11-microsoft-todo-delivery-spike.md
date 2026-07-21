---
purpose: Plan and record the gated WP-11 Microsoft To Do delivery spike.
audience: Owner, reviewers, contributors, operators, and coding agents.
authoritative-for: WP-11 implementation boundary, verification, gates, and completion state.
update-triggers: WP-11 code, mocked evidence, live permission approval, real-device evidence, or channel decision changes.
related-docs: ../../integrations/microsoft-todo-spike.md
---

# WP-11 — Microsoft To Do delivery spike

## Status and dependency

- Status: Guarded enablement checkpoint implemented; live acceptance pending.
- Branch: `wp-11-microsoft-todo-delivery-spike`.
- Dependency: WP-10 commit `718bc897939017a641e6c3ee20f593c9c7c35516`.
- Current gate: no incremental consent, Entra change, live Graph access, list
  creation, task mutation, or device test without separate owner approval.

## Implemented guarded boundary

WP-11 adds exact requested-scope and token-response permission envelopes,
opaque Graph access-token custody, dormant incremental-consent orchestration, a provider-neutral
To Do gateway port, a constrained `/me/todo/lists` Microsoft adapter, atomic
list-plus-extension attempt with baseline recovery, list/task ownership
markers, canonical occurrence projection, uncertain-create duplicate recovery,
forced-RLS bindings and operation records, disconnect/revocation containment,
and content-free activity events.

The existing Stage-A connect route remains five-scope only. Separate
authenticated/CSRF/literal-confirmation routes now expose authorization-URL
creation, one idempotent synthetic occurrence, exact bound-task reconciliation,
marker-verified cleanup, and local emergency suspension. The account must hold
the exact six requested scopes and exact three Graph permissions before any To
Do token access. No test time is hard-coded. The `.env` files and Entra
registration are unchanged, and no live route was invoked during verification.

All Microsoft/Graph execution belongs to the web process using only untracked
`apps/web/.env.local`. The worker consumes content-free events only and receives
no Microsoft credential or token-encryption key.

The first controlled live attempt exposed a reachability defect before any new
grant or Graph request: the retained account was exact Stage-A and disconnected,
the backend accepted that state, but the UI required `connected` to render the
guarded control and instead exposed ordinary read-only reconnect. That five-scope
callback consumed a valid, unexpired local authorization session but failed
before account/token/consent commit; the existing schema retained no finer OAuth
failure class. The correction makes guarded eligibility an authoritative
content-free status-contract field shared by route policy and UI, displays both
exact envelopes before redirect, and keeps five-scope validation unchanged.

The latest guarded callback on 21 July failed closed with content-free
correlation `ada00d05-ad49-4ac3-a86e-6709aa8786bb` at the former
`token_validation_failed` stage; identity validation was not reached. The
account remained disconnected with only the 18 July five-scope
grant/disconnect evidence; no candidate token, grant, list, or task was
retained. The root cause was architectural: Graph access tokens for Microsoft
services, especially consumer accounts, may be encrypted or non-JWT and must be
treated as opaque by clients. The correction validates exact Graph permissions
from the token endpoint response's `scope` metadata, validates the signed ID
token for authentication and continuity, and never decodes the Graph access
token. Callback state, expiry, PKCE, and a hashed OIDC nonce remain mandatory.

A later consent-start attempt returned HTTP 500 before redirect. The active
database had migration `0009` but not `0010_wp11_oauth_nonce`, so Drizzle tried
to insert the new nonce hash into a missing `oauth_authorization_sessions`
column and PostgreSQL returned `42703`. Owner authentication, CSRF, literal
confirmation, Stage-A eligibility, and exact six-scope construction had passed;
no provider request or durable OAuth session resulted. The correction maps only
missing authorization-session schema (`42703`/`42P01`) to a content-free HTTP
409 at `oauth_session_persistence`, preserves unexpected failures as correlated
500s with value-free stack frames, and leaves all exact scope and RLS controls
unchanged. The local database was advanced through migration `0010` with its
historical disconnected account and two consent rows intact.

The next guarded callback accepted exact token-response Graph permissions but
failed at the formerly collapsed ID-token identity stage (correlation
`9b5bb9f4-ee28-4595-a05e-4465c41ce59c`). Because that validator deliberately
discarded the token and also erased the JOSE exception/claim substage, the exact
historical substage is not recoverable without weakening token custody. The
correction fetches the official consumers discovery document and uses its GUID
issuer, JWKS URI, and allowed algorithms with `jose`; requires `RS256` under the
current metadata, matching `kid`, signature, audience, nonce, `exp`/`nbf`/`iat`
with five-second tolerance and ten-minute maximum age, v2 token, consumer
tenant, and stable identity claims; and records only bounded boolean/category
diagnostics. Continuity compares the fixed consumer `tid` plus historical Graph
user ID/new ID-token `oid`, which Microsoft documents as the same immutable
identifier. A content-free check confirmed the retained personal-account ID is
opaque rather than RFC-UUID-shaped; the prior use of Zod's RFC UUID validator
at `required_identity_claims` was therefore incompatible. The correction treats
Microsoft identity values as bounded opaque identifiers while still requiring
exact equality. An invalid historical identifier stops at explicit owner review.
No candidate token, consent row, list, task, or Graph mutation results from any
failure.

## Verification and acceptance boundary

Mocked tests must prove exact six-scope request construction; opaque and
encrypted-looking access-token acceptance with exact three-permission response
metadata; qualified-scope normalization; unexpected/missing/duplicate metadata
rejection; discovery-driven signed ID-token algorithm/`kid`/signature/issuer/
audience/nonce/time/version/tenant/claims failures; continuity mismatch and
owner-review failure; five-scope refusal before token access; successful authenticated consent-start without provider I/O;
confirmation/CSRF/eligibility stages; stale-schema 409 with no inserted session;
atomic extension request; fallback/uncertain recovery; one
create despite a recovered lost response; owner/non-shared/list/marker
containment; stored-list URL restriction; Johannesburg-to-Microsoft time-zone
mapping; content-free events; forced RLS; migration upgrade; and no external
provider I/O.

WP-11 is not complete until the separately approved plan in the integration
document passes the live consent/device gate and seven-day scorecard. WP-12 may
proceed independently during observation, but To Do remains experimental and
must not be selected as the active channel prematurely.

`pnpm check` passed on Node.js 24.18.0 and pnpm 11.14.0: formatting, lint,
strict typecheck, 129 modules/252 dependencies plus the negative fixture,
Drizzle consistency, 20 unit files/113 tests, one isolated PostgreSQL file/9
tests, 9 local live-server owner journeys, 99 governed Markdown documents with
a current generated dictionary, and all workspace production builds. Focused
tests additionally prove opaque/encrypted-looking Graph credentials, exact and
qualified response-scope metadata, discovery-driven signed ID-token substages,
opaque personal-account identity, hashed nonce binding, continuity owner review,
callback log redaction, completion read-back, valid canonical
advancement, marker-bounded cleanup, unauthenticated rejection, and
no-configuration refusal before provider access. Microsoft was synthetically
configured only to construct an unvisited authorization URL in live-server
acceptance; all provider fixtures were mocked/synthetic, with USD 0.00 cost and
zero provider requests.

## Rollback

Before live consent, rollback is code/config only: keep the five-scope route,
remove the dormant spike wiring with a forward migration if necessary, and
retain audit/migration history. After any later live test, disconnect first and
offer separately confirmed cleanup only for stored, marker-verified Meridian
objects. Never delete canonical reminder intent during adapter rollback.

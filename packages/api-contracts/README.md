---
purpose: Define the api-contracts package boundary.
audience: Contributors and coding agents.
authoritative-for: api-contracts responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# api-contracts

Responsibility: canonical OpenAPI, strict versioned request/response schemas, generated web client boundary, and the registry of domain schemas eligible for generation.

Exclusions: HTTP handlers, business rules, and alternate API protocols.

Allowed imports: versioned public schemas from `@meridian/domain`; no application or infrastructure implementation.

WP-04 exports schemas for CSRF acquisition, login, recovery, session metadata,
password change, session revocation, and stable error bodies. Authentication
responses deliberately have no field capable of carrying a password, recovery
code, session bearer, or CSRF bearer; cookies are an HTTP presentation concern.

WP-05 adds strict create/revise/lifecycle/detail/list/activity schemas and the
typed same-origin `createJournalApiClientV1` methods. Mutation clients attach
CSRF and a UUID command correlation header; callers retrying a raw command reuse
that UUID.

WP-06 adds a strict read-only worker-health response and same-origin client. It
contains counts, timestamps, identifiers, event types, attempts, and sanitized
error codes only; event payloads and exception messages have no response field.

WP-07 adds strict Microsoft status/connect/disconnect schemas and a read-only
status client. Responses expose configuration, exact scopes, display label,
state, and consent timestamps only. There is no response field for access or
refresh tokens, authorization codes, PKCE values, client secrets, or provider
diagnostics.

WP-09 adds strict Triage list/decision and explicitly confirmed
Standard-revision extraction request/response schemas. Proposal decisions expose
review state and provenance only; no contract can carry a downstream mutation
or external-action approval.

WP-13A adds strict Today snapshot, agenda, daily-priority, lifecycle, and undo
schemas. The response has a literal inactive external-delivery status and no
field capable of claiming a provider notification.

WP-14 adds strict goal, lifecycle, edge, load-setting, and combined goal-view
schemas. Responses expose canonical local state and transparent count guidance;
no contract carries provider status, inferred success, or execution claims.

Tests: Type checking and Playwright exercise authentication, journal, health,
Microsoft, Today, and goal schemas
against the live boundary. `docs/api/openapi.yaml` is reviewed and documentation
checked; automated OpenAPI generation/diff remains later tooling.

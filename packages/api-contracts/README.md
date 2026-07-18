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

Tests: Type checking and Playwright exercise every authentication schema against
the live Next.js REST boundary. `docs/api/openapi.yaml` is reviewed and checked
with the documentation set; automated OpenAPI generation/diff remains a later
contract-tooling improvement.

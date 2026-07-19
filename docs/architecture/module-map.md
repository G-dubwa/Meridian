---
purpose: Map modules, responsibilities, and allowed dependency directions.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Module map

## Runtime and dependency flow

`apps/web → application → domain ports ← infrastructure adapters` and `apps/worker → application`. Domain contains invariants and ports and imports no Meridian package. Application imports domain only. Prompts may import domain schemas, never the reverse. API contracts may register versioned domain boundary schemas; they contain no business rules.

## Package ownership

| Package                   | Owns                                                               | Prohibited imports                           |
| ------------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| `domain`                  | IDs, owner scope, policies, errors, schemas, ports, event envelope | every other Meridian package                 |
| `application`             | use-case and transaction orchestration                             | all infrastructure, presentation, prompts    |
| `api-contracts`           | OpenAPI/schema-generation boundary                                 | application services and infrastructure      |
| `infrastructure-*`        | adapters implementing domain ports                                 | web presentation and domain-policy invention |
| `prompts`                 | versioned prompt definitions and output contracts                  | infrastructure provider SDKs                 |
| `apps/web`, `apps/worker` | presentation, hosting, and explicit process composition            | adapter access outside composition roots     |

`apps/web/app/_server/composition.ts` and `apps/worker/src/composition.ts` are
the exact process composition roots allowed to construct infrastructure
adapters. Web route handlers depend on an application service facade; worker
runtime handlers do the same. Client components and non-composition runtime code
cannot import infrastructure modules.

`packages/infrastructure-ms-graph` implements only the WP-07 OAuth, minimal
profile, PKCE, and token-cipher ports. Calendar reads and all write surfaces are
absent. `packages/infrastructure-db` implements owner-scoped integration/consent
repositories plus the narrow one-time callback-session store. The application
service depends on those domain ports and never imports either adapter.

`packages/infrastructure-models` implements the domain model-inference port and
owns provider HTTP translation only. It must not decide processing eligibility,
retain prompt/output content, or activate a provider. `packages/prompts` owns
the immutable prompt version and output schema without importing adapters.
Application owns deterministic bypass, task-to-tier policy, and escalation.
Evaluation composition occurs only in the explicitly paid local runner.

WP-09 keeps interpretation persistence in `application`: strict model-shaped
output is validated into domain proposals, while `infrastructure-db` supplies
owner-scoped proposal and dedupe repositories. The web route imports only the
Triage application service. No presentation module can persist a proposal or
invoke a provider directly.

WP-10 keeps task/reminder authority and lifecycle in `domain`, atomic
orchestration in `application`, owner-scoped repositories in
`infrastructure-db`, strict wire schemas in `api-contracts`, and the action UI
in `apps/web`. The parser is domain-level deterministic code. No delivery
adapter is composed, and no application or presentation module imports a
Microsoft To Do client.

`dependency-cruiser.config.mjs` is executable authority for accepted ADR-0002
rules. Its negative fixtures prove both domain-to-infrastructure and
application-to-infrastructure imports are rejected, while the exact composition
root exception remains narrow and reviewable.

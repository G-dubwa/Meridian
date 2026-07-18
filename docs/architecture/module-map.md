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

`apps/web/app/_server/composition.ts` is the web process composition root and is
the only web source allowed to construct infrastructure adapters. Route handlers
depend on its application service facade; client components cannot import server
or infrastructure modules.

`dependency-cruiser.config.mjs` is executable authority for accepted ADR-0002
rules. Its negative fixtures prove both domain-to-infrastructure and
application-to-infrastructure imports are rejected, while the exact composition
root exception remains narrow and reviewable.

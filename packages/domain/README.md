---
purpose: Define the domain package boundary.
audience: Contributors and coding agents.
authoritative-for: domain responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# domain

Responsibility: framework-independent entities, invariants, versioned Zod schemas, typed errors, repository and service ports, and domain-event contracts.

Exclusions: use-case orchestration, persistence, provider adapters, frameworks, prompts, and UI.

Allowed imports: no other Meridian package. Zod is permitted only to define runtime-safe domain boundaries. Domain must never import application, infrastructure, API, prompt, worker, or web code.

Tests: authority and processing-class policies are unit tested; dependency-cruiser proves domain-to-infrastructure imports fail. Later packages add state-machine tests with their capabilities.

Public schema names carry a version suffix such as `V1`; `domainSchemaVersion` identifies the active package contract version. Repository ports preserve user scope and have no implementation here.

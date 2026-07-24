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

Tests: authority, processing-class, worker-job, and observation schemas are unit
tested; dependency-cruiser proves domain-to-infrastructure imports fail.

Public schema names carry a version suffix such as `V1`; `domainSchemaVersion`
identifies the active package contract version. Repository ports preserve user
scope and have no implementation here. Worker jobs carry only owner/outbox/event
identifiers and type; durable payload lookup remains owner-scoped persistence.

WP-07 adds the immutable five-scope Microsoft tuple, connection/consent states,
OAuth/PKCE/token-cipher ports, owner-scoped integration repositories, and strict
content-free integration event payloads. It contains no provider URL, SDK, HTTP,
or cryptographic implementation.

WP-13A adds local-date/agenda/priority/lifecycle schemas and provider-neutral
`CalendarPort` and `ReminderDeliveryPort` contracts. These ports contain
normalised Meridian types only. No provider credential, Graph type, or delivery
claim enters the domain.

WP-14 adds goal types/states, strict owner-authored inputs, registered edge
semantics, lifecycle validation, and transparent active-goal arithmetic.
Repository ports remain owner-scoped and contain no scheduler, model, analytic,
or provider type.

WP-15 adds strict local scheduling inputs, proposal/block states, content-free
event schemas, and owner-scoped repository ports. The domain contains no
scheduling algorithm, provider event, external identifier, or execution
inference.

WP-18 adds provider-neutral source/revision/chunk/claim/citation records, strict
upload and review commands, content-free lifecycle events, and parser/object
store ports. Exact citations carry immutable source offsets and hashes. No
parser library, file path, model, embedding, protocol, or provider type enters
the domain.

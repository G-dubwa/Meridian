---
purpose: Plan and record WP-02 implementation and acceptance evidence.
audience: Owner, reviewers, contributors, and coding agents.
authoritative-for: WP-02 scope, exclusions, verification, review, and rollback evidence.
update-triggers: WP-02 plan, implementation, findings, checks, or completion state changes.
related-docs: ../work-package-template.md
---

# WP-02 — Domain and application boundaries

## Status and dependencies

- Status: Complete
- Dependency: WP-01 complete and green at `07f9fcf`
- Branch: `wp-02-domain-application-boundaries`
- Started: 18 July 2026
- Completion commit: `WP-02: Domain and application boundaries`

## Scope and exclusions

Add versioned typed domain primitives, errors, event envelope, repository and service ports, application use-case and transaction contracts, architecture tests, generated-schema placeholders, and authoritative module documentation.

Exclude databases, ORMs, concrete auth, HTTP, worker behaviour, Microsoft Graph, and model calls.

## Change surface

- Packages: `domain`, `application`, `api-contracts`, architecture fixtures.
- Schema: TypeScript/Zod v1 boundary schemas only; no persistence schema.
- API: No HTTP paths; generated-schema placeholders only.
- Events: Versioned event envelope, no concrete event types.
- Integrations: None.
- Documentation: module map, domain model, package contracts, project state, roadmap, changelog.

## Tests and acceptance

Authority-tier validation, processing-class rules, in-memory transaction fake, prohibited dependency imports, all public schema versions, and full repository checks are required.

## Security and privacy

Private data is never externally processed or proactively surfaced. Sensitive processing requires an explicit route. A deterministic screen may raise but never lower privacy.

## Rollback

Revert the single WP-02 commit. There is no stored or external state.

## Self-review

- Scope: no ORM, persistence, authentication implementation, HTTP, worker behaviour, Graph, or model code was introduced.
- Authority: all five tiers map to their specified interaction; mismatches fail and T4 execution is prohibited.
- Privacy: Private is local-only, Sensitive is route-opt-in, Standard proactive surfacing is evidence-gated, and screening can never lower a class.
- Dependencies: domain may import no Meridian package; application may import domain only. Both negative fixtures fail for the expected rule.
- Types: all runtime schemas carry `V1`; branded IDs avoid resource confusion; public surfaces contain no `any`.
- Coupling: repository and service contracts are adapter-neutral. API contracts register schemas but contain no route or behaviour.
- Simplification: no concrete event types or speculative entities were added. Session storage is an explicitly required technical port, not a new user-owned resource.
- Failure handling: stable typed domain error codes cover validation, authority, privacy, prohibited action, not found, and conflict.

## Completion report

- Checks: format, lint, strict typecheck, dependency rules, 5 test files/16 tests, 80-document check, and all workspace builds pass.
- Documentation: module map, domain model, event catalogue, three package contracts, state, roadmap, and changelog updated.
- Decisions: none beyond accepted specification and ADRs. No decision-needed record required.
- Risks retired: implicit owner scope, unenforced provider privacy classes, untyped authority interactions, and adapter-coupled transaction contracts.
- Limitations: ports have no implementations and the event catalogue intentionally has no concrete event until behaviour arrives.
- Rollback: revert the single WP-02 commit; no schema, stored data, or external state exists.
- Next: WP-03 sequentially. No owner action required.

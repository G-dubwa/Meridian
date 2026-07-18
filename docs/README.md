---
purpose: Index Meridian documentation and define how authority is resolved.
audience: Owner, contributors, and coding agents.
authoritative-for: Documentation navigation and source-of-truth rules.
update-triggers: Documentation structure or governance changes.
related-docs: product/spec.md
---

# Meridian documentation

Read the [product specification](product/spec.md), [project state](product/project-state.md), [roadmap](product/roadmap.md), and active work-package record first. The latest release evidence is the [Foundation report](process/releases/Foundation-release-report.md).

## Authority

No document silently overrides another outside its scope. Conflicts are resolved in this order:

1. Product requirements and release scope: `docs/product/spec.md` and accepted PDRs.
2. Architecture: accepted ADRs.
3. Domain schemas: versioned definitions in `packages/domain`; data documentation reports them.
4. Application API: generated [OpenAPI](api/openapi.yaml).
5. Domain events: versioned event schemas and the event catalogue.
6. Calendar, reminder, prompt, model, and roadmap behaviour: their named authoritative documents and executable tests.

Generated documents report source definitions and are not hand-edited. A conflict fails `pnpm docs:check` until an accepted PDR or ADR resolves it.

The directory layout follows Specification §30: product, architecture, domain, API, integrations, AI, analytics, knowledge, security, operations, and process documentation have separate authority.

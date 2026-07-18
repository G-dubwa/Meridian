---
purpose: Plan and record WP-01 implementation and acceptance evidence.
audience: Owner, reviewers, contributors, and coding agents.
authoritative-for: WP-01 scope, exclusions, verification, review, and rollback evidence.
update-triggers: WP-01 plan, implementation, findings, checks, or completion state changes.
related-docs: ../work-package-template.md
---

# WP-01 — Repository and quality foundation

## Status and dependencies

- Status: Complete
- Dependencies: Empty remote repository and supplied Meridian Design Specification v1.2
- Branch: `wp-01-repository-quality-foundation`
- Owner: Primary implementation agent
- Started: 18 July 2026
- Completion commit: `WP-01: Repository and quality foundation` (resolve its hash from Git history after commit creation)

## Scope and exclusions

Create the pnpm TypeScript monorepo, two minimal apps, twelve package boundaries, strict project references, quality tools, CI, governed documentation tree, three initial decisions, local environment guidance, and verified setup.

Excluded: database, authentication, APIs or endpoints, model SDKs, Microsoft integration, and product UI beyond `/health`.

## Intended file tree

`apps/web`, `apps/worker`, Spec §25.4 `packages/*`, `evals`, `docs`, `infra`, `scripts`, `.github/workflows`, and root tool configuration. Empty future runtime directories use governed READMEs rather than speculative code.

## Change surface

- Files and packages: repository root, both apps, all Spec §25.4 package placeholders, scripts, CI, docs.
- Schema: None.
- API: No endpoints; canonical OpenAPI placeholder has no paths.
- Events: None.
- Integrations: None.
- Documentation: Full Spec §30 hierarchy, authority records, state, roadmap, templates, package contracts.

## Tests and acceptance criteria

- `pnpm install --frozen-lockfile`: passed on Node.js 24.18.0 and pnpm 11.14.0.
- `pnpm format:check`: passed.
- `pnpm lint`: passed; explicit `any` is an error and source scan found none.
- `pnpm typecheck`: passed with strict project references.
- `pnpm deps:check`: passed; 48 modules clean and invalid domain import rejected.
- `pnpm test`: passed, 1 file and 1 test.
- `pnpm docs:check`: passed, 79 Markdown documents and internal links.
- `pnpm build`: passed for all fourteen workspace projects; `/`, `/_not-found`, and `/health` prerendered.
- Gitleaks: policy and CI job configured; local binary unavailable and remote CI pending first push.

## Security, privacy, observability, and operations

No user data, secrets, provider access, network runtime, or content logging exists. CI receives least GitHub read permission. Health output contains no private state. Node 24.18.0 LTS and pnpm 11.14.0 are pinned for reproducibility.

## Rollback or reconciliation

Revert the single `WP-01` commit or discard its branch before integration. No data migration or external state exists.

## Self-review

- Scope: no database, auth, endpoint, SDK, integration, or product UI leakage; OpenAPI has zero paths.
- Architecture: dependency rules match ADR-0002 and their negative fixture is proven. Package shells contain no hidden coupling.
- Types: TypeScript 7.0.2 was outside the linter's supported peer range and failed; corrected to latest supported 6.0.3 without weakening lint.
- Supply chain: pnpm 11 requires explicit lifecycle permission; only Next.js dependency `sharp` is allowlisted.
- Privacy and security: no secrets, personal data, network runtime, or private logging. Next telemetry is disabled in CI. Gitleaks remains a remote-CI evidence item.
- Documentation: the repository specification copy is byte-identical to the supplied source; 79 Markdown headers and internal links pass.
- Simplification: placeholder packages expose one inert identifier and introduce no early abstractions.

## Completion report

- Commit: `WP-01: Repository and quality foundation`; hash reported after creation.
- Documentation: full governed skeleton, package contracts, ADR-0001, ADR-0002, PDR-0001, state, roadmap, changelog, and local setup.
- Decisions: modular monolith, inward dependency direction, and Personal Alpha boundary accepted from the specification. TypeScript 6.0.3 selected as the current supported lint-compatible pin.
- Risks retired: empty repository, absent quality gates, undocumented boundaries, and unverified package direction.
- Known limitation: remote GitHub Actions and Gitleaks results require the branch to be pushed; no local Gitleaks binary is installed.
- Next: WP-02 sequentially. Parallel tracks remain inactive. No owner action required.

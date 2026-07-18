# Meridian agent guide

Read `docs/product/spec.md`, `docs/product/project-state.md`, the active work-package record, and relevant accepted decisions before editing.

- Product authority lives in the versioned specification and accepted PDRs; architecture authority lives in accepted ADRs.
- Preserve the dependency direction documented in ADR-0002. Domain code never imports application, adapters, frameworks, prompts, or UI.
- Implement one work package at a time. Respect its exclusions, add tests and documentation, self-review, and keep the package revertible.
- Never log entry bodies, secrets, tokens, or private content. Private processing boundaries are invariants.
- Do not invent material product or architecture choices. Record unresolved choices with the decision-needed template.
- Run `pnpm run check` before declaring a package complete and update project state, roadmap, changelog, and the package record.

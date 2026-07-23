---
purpose: Record the standalone governed Codex–Claude orchestration work package.
audience: Owner, maintainers, implementation agents, and QA reviewers.
authoritative-for: INFRA-01 scope, exclusions, verification, rollback, and acceptance.
update-triggers: INFRA-01 implementation, pilot evidence, or disposition changes.
related-docs: ../../qa/autonomous-orchestration.md
---

# INFRA-01: governed Codex–Claude orchestration

Status: implementation plus offline and live synthetic pilots verified on
`infra/codex-claude-orchestrator`, based on exact `origin/main` at
`fbc86fc4adb53648caef403e2a79a09e35e0cba6`.

## Scope

- Deterministic finite-state supervisor and CLI.
- Exact isolated builder/auditor worktrees.
- Six versioned handoff schemas plus strict runtime validation.
- Non-interactive Codex and Claude adapters without bypass permissions.
- Locks, atomic resumable state, append-only history, stale checks, timeouts,
  process-tree cleanup, bounded infrastructure retry, and stop control.
- Secret scanning, environment/path boundaries, mandatory gates, and
  content-free duration/cost telemetry.
- Deterministic preflight/final checks and default no-merge policy.
- A synthetic QA-only pilot with one repair cycle and exact-commit retest.

## Exclusions

- No Meridian product work package.
- No live Codex or Claude model request during the offline pilot.
- No Microsoft, Graph, Outlook, To Do, Google, email, notification, or other
  provider access.
- No environment file, provider credential, persistent owner database, diary,
  calendar, health, or personal record access.
- No production deployment, automatic merge, branch history rewrite, or
  product-code pilot change.

## Acceptance

Unit tests cover strict/stale handoffs, secret/path rejection, closed stdin,
timeout termination, exclusive locks, atomic state, and append-only history.
The pilots proved build, audit, repair, resume, retest, final verification,
terminal reporting, cost containment, and worktree cleanup. The full Meridian
`pnpm check` remains the repository gate. Live product use remains a later
explicit owner gate, not waived acceptance.

Rollback is a normal revert of the standalone commit plus removal of ignored
`.agents` and `.worktrees` runtime directories after confirming no run is
active. The WP-11 remote branch and all product history remain untouched.

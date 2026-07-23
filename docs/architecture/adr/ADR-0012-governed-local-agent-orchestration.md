---
purpose: Record the governed local Codex–Claude orchestration architecture.
audience: Owner, maintainers, implementation agents, and QA agents.
authoritative-for: Agent authority, supervisor state transitions, worktree isolation, and merge gating.
update-triggers: Agent roles, protocol versions, state transitions, permissions, or merge policy change.
related-docs: ../../qa/autonomous-orchestration.md
---

# ADR-0012: governed local agent orchestration

Status: Accepted after controlled offline and live synthetic pilots; every new
live or product-bearing use remains independently owner-gated.

## Decision

A deterministic local supervisor is authoritative for the finite states
`PREPARE`, `CODEX_BUILD`, `DETERMINISTIC_PREFLIGHT`, `CLAUDE_AUDIT`,
`CODEX_REPAIR`, `CLAUDE_RETEST`, `FINAL_VERIFICATION`, `READY_TO_MERGE`,
`HUMAN_GATE`, and `FAILED`.

Codex implements in `.worktrees/codex-builder`. Claude independently audits an
exact detached candidate in `.worktrees/claude-auditor`. Neither agent invokes
the other. Versioned, strictly validated JSON handoffs are the only accepted
agent-to-supervisor protocol. The supervisor checks the exact base and candidate
commits, clean state, changed paths, structured findings, and test results at
every boundary.

Agents do not receive write access to the controlling repository's Git
administrative directory. They leave allowed changes unstaged; after validating
the exact starting commit and every changed path, the supervisor alone stages
and creates the implementation, repair, or QA evidence commit. Already-clean
fixture commits remain accepted for deterministic offline protocol testing.

Allowed Claude QA changes are separate descendant commits. The supervisor
validates their paths and fast-forwards them onto the package branch while
retaining a distinct QA branch reference; it never rewrites the implementation
commit.

The supervisor uses `codex exec` with `workspace-write` sandboxing and
`claude -p` with network-oriented tools denied. It never uses unrestricted or
dangerously skipped permission modes. Agent worktrees contain committed source,
not ignored environment files. Child environments omit API keys, provider
tokens, database URLs, and application secrets.

Automatic merge, branch push, and pull-request creation are disabled until the
owner accepts a genuine two-agent pilot. A `READY_TO_MERGE` decision means
candidate verification succeeded; it is not merge authorization.

## Consequences

Runs are resumable from persisted state and append-only transition history.
Infrastructure failures receive bounded retry; genuine QA findings do not.
Four unresolved repair cycles require a human gate. The supervisor can prove
process and repository invariants, but cannot prove model independence,
semantic completeness, host integrity, or the absence of defects.

The first committed pilot uses synthetic fixture executables because Claude Code
is not installed and this workstream forbids external-service access. That
pilot may prove state-machine mechanics, handoff rejection, exact-commit
retesting, repair routing, and clean shutdown. It must not be described as a
live Codex/Claude quality acceptance.

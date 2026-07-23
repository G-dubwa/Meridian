---
purpose: Define and record the controlled orchestration infrastructure pilot.
audience: Owner, maintainers, and QA reviewers.
authoritative-for: Pilot scope, evidence claims, exclusions, and live-pilot gate.
update-triggers: A simulated or live orchestration pilot is executed or reviewed.
related-docs: autonomous-orchestration.md
---

# Autonomous orchestration pilot

## Approved offline pilot

`pnpm agents:pilot` uses committed fixture executables with the same closed-stdin
process adapter and structured protocol as the real CLIs. It creates a
QA-only synthetic marker on an isolated builder branch. The synthetic Claude
fixture independently requests one repair, the builder commits it, and the
auditor retests the exact new commit. The CLI deliberately reconstructs the
supervisor between audit and repair to prove persisted resumption.

The pilot must finish `READY_TO_MERGE` with:

- two isolated worktrees and exact base/candidate verification;
- structured Codex build and repair handoffs;
- structured Claude acceptance plans, finding, and approval;
- one repair cycle;
- deterministic preflight and final checks;
- append-only transitions and owner-only artifacts;
- no environment file, persistent database, provider traffic, personal data,
  or product-code merge;
- removal of temporary worktrees after the terminal decision.

This is simulated process evidence. It is not evidence that either real model
was invoked or that Claude provides adequate independent QA.

The verified offline run
`infra-pilot-20260723124834-d637b71f` reached `READY_TO_MERGE` from exact base
`fbc86fc4adb53648caef403e2a79a09e35e0cba6` after one repair cycle and eight
append-only transitions. It retained Claude's allowed QA-only commit
`94880a14a93447f39957ae548cd449a292a8e755` separately and fast-forwarded it
without rewriting the implementation history. The final synthetic candidate
`0934d88deedde0f3a15c3d6d95c3282e9549700b` was not pushed or merged, and its
temporary worktrees were removed.

## Live pilot gate

The live pilot remains blocked until:

1. the official Claude Code CLI is installed and owner-authenticated;
2. `pnpm agents:doctor` passes without reading or printing credentials;
3. the owner authorizes the non-sensitive external model calls and a bounded
   cost allowance;
4. the exact QA-only assignment and network-denial controls are reviewed.

No product work package, merge, external provider integration, or personal data
is authorized by that approval.

The owner approved one live QA-only pilot on 23 July 2026 with a cumulative
maximum of USD 50. That approval applies only to the exact guarded command,
synthetic repository content, and the verified infrastructure branch. It does
not authorize product work or another live run.

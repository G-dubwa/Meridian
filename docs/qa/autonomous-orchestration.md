---
purpose: Operate and extend Meridian's governed local multi-agent supervisor.
audience: Owner, maintainers, Codex builders, Claude auditors, and future agent integrators.
authoritative-for: Agent commands, handoffs, worktrees, gates, recovery, and trust boundaries.
update-triggers: Supervisor commands, schemas, roles, permissions, state transitions, or pilot status change.
related-docs: ../architecture/adr/ADR-0012-governed-local-agent-orchestration.md
---

# Autonomous orchestration

## Roles and authority

The supervisor alone changes run state. Codex owns implementation changes.
Claude derives an initial acceptance plan from authoritative product, domain,
security, and work-package documents before looking at Codex tests, then audits
through browser or public APIs where available. Claude reports product defects;
it does not repair production code.

The control checkout stores configuration and ignored run state. Builder and
auditor worktrees never edit the same checkout concurrently:

```text
control checkout
├── .agents/runs/<run-id>/       ignored, mode 0700
├── .agents/locks/               ignored, mode 0700
└── .worktrees/
    ├── codex-builder/
    └── claude-auditor/
```

Claude repository writes are restricted to `tests/autonomous-acceptance/**`,
`docs/qa/**`, `playwright.qa.config.*`, and explicitly configured harness
paths. Claude must commit any allowed QA change separately. The supervisor
checks that the QA commit descends from the exact candidate, fast-forwards it
onto the implementation branch without rewriting either commit, and records a
separate QA branch reference. Product changes outside the work-package
allowlist enter a human gate.

## Commands

```bash
pnpm agents:doctor
pnpm agents:plan --wp WP-XX
pnpm agents:run --wp WP-XX
pnpm agents:status
pnpm agents:status <run-id>
pnpm agents:resume <run-id>
pnpm agents:stop <run-id>
pnpm agents:report <run-id>
pnpm agents:pilot
pnpm agents:deliver <run-id>
```

`doctor` verifies Git, Node, `codex`, `claude`, the local `origin/main`
reference, and the provider-network policy. A failed doctor is actionable and
does not access agent authentication data. `run --wp` plans and executes;
`resume` continues a persisted non-terminal state. `stop` persists the request
and terminates the recorded child process group.

## Installation and authentication prerequisites

- Repository Node.js 24.18.0 and pnpm 11.14.0.
- Git with worktree support.
- Official Codex CLI supporting `exec`, `--output-schema`, `--ephemeral`, and
  `workspace-write`.
- Official Claude Code CLI supporting `-p`, JSON output, and structured output.
- Interactive CLI authentication completed by the owner outside the
  supervisor.

Never put provider API keys in repository or orchestration environment files.
The supervisor does not print or copy CLI authentication state. Installing or
authenticating a missing CLI is an owner action.

## Protocol

Schemas live in `schemas/agents/v1`. Every handoff carries protocol/run/package
identity, full base and candidate commits, actor, status, evaluated
requirements, findings, evidence paths, commands, test results, next actor, and
gate status. Claude additionally supplies:

`requirement → observable behaviour → scenario → expected result → evidence`.

Unknown fields, missing fields, prose-only output, secret-shaped material,
wrong actors, and stale identities fail closed. A protocol change requires a
new version; old artifacts remain readable.

## Security boundary

Agent worktrees are created from committed Git objects, so ignored `.env` files
and persistent data are absent. Child environments use an allowlist and remove
application/provider credentials and database URLs. Prompts, stdout, stderr,
handoffs, and reports receive secret-pattern scanning. Artifact directories use
owner-only permissions. Playwright traces and screenshots belong only in
ignored, permission-restricted run directories.

Routine agents receive no Microsoft, Google, mail, calendar, notification, or
other provider access. Claude web tools and common network shell commands are
denied. Codex uses `workspace-write`, never danger-full access or bypass flags.
The supervisor supplies no persistent owner database connection.

## Reliability and recovery

One exclusive lock exists per work package. State writes use atomic rename;
transitions append JSONL records containing only state, time, commit, duration,
and content-free cost metadata. Child stdin is closed. Each process has a
timeout and its process group is terminated on expiry. Only spawn failures and
timeouts receive bounded infrastructure retry.

After restart, inspect `agents:status <run-id>` and use `agents:resume`. Exact
commit and clean-worktree checks run again before each agent. A live stale PID,
malformed state, partial worktree preparation, or suspected secret exposure
fails closed for owner review. Do not delete run state to make a failure pass.

## Mandatory human gates

The supervisor stops for new provider permissions, live provider access, paid
evaluation above allowance, personal-data transmission, production deployment,
destructive database work, live deletion, real phone delivery, safety-sensitive
health behaviour, four unresolved repair cycles, suspected secret exposure, or
scope expansion. The gate report states the exact request, reason, and untouched
systems.

## Cost and merge controls

Transitions retain duration plus aggregate USD cost when an agent exposes safe
metadata; missing cost is recorded as `not_reported`, never guessed. The
configured pre-authorized paid allowance is USD 0. Automatic merge defaults
off. The supervisor never squashes, amends, rebases, or rewrites verified
commits. `agents:deliver` is usable only for a `READY_TO_MERGE` candidate whose
committed assignment authorizes delivery. Configured branch pushes use exact
commit refspecs; optional main delivery is fast-forward-only and refuses a
changed `origin/main`. Push, pull-request, and automatic-fast-forward controls
stay disabled for the initial pilot.

## Adding another agent

Add a versioned result schema, an explicit role, an allowlisted worktree and
paths, a non-interactive adapter with closed stdin and timeout, and supervisor
transitions. New agents cannot receive agent-to-agent invocation, broader
secrets/network access, or merge authority. A new agent requires a synthetic
protocol test and a separately approved controlled pilot.

## What this can prove

The supervisor can prove exact commits, ordered transitions, structured
handoffs, deterministic command outcomes, repository scope, and local process
termination. It cannot prove that model reasoning is independent, all
requirements are complete, an agent did not misunderstand an allowed file, or
the host/CLI binary is uncompromised. Human review and deterministic CI remain
separate controls.

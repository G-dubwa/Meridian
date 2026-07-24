---
purpose: Define release gates, evidence, and rollback.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Release process

A release closes only at its designated package after every included package is
independently committed, integrated, and green. The release report records
delivered capability, exact checks, privacy/security posture, operations,
rollback, known limitations, and the next gate.

1. Reconcile package records, project state, roadmap, changelog, decisions, API,
   schema/data dictionary, and operations documents.
2. Run the complete pinned-runtime repository gate from a clean worktree.
3. Demonstrate the release-specific end-to-end loop with real boundary
   dependencies where required; broad mocks are insufficient.
4. Perform a separate scope, dependency, privacy, security, retry/failure,
   observability, accessibility, and rollback review.
5. Commit and fast-forward the stable integration branch only after blockers are
   corrected. Preserve the prior release commit as the rollback code point.
6. At a mandatory human gate, stop the affected stream and report exact owner
   action, safest default, resumable evidence, and parallel safe work.

Foundation evidence is
[recorded here](releases/Foundation-release-report.md). Personal Alpha, Personal
Beta, and Personal v1 reports are mandatory at WP-13, WP-18, and WP-22. The
provider-independent [Personal Alpha](releases/Personal-Alpha-local-release-report.md)
and [Personal Beta](releases/Personal-Beta-release-report.md) reports preserve
their explicit external-provider limitations.

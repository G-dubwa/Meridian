---
purpose: Define the scheduling package boundary.
audience: Contributors and coding agents.
authoritative-for: scheduling responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# scheduling

Responsibility: Deterministic availability and block proposals.

Exclusions: Calendar writes and model-generated arithmetic.

Allowed imports: May import domain contracts and deterministic time-zone invariants only.

WP-15 activates pure `proposeBlocks` arithmetic over exact availability and
busy intervals. It applies buffers, block-size preferences, a daily deep-work
bound, capacity arithmetic, and explainable verdicts. It performs no I/O,
provider lookup, model inference, persistence, approval, or execution scoring.

Tests: deterministic unit/property fixtures prove that candidates never overlap
buffered busy intervals, respect block and daily limits, and report
infeasibility without inventing capacity.

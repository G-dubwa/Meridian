---
purpose: Record WP-11 experimental implementation evidence and its deferred disposition.
audience: Owner, reviewers, operators, contributors, and coding agents.
authoritative-for: WP-11 status on main, preserved branch, exclusions, and resume gate.
update-triggers: WP-11 resumes, its preserved branch changes, or live acceptance is completed.
related-docs: ../../integrations/microsoft-todo-spike.md
---

# WP-11 — Microsoft To Do delivery spike

## Status and dependencies

- Status: Deferred on 23 July 2026.
- Dependency: WP-10 commit
  `718bc897939017a641e6c3ee20f593c9c7c35516`.
- Preserved branch: `wp-11-microsoft-todo-delivery-spike`.
- Authoritative experimental tip:
  `7538b4123cfcba7b65765cd68c4b53c7193a6f15`.
- Integration: deliberately not merged into `main`.

## Evidence and disposition

Mocked implementation and local verification succeeded on the preserved
branch. Live personal-account validation remained incomplete and failed
closed; no production channel was activated and no live acceptance criterion
was waived or passed.

The adapter remains experimental and inactive. The canonical Meridian reminder
remains the source of truth. This deferral prioritises time-to-user-value and
does not conclude that Microsoft To Do is unsuitable.

## Resume gate

Resumption requires explicit owner approval before authorization, Graph access,
Entra changes, provider mutation, cleanup, or device testing. Work must start
from the preserved branch, reconcile safely with then-current `main`, retain
its containment and idempotency controls, and complete all original live and
operational criteria.

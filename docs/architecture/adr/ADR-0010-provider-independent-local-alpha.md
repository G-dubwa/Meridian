---
purpose: Record the decision to defer Microsoft-dependent packages and deliver a provider-independent local Alpha.
audience: Owner, reviewers, operators, contributors, and coding agents.
authoritative-for: Microsoft deferral, Local Alpha dependency boundaries, and the amended provider-independent package sequence.
update-triggers: Microsoft work resumes, an external provider is proposed, or the Local Alpha dependency boundary changes.
related-docs: ../../product/roadmap.md
---

# ADR-0010 — Provider-independent local Alpha

Status: Accepted, 23 July 2026.

## Context

WP-11 reached a successful mocked implementation on an experimental branch,
but live personal-Microsoft-account validation did not satisfy its acceptance
criteria. Continuing provider debugging would delay useful canonical Meridian
work. The accepted v1.2 specification couples WP-13 to Outlook context and
external reminder delivery, while the canonical domain is intentionally
provider-neutral.

## Decision

Defer WP-11 Microsoft To Do delivery and WP-12 Outlook read synchronisation.
Preserve `wp-11-microsoft-todo-delivery-spike` as the authoritative technical
resume point without merging it into `main`. The deferral is a programme
sequencing decision, not a technical rejection, and no live criterion is
waived.

Split WP-13 into:

- WP-13A Local Alpha Today: canonical local tasks/reminders, manually entered
  agenda blocks, at most three owner-selected priorities, in-app lifecycle and
  undo, and explicit external-channel-inactive status.
- WP-13B external agenda and notification projections: deferred behind
  provider-specific proposals and gates.

Preserve provider-neutral `CalendarPort` and `ReminderDeliveryPort` boundaries.
Canonical tasks, reminders, journal, goals, planning, memory, and knowledge
remain the source of truth. No production or Alpha capability may depend on
Microsoft credentials, consent, tokens, account state, or Graph availability.
No alternative provider is selected by implication.

After WP-13A, continue with goals and load guidance; deterministic local
scheduling; execution evidence and The Weekly; knowledge ingestion; retrieval;
protocol safety; analytics; and owner controls/hardening. Provider calendar
writes remain deferred and do not block that sequence.

## Consequences

- Local Alpha can provide daily value without external availability.
- The UI must distinguish in-app state from external delivery and never
  simulate provider evidence.
- Mock/test adapters prove port compatibility without network calls.
- Resuming any provider requires a new explicit permission, privacy, live-data,
  and operational proposal where applicable.
- The Personal Alpha release report will record external agenda and phone
  delivery as limitations until WP-13B passes.

## Rollback

Reversing this sequencing decision requires a new accepted decision. It must
name the provider, exact permission and data boundary, resume or replacement
package, reconciliation plan, and mandatory human gates. It cannot retroactively
mark deferred evidence as accepted.

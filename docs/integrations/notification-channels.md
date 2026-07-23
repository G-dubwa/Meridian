---
purpose: Define delivery channel capabilities and authority limits.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Notification channels

## Local Alpha boundary

External phone reminder delivery is inactive. WP-13A may present and mutate
canonical reminders in the authenticated Meridian UI, but it must never claim
that an external notification was sent, delivered, seen, or completed.

The domain retains a provider-neutral `ReminderDeliveryPort`. Local/test
adapters may prove application behaviour without credentials or network
access. Microsoft To Do, Google, web push, email, and any other external
channel require separate governed proposals, permissions, privacy review, and
live acceptance. Deferring one provider does not select another.

Meridian's canonical task, reminder, and occurrence records remain the source
of truth regardless of any future projection or completion channel.

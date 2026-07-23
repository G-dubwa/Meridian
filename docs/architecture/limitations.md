---
purpose: Record deliberate technical limitations and deferred constraints.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Known limitations

- External calendar agenda synchronisation and external reminder/phone
  notification delivery are inactive and unaccepted.
- Today contains only canonical local tasks/reminders, owner-selected
  priorities, and manually entered agenda blocks. It cannot infer availability
  from a provider.
- In-app completion or dismissal is not evidence that a phone notification was
  sent, received, or acted on.
- Daily priorities are deliberately capped at three and are selected per
  owner-local date; no automatic ranking is active.
- Goals and transparent load guidance are local and active. Inferred goals,
  automatic prioritisation, deterministic scheduling proposals, execution
  evidence, Weekly Review, retrieval, and analytics remain later packages.
- Dependency guidance reflects explicit canonical edges only. It is not a
  success forecast, performance score, or proof that work occurred.
- The preserved Microsoft branch is experimental and does not provide an
  active capability on `main`.

---
purpose: Release definitions and exit evidence.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Releases

| Release        | Packages | Status                                | Evidence                                                              |
| -------------- | -------- | ------------------------------------- | --------------------------------------------------------------------- |
| Foundation     | WP-01–06 | Complete and independently deployable | [Foundation report](../process/releases/Foundation-release-report.md) |
| Personal Alpha | WP-07–13 | In progress; WP-07 complete           | Required at WP-13                                                     |
| Personal Beta  | WP-14–18 | Pending                               | Required at WP-18                                                     |
| Personal v1    | WP-19–22 | Pending                               | Required at WP-22                                                     |

Each release is independently deployable and retains its own test, operations,
limitations, and rollback evidence. A later package may correct a release report
only by recording the reconciliation; it does not silently rewrite historical
acceptance.

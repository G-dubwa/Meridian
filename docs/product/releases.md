---
purpose: Release definitions and exit evidence.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Releases

| Release        | Packages | Status                                    | Evidence                                                                                                         |
| -------------- | -------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Foundation     | WP-01–06 | Complete and independently deployable     | [Foundation report](../process/releases/Foundation-release-report.md)                                            |
| Personal Alpha | WP-07–13 | Local provider-independent Alpha complete | [Local Alpha report](../process/releases/Personal-Alpha-local-release-report.md); provider addendum after WP-13B |
| Personal Beta  | WP-14–18 | In progress; WP-14 and WP-15 complete     | Required at WP-18                                                                                                |
| Personal v1    | WP-19–22 | Pending                                   | Required at WP-22                                                                                                |

Each release is independently deployable and retains its own test, operations,
limitations, and rollback evidence. A later package may correct a release report
only by recording the reconciliation; it does not silently rewrite historical
acceptance.

Personal Alpha is being delivered in a provider-independent local lane.
WP-11, WP-12, and WP-13B remain deferred and do not block WP-13A. The local
Alpha report must state that external agenda sync and phone reminder delivery
are inactive; it cannot treat mocked or deferred Microsoft evidence as live
acceptance.

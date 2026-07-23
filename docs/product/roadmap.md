---
purpose: Track the governed release sequence and work-package status.
audience: Owner, contributors, and coding agents.
authoritative-for: Roadmap order and current package status; release scope remains in the specification.
update-triggers: A package starts, completes, blocks, or is reconciled after a release gate.
related-docs: spec.md
---

# Roadmap

Status legend: `NEXT`, `PENDING`, `DEFERRED`, `COMPLETE`.

| Release        |  WP | Title                                           | Status                        |
| -------------- | --: | ----------------------------------------------- | ----------------------------- |
| Foundation     |  01 | Repository and quality foundation               | COMPLETE                      |
| Foundation     |  02 | Domain and application boundaries               | COMPLETE                      |
| Foundation     |  03 | Database and resource foundation                | COMPLETE                      |
| Foundation     |  04 | Local owner authentication                      | COMPLETE                      |
| Foundation     |  05 | Walking journal slice                           | COMPLETE                      |
| Foundation     |  06 | Worker and reliable event processing            | COMPLETE                      |
| Personal Alpha |  07 | Microsoft connection and consent                | COMPLETE                      |
| Personal Alpha |  08 | Model bake-off and gateway                      | COMPLETE                      |
| Personal Alpha |  09 | Interpretation, commands, and Triage            | COMPLETE                      |
| Personal Alpha |  10 | Tasks and canonical reminders                   | COMPLETE                      |
| Personal Alpha |  11 | Microsoft To Do delivery spike                  | DEFERRED: experimental        |
| Personal Alpha |  12 | Outlook fixed-window read sync                  | DEFERRED: Microsoft-dependent |
| Personal Alpha | 13A | Local Alpha Today                               | COMPLETE                      |
| Personal Alpha | 13B | External agenda and notification projections    | DEFERRED: provider gate       |
| Personal Beta  |  14 | Goals, edges, and soft load guidance            | PENDING                       |
| Personal Beta  |  15 | Deterministic scheduling and local proposals    | PENDING                       |
| Personal Beta  |  16 | Calendar writes, adoption, and reconciliation   | DEFERRED: provider gate       |
| Personal Beta  |  17 | Execution evidence and The Weekly               | PENDING                       |
| Personal Beta  |  18 | Knowledge-source ingestion foundation           | PENDING                       |
| Personal v1    |  19 | Embeddings, retrieval, and context manifests    | PENDING                       |
| Personal v1    |  20 | Protocol registry, safety, and adoption         | PENDING                       |
| Personal v1    |  21 | Summaries, metrics, trends, and v1 dashboard    | PENDING                       |
| Personal v1    |  22 | Memory manager, export, deletion, and hardening | PENDING                       |

Release reports are mandatory at WP-06, WP-13, WP-18, and WP-22. Releases remain distinct and independently deployable.

WP-13 is split without rewriting the accepted v1.2 specification: WP-13A
delivers a useful local Today surface from canonical Meridian data, while
WP-13B retains provider-dependent agenda and notification projections behind
future explicit gates. WP-16 is likewise non-blocking for the independent
WP-17–WP-22 sequence. WP-14 is next. No deferred provider is substituted
automatically.

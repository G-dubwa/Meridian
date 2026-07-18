---
purpose: Track the governed release sequence and work-package status.
audience: Owner, contributors, and coding agents.
authoritative-for: Roadmap order and current package status; release scope remains in the specification.
update-triggers: A package starts, completes, blocks, or is reconciled after a release gate.
related-docs: spec.md
---

# Roadmap

Status legend: `IN PROGRESS`, `PENDING`, `GATED`, `COMPLETE`.

| Release        |  WP | Title                                           | Status                      |
| -------------- | --: | ----------------------------------------------- | --------------------------- |
| Foundation     |  01 | Repository and quality foundation               | COMPLETE                    |
| Foundation     |  02 | Domain and application boundaries               | COMPLETE                    |
| Foundation     |  03 | Database and resource foundation                | COMPLETE                    |
| Foundation     |  04 | Local owner authentication                      | PENDING                     |
| Foundation     |  05 | Walking journal slice                           | PENDING                     |
| Foundation     |  06 | Worker and reliable event processing            | PENDING                     |
| Personal Alpha |  07 | Microsoft connection and consent                | PENDING                     |
| Personal Alpha |  08 | Model bake-off and gateway                      | PENDING                     |
| Personal Alpha |  09 | Interpretation, commands, and Triage            | PENDING                     |
| Personal Alpha |  10 | Tasks and canonical reminders                   | PENDING                     |
| Personal Alpha |  11 | Microsoft To Do delivery spike                  | GATED: real-device evidence |
| Personal Alpha |  12 | Outlook fixed-window read sync                  | PENDING                     |
| Personal Alpha |  13 | Personal Alpha Today and delivery               | PENDING                     |
| Personal Beta  |  14 | Goals, edges, and soft load guidance            | PENDING                     |
| Personal Beta  |  15 | Scheduling and calendar proposals               | PENDING                     |
| Personal Beta  |  16 | Calendar writes, adoption, and reconciliation   | PENDING                     |
| Personal Beta  |  17 | Execution evidence and The Weekly               | PENDING                     |
| Personal Beta  |  18 | Knowledge-source ingestion foundation           | PENDING                     |
| Personal v1    |  19 | Embeddings, retrieval, and context manifests    | PENDING                     |
| Personal v1    |  20 | Protocol registry, safety, and adoption         | PENDING                     |
| Personal v1    |  21 | Summaries, metrics, trends, and v1 dashboard    | PENDING                     |
| Personal v1    |  22 | Memory manager, export, deletion, and hardening | PENDING                     |

Release reports are mandatory at WP-06, WP-13, WP-18, and WP-22. Releases remain distinct and independently deployable.

---
purpose: Define canonical goals, resource edges, dependency guidance, and soft active load.
audience: Owner, contributors, and coding agents.
authoritative-for: WP-14 goal and edge semantics.
update-triggers: Goal fields, lifecycle, edge vocabulary, or load guidance changes.
related-docs: state-machines.md, events-catalogue.md
---

# Goals, edges, and active load

A goal is an owner-scoped canonical resource. `outcome` goals describe an
intended result; `behavioural` goals describe an intended continuing practice.
The narrative is retained in the owner's words. Success criteria may be empty
while a goal incubates, but Meridian never invents or silently activates them.

Manual creation starts in `incubating`. Lifecycle writes are exact-version,
owner-confirmed internal commands. Terminal goals are retained and cannot be
reopened or edited. A merge atomically terminalises the source and creates one
unremovable `merged_into` edge to an available target.

## Registered relationships

| Type             | Direction and meaning                               |
| ---------------- | --------------------------------------------------- |
| `part_of`        | Source is a component of target                     |
| `depends_on`     | Source requires target before it can proceed        |
| `blocks`         | Source prevents target from proceeding              |
| `conflicts_with` | Source and target are in explicit symmetric tension |
| `supports`       | Source contributes to target                        |
| `merged_into`    | Source goal was terminally merged into target       |

Edges require two existing resources owned by the same owner. Self-edges,
duplicate active edges, inverse duplicate conflict edges, and `depends_on`
cycles fail closed. Removal timestamps an edge instead of erasing its history.
New semantics require governed vocabulary review; arbitrary user labels do not
become global edge types.

## Deterministic guidance

The active-load card shows only active count, owner-selected guide, and
`overBy = max(0, activeCount - limit)`. Five is the default, not a database
maximum. An activation at or beyond the guide requires the owner to acknowledge
the explanation; acknowledgement permits the activation.

A goal is shown as blocked when an active canonical edge says it `depends_on`
an uncompleted target, or an uncompleted source `blocks` it. This is planning
guidance. It is not evidence of execution, completion probability, performance,
success, or personal wellbeing.

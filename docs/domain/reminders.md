---
purpose: Define canonical reminder behaviour and lifecycle.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Tasks and canonical reminders

## Thin task model

A task has an optional goal resource, kind (`task`, `commitment`, `routine`, or
`milestone`), title, notes, optional estimate and due instant, state, creation
authority, optional source proposal, and optimistic version. WP-10 deliberately
adds no project board, assignment, team, provider synchronization, or priority
scoring system.

Task state is `open → scheduled | done | dropped | superseded` or `scheduled →
open | done | dropped | superseded`. Terminal states never reopen. Undo of a
new task moves it to `dropped` and retains its receipt and audit evidence.

## Canonical reminder intent

A reminder is Meridian's authoritative meaning, independent of any later
delivery channel. It records:

- purpose and optional related resource;
- exact UTC trigger plus the IANA time zone used to interpret local time;
- optional versioned daily or weekly recurrence;
- delivery policy (`undecided` in WP-10), priority, and quiet-hours behavior
  (`defer`);
- optional expiry, lifecycle state, creation authority, optional source
  proposal, and owner feedback.

An initial `reminder_occurrence` is stored for the trigger. Its ID and unique
`(reminder_id, scheduled_for)` key make later due/delivery work idempotent.
Editing a trigger cancels pending old occurrences and creates the replacement;
history is not rewritten.

Reminder intent follows `scheduled → due → delivered → completed | dismissed |
snoozed`, with `due → completed | dismissed | snoozed`, `snoozed → scheduled`,
and `scheduled → paused | expired | dismissed`, `paused → scheduled`. Terminal
states do not reopen. WP-10 can create, edit, and undo scheduled intent but does
not advance delivery states.

## Time and recurrence

The direct text grammar is intentionally narrow: `Remind me tomorrow at HH:MM
to …` or the same form with `YYYY-MM-DD`. Resolution uses the supplied IANA
zone and rejects invalid dates, past triggers, daylight-saving gaps, and
daylight-saving overlaps. Anything else asks for structured input or
clarification; no LLM guesses an instant.

Recurrence schema v1 supports daily intervals without weekday selection and
weekly intervals with zero or more unique ISO weekdays (`1` Monday through `7`
Sunday), plus an optional offset-aware end instant. WP-10 stores recurrence
meaning but does not expand or deliver future occurrences; that becomes a
tested adapter responsibility only after WP-11.

## Authority and receipts

Explicit deterministic owner commands are reversible T1 internal actions.
Inferred tasks/reminders remain T2 proposals until owner acceptance; a reminder
proposal cannot be accepted without an exact confirmed instant and zone. A
receipt identifies the canonical target and supports optimistic Edit and Undo.
Receipts are audit evidence, not permission to perform external work.

Microsoft To Do, calendar writes, mail, shared calendars, application
permissions, notification escalation, and autonomous safety-sensitive action
are unavailable. WP-11 owns the separately approved delivery spike.

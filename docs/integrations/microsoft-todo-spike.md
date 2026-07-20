---
purpose: Govern the contained Microsoft To Do delivery spike, evidence, and two human gates.
audience: Owner, reviewers, contributors, operators, and coding agents.
authoritative-for: WP-11 Microsoft To Do scope, containment, lifecycle mapping, acceptance, and rejection.
update-triggers: The spike implementation, permission envelope, live evidence, scorecard, or channel decision changes.
related-docs: ../process/work-packages/WP-11-microsoft-todo-delivery-spike.md
---

# Microsoft To Do delivery spike

Status: mocked implementation verified; live incremental consent and every real
Graph read/write remain blocked at the second human gate. To Do is experimental,
not an active Meridian delivery channel.

## Permission envelope and gate

The incremental authorization request must contain exactly these six delegated
OAuth/OIDC scopes, with no application permission:

`openid profile offline_access User.Read Calendars.Read Tasks.ReadWrite`

The OAuth/OIDC request is deliberately distinct from the Graph access token.
Meridian decodes the returned delegated token's `scp` claim locally and requires
exactly `User.Read Calendars.Read Tasks.ReadWrite`. It rejects a missing or
opaque `scp`, any missing expected Graph permission, and any unexpected Graph
permission. The OIDC scopes are not required to appear identically in `scp` or
in Microsoft's consent display. The consent ledger records both exact sets.

`Tasks.ReadWrite` technically grants delegated access to the signed-in owner's
Microsoft To Do tasks beyond the dedicated Meridian list, including shared
tasks visible to that owner. Microsoft offers no list-scoped delegated write
permission. Meridian contains that broader technical grant in application code:

- all task URLs are rooted at `/me/todo/lists/{stored-list-id}/tasks`;
- no `/users`, shared-list discovery, import, or general task-sync operation is
  implemented;
- every mutation first verifies the stored list ID, exact `Meridian` name,
  owner/non-shared flags, normal-list type, and opaque ownership extension;
- a task must also have a Meridian-created local binding and linked ownership
  marker before update or deletion;
- any missing, conflicting, shared, foreign, or unverifiable marker suspends the
  experimental path and fails closed.

The existing UI still initiates only the five-scope Stage-A connection. The
six-scope incremental method is dormant and has no HTTP route. Entra permissions
must not be changed and that method must not be exposed until the owner approves
the second gate.

## Dedicated-list ownership

Meridian creates one normal Microsoft To Do list named `Meridian`; it never
adopts an existing list merely because its display name matches. Before create,
it records a metadata-only baseline of list IDs. The preferred request embeds
an opaque `com.meridian.todoOwnership` open extension in the list-create body so
list and marker are created atomically. If the personal-account endpoint
deterministically rejects nested extension creation, Meridian may use create
then mark. If a create response is lost, it compares the post-create list set
with the baseline and continues only when exactly one new owner-owned,
non-shared, normal `Meridian` list can be identified; otherwise it records an
uncertain operation and stops.

The local list binding stores the Microsoft list ID and opaque ownership marker
under forced owner RLS. Meridian mutates only that stored list and tasks it
created whose Microsoft IDs and distinct opaque markers are stored locally.
Renaming, sharing, deleting, duplicating, or removing the marker makes the list
unmanaged/suspended; name alone never proves ownership.

## Authority and lifecycle

Meridian's internal reminder and occurrence remain canonical. Microsoft To Do
is only a candidate delivery and completion channel. Every experimental external
write is T3: it requires exact owner confirmation, a canonical pending
occurrence, a verified list/task binding, deterministic projection validation,
and a content-free operation record. No provider state can create, rewrite, or
delete canonical intent silently.

- **Create:** project one confirmed canonical occurrence to one To Do task. A
  unique local occurrence binding, projection hash, request correlation, and
  linked ownership marker prevent duplicate POSTs. A known binding is returned
  without another provider request.
- **Update:** patch only a bound, marker-verified task after its canonical
  projection changes and the owner confirms the preview. Repeating the same
  projection hash is a no-op. A lost PATCH response may be reconciled and
  retried once because the same target is idempotent; unresolved divergence
  suspends the path.
- **Completion:** read only the bound task in the dedicated list. A Microsoft
  `completed` state is completion evidence for the matching occurrence. It may
  advance the canonical occurrence/reminder only through their valid lifecycle;
  an impossible or stale transition is held for review, never forced.
- **Dismissal:** a Meridian dismissal remains the canonical decision. With a
  confirmed cleanup preview it removes the bound delivery mirror; disappearance
  of a provider task is not interpreted as canonical dismissal.
- **Deletion:** delete only a locally bound, marker-verified task. List deletion
  is a separate cleanup operation requiring literal confirmation and a fresh
  containment check. Neither action deletes audit, consent, or canonical data.
- **Reconciliation:** inspect only the stored list and stored task IDs. Meridian
  pushes canonical changes outward and reads completion inward. Foreign tasks,
  title matches, unbound IDs, shared tasks, and unexpected provider changes are
  ignored or quarantined. General bidirectional task sync is prohibited.

Create uncertainty is resolved by marker search before any retry. Zero matches
permits one bounded retry; one match is adopted into the pending local binding;
multiple matches stop as a duplicate defect. Update/delete uncertainty is
resolved against the exact stored target and never changes targets. Rate limits
use bounded backoff; authentication loss suspends delivery. There is no endless
retry and no blind create retry.

Existing personal and shared lists/tasks are not imported, mutated, completed,
or deleted. Baseline list metadata is used only for uncertain list-create
recovery and is not retained as personal task content.

## Time and recurrence mapping

The canonical instant is UTC and the canonical IANA zone is
`Africa/Johannesburg`. The adapter deterministically converts the instant to a
local wall time and sends Microsoft Graph's Windows-zone label
`South Africa Standard Time` in `reminderDateTime` and optional `dueDateTime`.
It sets `isReminderOn: true`. Meridian has no canonical start instant, so
`startDateTime` is omitted. A missing due instant omits `dueDateTime`.

The spike uses one external task per canonical occurrence and sends no native
To Do recurrence. Meridian recurrence remains authoritative; a later governed
occurrence expander would create separately idempotent occurrences. This avoids
two recurrence engines drifting. The real-device test must separately verify
how To Do displays reminder and due wall times; any critical offset, date, or
duplicate defect rejects the channel.

## Disconnect, revocation, and cleanup

Disconnect immediately erases local provider tokens and marks an experimental
list binding `unmanaged`; it performs no Graph cleanup. Revocation or failed
refresh marks it `suspended`. Externally created lists/tasks remain in Microsoft
To Do by default and are visibly owner-manageable but no longer controlled by
Meridian. Pre-disconnect cleanup is optional only after a separate confirmation;
it deletes verified Meridian-created objects and records results. Reconnect does
not adopt by name or resume writes until ownership is reverified.

## Real-device acceptance plan — second gate

Before the test, the phone must use the same personal Microsoft account, have a
current Microsoft To Do app, working network access, automatic date/time and
the expected Johannesburg wall time. OS and app notifications must be enabled;
lock-screen/banner delivery and background activity must be allowed; Focus/Do
Not Disturb and battery restrictions must be disabled or explicitly exempt the
test. Desktop/Outlook clients must be identified separately. A control To Do
notification should first prove the device configuration independently of
Meridian.

After explicit live-gate approval, use exactly one clearly labelled synthetic
task, `Meridian WP-11 TEST — safe to delete`, with no journal, calendar, or
personal content. Capture separate content-free observations for:

1. Graph list/task creation result and elapsed time.
2. Task visibility in Microsoft To Do and elapsed time.
3. Phone OS notification receipt and elapsed time.
4. Completion performed on the phone and elapsed time.
5. Meridian's observation/reconciliation of that completion and elapsed time.
6. An uncertain/retry simulation proving no duplicate task.
7. Disconnect proving no further Graph work and the binding becoming unmanaged.
8. Confirmed cleanup result for the single labelled task/list.

Run the reliability scorecard for at least seven real days. Observation does
not activate To Do: WP-11 remains open and the channel remains experimental for
the entire period. Independent WP-12 work may proceed while observation runs.
Activation requires every acceptance criterion, a weighted score of at least
80%, no critical time-zone or duplicate defect, and an explicit owner decision.

## Content-free evidence

The consent ledger records provider, action, time, local integration ID, the
exact six requested OAuth/OIDC scopes, and the exact three Graph `scp`
permissions. It stores no token, code, PKCE secret, provider subject, or consent
page text.

The activity ledger records only local operation/list/occurrence IDs, operation
kind, outcome, attempt count, stable failure class, correlation ID, and time.
It excludes list/task Microsoft IDs, titles, reminder/due times, tokens,
extensions, response bodies, device identifiers, journal/calendar data, and
personal records. Acceptance reporting is aggregate and content-free.

## Rejection and rollback

Reject Microsoft To Do as Meridian's Alpha delivery channel if the score is
below 80%, the owner does not prefer it, a critical time-zone or duplicate
defect occurs, phone delivery or completion read-back is unreliable, shared or
foreign data cannot be provably contained, ownership markers are unsupported,
permission expansion is required, cleanup cannot be bounded, or uncertain
outcomes cannot fail closed.

Rollback keeps the integration at the five-scope Stage-A envelope, leaves all
To Do routes disabled, erases any live tokens through disconnect, marks local
bindings unmanaged, and offers confirmed cleanup only for marker-verified
objects. Canonical reminders, provenance, consent history, and content-free
audit remain intact. The alternative delivery channel is chosen in a later
governed decision; rejection does not auto-activate web push or email.

---
purpose: Govern the contained Microsoft To Do delivery spike, evidence, and two human gates.
audience: Owner, reviewers, contributors, operators, and coding agents.
authoritative-for: WP-11 Microsoft To Do scope, containment, lifecycle mapping, acceptance, and rejection.
update-triggers: The spike implementation, permission envelope, live evidence, scorecard, or channel decision changes.
related-docs: ../process/work-packages/WP-11-microsoft-todo-delivery-spike.md
---

# Microsoft To Do delivery spike

Status: guarded enablement and the mocked legacy continuity bridge are locally
verified; another live authorization and every real Graph read/write remain
blocked at the next human gate.
To Do is experimental, not an active Meridian delivery channel.

## Permission envelope and gate

The incremental authorization request must contain exactly these six delegated
OAuth/OIDC scopes, with no application permission:

`openid profile offline_access User.Read Calendars.Read Tasks.ReadWrite`

The OAuth/OIDC request is deliberately distinct from the Graph access token.
Meridian treats the returned Graph access token as opaque and never decodes,
inspects, or cryptographically validates it. It normalizes the token endpoint
response's `scope` metadata and requires exactly `User.Read Calendars.Read
Tasks.ReadWrite`. It rejects absent or malformed metadata, any missing expected
Graph permission, duplicates, and any unexpected permission. Requested OIDC
markers may be present in the response metadata but are not Graph permissions
and are not required to appear identically in Microsoft's consent display. The
consent ledger records both exact sets. Authentication instead relies on the
cryptographically validated ID token: signature, consumer issuer, audience,
expiry, nonce, and stable account identity must all pass.

WP-07 historical accounts retain the earlier Graph `/me.id`. If that value does
not directly equal the newly validated ID-token `oid`, the exact guarded
six-scope callback may use `User.Read` for one read-only
`GET /me?$select=id`. It compares only the returned ID with the historical ID;
it does not retain the profile response or read any To Do resource. A match
atomically migrates the stored continuity identity to the validated ID-token
`oid` with the encrypted token replacement and consent row. Mismatch,
unavailable/malformed evidence, or concurrent account change retains no token
or consent evidence. The normal five-scope route cannot invoke this bridge.

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

The existing normal connect action still initiates only the five-scope Stage-A
connection. A separate owner-confirmed control posts to guarded local route
`POST /api/integrations/microsoft/todo/consent`; the route creates only an
authorization URL and cannot call Graph. Entra permissions and live consent
remain prohibited until the owner approves the live second-gate execution.
The connection-status contract computes the guarded consent eligibility on the
server from local configuration plus an exact historical Stage-A requested and
Graph-permission envelope. Connected and locally disconnected Stage-A accounts
are eligible. The UI displays the exact six requested scopes and expected three
Graph permissions before enabling the redirect; it does not direct an eligible
disconnected owner through the ordinary five-scope reconnect route.

## Process and secret ownership

The Next.js web process exclusively owns the Microsoft OAuth client, encrypted
token access, dedicated-list/task creation, completion reconciliation, cleanup,
and emergency suspension. It receives `DATABASE_URL`, `MICROSOFT_CLIENT_ID`,
`MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`, and
`MICROSOFT_TOKEN_ENCRYPTION_KEY` from untracked `apps/web/.env.local`, which
Next.js loads directly. Values are never printed or copied into root `.env`.

The separate worker receives only its database environment. It consumes the
content-free `integration.*` and `delivery.*` envelopes and never constructs a
Graph adapter, decrypts a Microsoft token, or receives Microsoft/OpenAI
credentials. Live To Do creation and reconciliation do not run in the worker.

## Guarded local controls

All mutation controls require an authenticated owner session, same-origin CSRF,
an exact literal confirmation, no-store responses, and the exact six-scope
account state before token access. No date is compiled into the application.

| Control                             | Route                                             | Literal confirmation            |
| ----------------------------------- | ------------------------------------------------- | ------------------------------- |
| Incremental authorization URL       | `POST /api/integrations/microsoft/todo/consent`   | `ENABLE WP11 TODO CONSENT`      |
| One idempotent synthetic occurrence | `POST /api/integrations/microsoft/todo/first-day` | `CREATE WP11 FIRST-DAY TEST`    |
| Exact bound-task completion read    | `POST /api/integrations/microsoft/todo/reconcile` | `OBSERVE WP11 COMPLETION`       |
| Marker-verified task/list deletion  | `POST /api/integrations/microsoft/todo/cleanup`   | `DELETE WP11 SYNTHETIC OBJECTS` |
| Immediate local token erasure       | `POST /api/integrations/microsoft/todo/suspend`   | `SUSPEND WP11 GRAPH`            |

The first-day request also requires a future offset-aware instant and a UUID
idempotency key. The same key must be reused after a lost response. The server
requires at least 30 minutes' preparation, creates the canonical reminder first,
and permits only the constant synthetic title. Status responses disclose no
Microsoft identifier.

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

### Live execution instructions (not yet authorized)

1. In the existing Entra app registration, open **API permissions → Add a
   permission → Microsoft Graph → Delegated permissions**, select only
   `Tasks.ReadWrite`, and add it. Do not add/grant any application, mail,
   calendar-write, or shared-task-specific permission. The app's Graph delegated
   permission list must then be exactly `User.Read`, `Calendars.Read`, and
   `Tasks.ReadWrite`.
2. Keep the existing exact five-scope Microsoft account record. It may be
   connected or locally disconnected; no separate five-scope reconnect is
   needed. Meridian performs an in-place incremental upgrade under the same
   local integration account. The form-post callback validates state, expiry,
   PKCE, the signed ID token and nonce, exact token-response permission metadata,
   and `(consumer tid, oid)` account continuity. ID-token verification fetches
   the official consumers discovery metadata and uses its GUID issuer, JWKS URI,
   and allowed algorithms with a five-second clock tolerance. Display name and
   email are non-authoritative. A legacy direct-identifier mismatch may perform
   one separately approved ID-only `/me` read and must match the retained WP-07
   Graph ID; unavailable evidence requires owner review and mismatch rejects the
   account. Meridian then encrypts replacement access and refresh tokens and only
   then atomically replaces the old token pair (or the cleared disconnected
   fields). Any validation/exchange failure retains no candidate token and does
   not enable To Do.
3. Start PostgreSQL/migrations, web, and worker using the exact Homebrew and
   process-isolation commands in `docs/ops/local-dev.md`. Sign in locally and
   open <http://localhost:3000/settings/integrations>.
4. Select **Begin guarded Tasks.ReadWrite consent**. This invokes only
   `POST /api/integrations/microsoft/todo/consent` and redirects to Microsoft.
   The Microsoft screen must identify the intended personal account and show
   only the incremental ability to read and write the owner's tasks. Abort and
   use emergency suspension if it shows mail, calendar-write, application, or
   any other unexpected access.
5. After callback, require the Meridian consent ledger to show the exact six
   requested scopes and exact granted Graph permissions from response metadata: `User.Read`,
   `Calendars.Read`, `Tasks.ReadWrite`. Anything else fails closed.
6. Enter the separately approved Johannesburg wall time in the first-day field,
   confirm **Create one first-day test**, and do not change the generated
   idempotency key when retrying after an uncertain browser/network result. The
   web process creates the marker-owned private `Meridian` list and exactly one
   synthetic occurrence; the worker performs no Graph work.
7. Record separate elapsed observations for Graph creation, To Do visibility,
   phone notification, phone completion, and Meridian completion observation.
   Select **Observe test completion** only after completing the task on the
   phone. Repeat a deliberately interrupted submission with the same local
   idempotency key and require one external task.
8. On failure before disconnect, select **Clean up synthetic task and list**.
   Cleanup first proves the list marker and that the list contains either zero
   tasks or exactly the one locally bound marker-owned task. Any foreign or
   additional task blocks deletion. If cleanup cannot be proven, select
   **Emergency suspend all Microsoft Graph access** and manually retain the
   clearly labelled Microsoft objects for owner review.
9. The emergency control invokes
   `POST /api/integrations/microsoft/todo/suspend`, deletes both local token
   ciphertexts, marks the binding unmanaged, and performs no Graph request.
   Normal **Disconnect Microsoft** has the same token-erasure containment.

No task content, token, Microsoft list/task identifier, extension value, or
provider response body is printed or logged by these controls. Content-free
consent/activity evidence is the only retained execution evidence.

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
exact six requested OAuth/OIDC scopes, and the exact three Graph permissions
reported by token-response scope metadata. It stores no token,
code, PKCE secret, provider subject, or consent
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

---
purpose: Define processing classes and non-disclosure invariants.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../domain/journal.md
---

# Privacy

The owner chooses processing class before each journal create or revision. A
future local pre-screen may raise but never lower that choice. WP-05 performs no
remote processing.

| Class     | Storage/display                      | AI-intended repository |
| --------- | ------------------------------------ | ---------------------- |
| Standard  | Owner-scoped PostgreSQL and local UI | Current active only    |
| Sensitive | Owner-scoped PostgreSQL and local UI | Excluded               |
| Private   | Owner-scoped PostgreSQL and local UI | Excluded invariant     |

The query applies `processing_class = 'standard'` and active/current joins in
PostgreSQL; it never fetches disallowed rows for caller filtering. A later
Sensitive route needs a separate port, consent, and threat-model change.

Bodies and hashes are forbidden from ordinary logs, events/outbox payloads,
activity items, URLs, and errors. They appear only in authenticated journal
responses and owner-scoped revision storage. Private remains visible to its
owner; it means local display only.

A deletion request does not claim erasure. Until later governed propagation
completes, the entry and revisions remain with `deletion_requested` status.

Worker jobs are not a second evidence store: they contain opaque IDs and event
type only. The worker retrieves the already content-free event envelope through
owner-scoped persistence. Structured observations and health responses permit
state, attempt, duration, IDs, type, and stable error code; they prohibit event
payloads, raw exceptions, database URLs, entry bodies, and hashes. pg-boss
administrative data is not exposed through the application API.

Microsoft processing in WP-07 is limited to OAuth protocol data and Graph
profile `id` plus `displayName`. Tokens are encrypted; the public/API status
contains only connection state, display label, exact scopes, timestamps, and
append-only consent actions. No journal content or calendar item is transmitted
or retrieved. Consent/event payloads are content-free. Microsoft calendar data
processing begins only in WP-12 after its own governed implementation.

WP-08 introduces an external-model route with a policy check before every
adapter call. Private remains local-only with no override. Sensitive requires
explicit per-invocation external-LLM consent; Standard is allowed. Deterministic
operations remain code and never cross the gateway. The paid task-routing matrix
uses synthetic fixtures and one local OpenAI key only. Raw outputs stay local;
observations/reports omit prompts and outputs; requests set `store: false`.
Dormant external-provider adapters are not activated. Provisional model routes
can create only owner-confirmed Triage proposals or classification output and
never direct mutation. Missing provenance, deterministic validation failure,
explicit uncertainty, invalid schema, or abstention fails closed. Provider
retention facts are date-stamped in the registry and must be re-verified.

WP-09 stores proposal payloads but does not duplicate source text. Each proposal
references an owner-matching immutable revision and integer source span through
both the proposal row and authoritative derivation link. Only current Standard
revisions pass the application boundary. Pending proposals become stale when
their source is revised. Proposal events/outbox payloads are limited to ID,
type, and status; list/decision responses are authenticated, no-store, and
owner-RLS scoped. Triage decisions cannot create downstream resources or
external effects in this package. The optional OpenAI request occurs only after
the owner selects the journal action and confirms the transfer; it uses the
current Standard revision, `store: false`, Sol/`none`, strict bounded output,
transient exact-span text validation, and sanitized content-free observations.
The returned span text is discarded before persistence. Automated tests substitute a local
adapter and send no owner content to a provider.

WP-10 stores task titles/notes and reminder purpose/time/recurrence only in
forced-RLS canonical rows and authenticated no-store responses. Command
receipts contain opaque target identity and lifecycle, not a content snapshot.
Action event/outbox payloads contain only target ID/type/state and receipt ID.
The bounded reminder parser is deterministic local code, so it sends no content
to a model or delivery provider. Accepted proposals retain owner-scoped source
proposal and exact revision/span provenance. Microsoft processing and scopes do
not change; reminder delivery remains `undecided` behind WP-11.

WP-18 retains owner-supplied originals in an ignored local content-addressed
object root and metadata, parsed text, chunks, claims, and citations in
forced-RLS PostgreSQL tables. Private and Sensitive knowledge text has no
external-processing route; Standard classification alone does not authorize a
transfer. Parsing and extraction are local and deterministic. Knowledge events
contain only IDs and lifecycle enums, never source/claim text, metadata,
filenames, hashes, object references, or exact locators. A deletion request
freezes the source but makes no erasure claim; WP-22 must prove removal from
object storage, database relationships, exports, and backup lifecycle.

WP-19 local Recall applies Standard/current/active eligibility in PostgreSQL
before personal content becomes a result. External search requires Standard
chunks from a latest reviewed/reference-only source that is not deletion
pending, rejected, superseded, retracted, or under expression of concern.
Personal and external rows are ranked and capped separately. Sensitive and
Private content is never fetched for later caller-side filtering. Context
manifests contain only policy plus ordered owner-scoped references; query text,
query hash, excerpts, and copied content are not retained. Retrieval events are
content-free counts/enums/IDs.

No hosted embedding route is active. The database can store immutable
model/version/dimension-tagged vectors, but a trigger requires an exact
owner-matching Standard source and matching content hash. The web runtime
composes a disabled adapter, and browser acceptance asserts zero vector rows.
Any provider selection, paid evaluation, query/source transmission, or backfill
requires explicit owner approval and a renewed privacy/threat review.

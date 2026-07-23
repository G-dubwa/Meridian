---
purpose: Summarise the modular monolith and its major runtime boundaries.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Architecture overview

Meridian Foundation is a modular monolith with two runtime processes and one
PostgreSQL database:

`Next.js web → application → domain ports ← PostgreSQL/auth adapters`

`Node worker → application → domain ports ← PostgreSQL/pg-boss adapters`

The web owns same-origin REST, local-owner cookie/CSRF presentation, Journal,
Security, and System health. The worker owns polling/consumption hosting only.
Application services orchestrate transactions and policies through domain-owned
ports. Domain imports no Meridian package. Infrastructure implements ports and
is constructed only in exact process composition roots.

PostgreSQL stores canonical resources, immutable entry revisions, events,
outbox, authentication technical state, and pg-boss jobs. State/event/outbox
writes are atomic. Dispatch job insertion/in-flight state is also atomic.
Content repositories use forced RLS with transaction-local owner scope; the
pre-authentication singleton credential boundary remains narrow and server-only.

The web composition root may optionally construct the WP-07 Microsoft adapter,
but no Alpha capability may assume it is configured or connected. The
application owns connection/refresh/disconnect policy through domain ports; the
adapter owns consumers OAuth HTTP, S256 PKCE, and AES-256-GCM envelopes. A
one-time technical OAuth session bridges the provider callback; persistent
integration accounts and consent history remain owner-RLS scoped. No Microsoft
type enters the domain and no Graph request exists outside the adapter. WP-11
and WP-12 are deferred; their experimental/provider work is not active on
`main`.

WP-08 adds a provider-neutral model invocation port. Application policy rejects
Private and unconsented Sensitive processing before adapter invocation.
`infrastructure-models` contains direct HTTP adapters while
`prompts` owns versioned instructions/output contracts. WP-09 optionally
composes the OpenAI adapter when `OPENAI_API_KEY` is present and exposes only an
owner-confirmed, CSRF-protected bounded-extraction action for the current
Standard revision. There is no automatic invocation. Application policy
activates only deterministic code, Sol/`none` bounded extraction to an
owner-confirmed Triage proposal, and Terra/`none` bounded classification without
direct mutation. Ambiguous and later task classes fail closed as inactive.

WP-09 adds canonical proposal resources tied to an exact current Standard
revision and source span. Application validation caps extraction at seven,
rejects invalid provenance and prohibited authority classes, applies
transaction-scoped dedupe locks, and persists proposal/resource/derivation plus
content-free event/outbox atomically. The owner-only Triage API records
accept/edit/dismiss decisions; these are review records, not downstream domain
mutation. Revising the source marks pending proposals stale in the journal
transaction.

WP-13A composes a provider-independent Today application service over
canonical tasks/reminders plus owner-entered agenda blocks and daily priority
references. Local lifecycle receipts make completion, dismissal, and priority
selection reversibly auditable with exact-version checks. `CalendarPort` and
`ReminderDeliveryPort` remain uncomposed domain boundaries; every Today
response declares external delivery inactive.

WP-14 adds canonical owner goals and registered resource edges. Load guidance
is deterministic active-count arithmetic against an owner-configurable soft
guide. Dependency explanations read canonical edges and never infer execution,
success probability, or personal quality. The package is entirely local and
does not compose a model, calendar, reminder, or other provider.

ADR-0001/0002 govern modularity/dependencies, ADR-0003 persistence/RLS,
ADR-0004 authentication, ADR-0005 journal revision history, ADR-0006 reliable
worker processing, ADR-0007 Microsoft OAuth/token custody, and ADR-0008 the
model gateway/evidence gate. ADR-0010 records the provider-independent Local
Alpha sequence. External notifications, calendar data sync, and provider
effects remain inactive until later governed packages.

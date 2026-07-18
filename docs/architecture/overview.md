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

The web composition root optionally constructs the Microsoft adapter. The
application owns connection/refresh/disconnect policy through domain ports; the
adapter owns consumers OAuth HTTP, S256 PKCE, and AES-256-GCM envelopes. A
one-time technical OAuth session bridges the provider callback; persistent
integration accounts and consent history remain owner-RLS scoped. No Microsoft
type enters the domain and no Graph request exists outside the adapter.

ADR-0001/0002 govern modularity/dependencies, ADR-0003 persistence/RLS,
ADR-0004 authentication, ADR-0005 journal revision history, ADR-0006 reliable
worker processing, and ADR-0007 Microsoft OAuth/token custody. Models,
notifications, calendar data sync, and external effects remain adapters
activated only by later governed packages.

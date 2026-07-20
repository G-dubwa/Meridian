---
purpose: Plan and record the gated WP-11 Microsoft To Do delivery spike.
audience: Owner, reviewers, contributors, operators, and coding agents.
authoritative-for: WP-11 implementation boundary, verification, gates, and completion state.
update-triggers: WP-11 code, mocked evidence, live permission approval, real-device evidence, or channel decision changes.
related-docs: ../../integrations/microsoft-todo-spike.md
---

# WP-11 — Microsoft To Do delivery spike

## Status and dependency

- Status: Mocked implementation complete; live acceptance pending.
- Branch: `wp-11-microsoft-todo-delivery-spike`.
- Dependency: WP-10 commit `718bc897939017a641e6c3ee20f593c9c7c35516`.
- Current gate: no incremental consent, Entra change, live Graph access, list
  creation, task mutation, or device test without separate owner approval.

## Implemented mocked boundary

WP-11 adds exact requested-scope and Graph-token permission envelopes, local
`scp` validation, dormant incremental-consent orchestration, a provider-neutral
To Do gateway port, a constrained `/me/todo/lists` Microsoft adapter, atomic
list-plus-extension attempt with baseline recovery, list/task ownership
markers, canonical occurrence projection, uncertain-create duplicate recovery,
forced-RLS bindings and operation records, disconnect/revocation containment,
and content-free activity events.

The existing Stage-A connect route remains five-scope only. No route invokes
the dormant six-scope flow or spike service, so the implementation cannot make
a live To Do request. The `.env` files and Entra registration are unchanged.

## Verification and acceptance boundary

Mocked tests must prove exact six-scope request construction; exact three-scope
Graph `scp` acceptance; unexpected/missing scope rejection; five-scope refusal
before token access; atomic extension request; fallback/uncertain recovery; one
create despite a recovered lost response; owner/non-shared/list/marker
containment; stored-list URL restriction; Johannesburg-to-Microsoft time-zone
mapping; content-free events; forced RLS; migration upgrade; and no external
provider I/O.

WP-11 is not complete until the separately approved plan in the integration
document passes the live consent/device gate and seven-day scorecard. WP-12 may
proceed independently during observation, but To Do remains experimental and
must not be selected as the active channel prematurely.

`pnpm check` passed on Node.js 24.18.0 and pnpm 11.14.0: formatting, lint,
strict typecheck, 121 modules/236 dependencies plus the negative fixture,
Drizzle consistency, 17 unit files/83 tests, one isolated PostgreSQL file/9
tests, 9 local live-server owner journeys, 99 governed Markdown documents with
a current generated dictionary, and all workspace production builds. Microsoft
was unconfigured in live-server acceptance, and all provider fixtures were
mocked/synthetic; cost and external requests were USD 0.00/zero.

## Rollback

Before live consent, rollback is code/config only: keep the five-scope route,
remove the dormant spike wiring with a forward migration if necessary, and
retain audit/migration history. After any later live test, disconnect first and
offer separately confirmed cleanup only for stored, marker-verified Meridian
objects. Never delete canonical reminder intent during adapter rollback.

---
purpose: Map risks and work-package changes to verification layers.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Testing strategy

Meridian verifies each risk at the lowest useful layer and keeps a live-path
test for boundaries whose behaviour depends on a real runtime.

| Layer                         | Purpose                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| Domain/application unit tests | Invariants, policies, schemas, and orchestration without I/O.           |
| Dependency rules              | Architectural direction plus deliberately failing fixtures.             |
| Database integration tests    | PostgreSQL migrations, constraints, RLS, and transactions.              |
| Worker integration tests      | Real pg-boss dispatch, concurrency, retry, dead letter, restart safety. |
| Playwright API/UI journeys    | Real Next.js, cookies, CSRF, sessions, recovery, and lockout.           |
| Document/schema checks        | Headers, links, generated dictionary, and migration snapshots.          |
| Production builds             | Package exports and deployable application compilation.                 |

`pnpm check` is the required local and CI gate. Authentication acceptance uses
an isolated PostgreSQL cluster, applies every committed migration, builds the
five runtime packages, starts a live Next.js server on a random local port, and
runs serial Playwright request journeys. It proves one-owner
bootstrap, successful and failed login, logout, renewal, password change,
one-time recovery, explicit revocation, and lockout. Database rows are inspected
to prove Argon2id password storage and hashed-only recovery/session secrets.

The WP-05 journey creates/revises Standard evidence, inspects both revisions,
creates Private evidence, invokes the real owner-scoped AI query, and proves only
Standard returns. Integration tests prove content-free events/outbox,
correlation retry, update-trigger rejection, privacy invalidation, and upgrade.

WP-17 unit tests prove literal owner confirmation, partial-duration semantics,
the complete E1–E6 confidence mapping, and strict local-week parsing. The live
PostgreSQL suite proves forced RLS and owner isolation, E1 creation/retraction,
post-block E2, elapsed E5 with zero progress credit, idempotency, content-free
audit, and deterministic Weekly aggregation. The authenticated browser journey
uses only synthetic local records, requires CSRF, rejects missing owner
confirmation, displays the evidence boundary, and proves no provider event.

WP-06 unit tests prove content-free job/observation schemas, idempotent duplicate
completion, retry, and terminal classification. The live database suite installs
real pg-boss, races two dispatchers, proves five outbox rows become five jobs,
then completes four events and retries one controlled failure three times into
matching Meridian/pg-boss dead-letter state. Playwright proves health is denied
without a session and presents content-free owner state after journal writes.

WP-07 unit tests use a synthetic HTTP adapter to prove consumers-only exact
scopes, S256 PKCE, AES-256-GCM context binding, minimal profile reads, sanitized
failures, environment policy, and API token non-disclosure. Live PostgreSQL
tests prove state replay rejection/verifier erasure, ciphertext custody, RLS,
append-only consent, refresh rotation, disconnect, reauthorization, and atomic
events. Playwright runs with Microsoft variables explicitly absent, so automated
acceptance cannot grant consent or contact Microsoft. A visible owner login and
disconnect is a separate mandatory live gate.

WP-08 unit tests prove deterministic bypass, task-to-tier mapping, bounded
escalation, privacy rejection before I/O, content-free observations, provider
request semantics, sanitized failures, strict prompt/output contracts, family
cost calculation, abstention, and over-extraction scoring. The live matrix is
outside `pnpm check`: it needs only local `OPENAI_API_KEY`, explicit paid
confirmation, and a hard owner-approved ceiling, and it writes only an ignored
aggregate report.

WP-09 synthetic tests exercise authority precedence and reject
clarification-with-proposals over-extraction without provider I/O. Domain tests
cover strict source provenance, dedupe and hypothesis rules. Live PostgreSQL
tests apply the proposal migration, prove forced owner isolation, persist the
proposal and derivation atomically, record owner acceptance, and carry the two
new content-free events through the existing concurrent dispatch/dead-letter
path. Playwright proves unauthenticated Triage rejection and the authenticated
empty Triage API/UI through the live server.

Tests may use synthetic fixture identifiers and passphrases only. Test output,
snapshots, traces, and screenshots must not contain credentials, recovery codes,
session cookies, journal content, or production data. A failed security journey
is a release blocker, not a candidate for retries that hide nondeterminism.

INFRA-01 adds supervisor unit tests for strict/stale handoffs, scope and secret
rejection, closed stdin, process-tree timeout, exclusive locks, atomic state,
and append-only history. `pnpm agents:pilot` is a separate offline, synthetic
process acceptance: it exercises build, QA finding, repair, reconstructed
supervisor resume, exact-commit retest, final verification, and clean worktree
shutdown. It is not a live model evaluation and cannot authorize automatic
merge.

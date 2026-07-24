---
purpose: Record WP-19 local-foundation scope, evidence, exclusions, and remaining human gate.
audience: Owner, contributors, reviewers, and coding agents.
authoritative-for: WP-19 provider-independent checkpoint and incomplete activation status.
update-triggers: The checkpoint is verified, semantic evaluation is approved, or WP-19 completes.
related-docs: ../../ai/retrieval.md
---

# WP-19 — Embeddings, retrieval, and context manifests

## Status and dependency

- Status: local provider-independent checkpoint implemented; WP-19 remains
  open at the hosted-embedding/data-transmission gate.
- Branch: `wp-19-retrieval-context-manifests`.
- Dependency: verified integrated WP-18 commit
  `5215aa3d8fab08b202006f71bb3f2b2812511b0e`.

## Checkpoint scope

The checkpoint adds local Standard-only full-text retrieval over separated
personal and external evidence lanes; deterministic lane ranking; owner-only
Recall API/UI; immutable inspectable context manifests; content-free events;
provider-neutral embedding contracts; immutable variable-dimension pgvector
persistence; database-enforced source class/hash/ownership rules; a disabled
runtime adapter; and a deterministic synthetic fixture adapter proving hybrid
search without a provider.

## Exclusions and remaining gate

No hosted provider/model is selected. No credential, paid request, journal
transmission, source transmission, query transmission, production embedding,
backfill, approximate vector index, model response, automatic surfacing,
summary, synthesis, protocol, recommendation, Microsoft work, destructive
operation, or production deployment is in scope.

WP-19 is not complete and must not be integrated as a completed package until
the owner reviews the exact hosted route and evidence plan. The decision record
`DN-0001-hosted-embedding-route.md` is the next mandatory gate.

## Acceptance and rollback

Acceptance requires the complete pinned-runtime repository gate. It must prove
forced RLS, two-owner isolation, Standard-only source triggers, exact lane
separation, current/latest-source filtering, inactive-runtime semantics,
synthetic hybrid behavior, immutable content-free manifests, no content in
audit events, no local environment loading, and zero external/provider calls.

Rollback removes Recall navigation/routes and stops new context manifests.
Existing manifests/vectors remain immutable for forward reconciliation and
WP-22 governed deletion. No provider cleanup is required because none is
active.

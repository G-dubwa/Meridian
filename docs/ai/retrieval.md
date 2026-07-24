---
purpose: Define privacy-filtered retrieval, embedding custody, and deterministic context assembly.
audience: Owner, contributors, reviewers, and coding agents.
authoritative-for: WP-19 retrieval lanes, eligibility, ranking, context manifests, and activation boundary.
update-triggers: Retrieval policy, embedding route, ranking, privacy eligibility, or context-manifest contract changes.
related-docs: ../knowledge/source-model.md
---

# Retrieval, embeddings, and context manifests

## Active local foundation

Owner-initiated Recall uses PostgreSQL full-text search over two independent
lanes:

- **Personal evidence:** only the current revision of an active journal entry
  whose processing class is Standard.
- **External evidence:** only Standard chunks from the latest eligible revision
  of a reviewed or reference-only source. Deletion-pending, rejected,
  superseded, retracted, and expression-of-concern sources are excluded.

Each lane is ranked independently and capped independently. Results remain
labelled personal or external evidence; scores are retrieval signals, never
authority, truth, behavioural patterns, or advice. Sensitive and Private
content fail closed. Recall is an owner-initiated T0 local computation and
never proactively surfaces content.

## Context manifests

Every preview atomically stores an immutable owner-scoped context manifest.
The first item identifies policy version `standard-separated-lanes-v1`; later
items retain ordered resource/revision/chunk identifiers, content hash,
retrieval methods, lane, and score. The query, excerpts, source bodies, and
copied citation text are not stored in the manifest or audit event.

The UI exposes “What informed this preview?” with local source links. A future
material model response must use the same manifest contract with purpose
`material_response`; no active model workflow does so yet.

## Embedding boundary

The database has immutable model/version/dimension-tagged pgvector rows for
personal and external lanes. A database trigger requires exact owner-matching
Standard source content and matching content hash. Private and Sensitive
embeddings are rejected even if application validation is bypassed. External
source deletion requests also reject new vectors.

No hosted embedding model, provider, credential, worker, backfill, or runtime
adapter is active. The composed web runtime uses `DisabledEmbeddingAdapter`.
Tests use `DeterministicFixtureEmbeddingAdapter`; its 16-dimensional token hash
is synthetic verification machinery, not a production semantic model.

The vector column is deliberately variable-dimension and unindexed. Selecting
a hosted model, transmitting any journal/source/query content, incurring paid
cost, choosing retention/region policy, running an evaluation, backfilling, and
adding a dimension-specific approximate index all remain behind the WP-19
human gate.

## Future hybrid ranking

The repository can combine lexical and same-model semantic results using fixed
weights (0.55 full text, 0.45 semantic) while retaining both method labels.
Activation requires a broader synthetic/adversarial retrieval evaluation,
privacy evidence, abstention/empty-result behaviour, cost and latency limits,
model-migration dual-write/backfill rules, and an owner-approved provider route.
No result may cross evidence lanes or bypass source eligibility.

## Failure and rollback

Missing configuration leaves semantic retrieval inactive; local full-text
Recall continues. Malformed queries, cross-lane references, invalid scores,
dimension mismatch, zero vectors, stale/deletion-pending external evidence, and
non-Standard source attempts fail closed. Rollback hides Recall and stops
manifest creation; immutable rows remain for a forward migration and WP-22
governed deletion.

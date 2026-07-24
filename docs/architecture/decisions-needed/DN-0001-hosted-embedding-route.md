---
purpose: Record the unresolved provider and data-transmission choice required to activate WP-19 semantic retrieval.
audience: Owner, reviewers, security reviewers, and implementers.
authoritative-for: The mandatory gate before any hosted embedding request or backfill.
update-triggers: The owner approves, rejects, or changes the embedding route.
related-docs: ../../ai/retrieval.md
---

# Decision needed — hosted embedding route

## Decision

Select or reject a hosted embedding route for Standard-only personal and
external content. No provider is selected by the local WP-19 checkpoint.

## Evidence required before approval

- exact provider, model ID/version, vector dimension, region, retention and
  training-use terms;
- exact content classes and fields transmitted, with Sensitive and Private
  remaining excluded;
- synthetic/adversarial retrieval evaluation covering relevance, false
  positives, empty/abstention cases, lane separation, latency and estimated
  cost;
- hard paid-evaluation and backfill ceilings;
- batching, retry, uncertain-outcome, rate-limit and content-free observation
  rules;
- model migration dual-write/backfill comparison and rollback;
- deletion/redaction propagation through provider artefacts and local vectors;
- whether measured scale justifies a dimension-specific pgvector index.

## Mandatory gate

Owner approval is required before adding credentials, making a paid request,
transmitting a query/journal/source chunk, generating production vectors,
starting a backfill, or activating semantic ranking. Approval of evaluation
does not imply production activation.

## Safe default

Keep the runtime embedding adapter disabled. Continue local Standard-only
full-text Recall and immutable reference-only context manifests.

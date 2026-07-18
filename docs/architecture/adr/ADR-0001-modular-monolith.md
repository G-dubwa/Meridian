---
purpose: Record the initial modular-monolith architecture decision.
audience: Owner, contributors, and coding agents.
authoritative-for: Deployment topology and module isolation strategy.
update-triggers: Runtime topology or module isolation materially changes.
related-docs: ../overview.md
---

# ADR-0001 — Modular monolith

- Status: Accepted
- Date: 18 July 2026
- Supersedes: None

## Context

Meridian is a single-owner application with substantial domain, privacy, and provider boundaries but no measured need for distributed services. Solo-maintainer operational burden is a primary risk.

## Decision

Use a TypeScript modular monorepo deployed as one Next.js web process and one Node.js worker process. Share domain and application packages in-process. PostgreSQL will be the sole primary datastore when introduced in WP-03.

## Consequences

Module boundaries must be mechanically enforced because process boundaries do not enforce them. Deployment, local development, transactions, and rollback remain simple. A microservice requires measured scaling or isolation need and a superseding ADR.

## Rollback

Before persistence exists, revert the WP-01 commit. Later changes use a superseding ADR and staged extraction without weakening domain or privacy boundaries.

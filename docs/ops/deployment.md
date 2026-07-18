---
purpose: Define release deployment and rollback.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Deployment

## Foundation topology

Foundation is independently buildable as one Next.js web process, one Node
worker process, and one PostgreSQL 18/pgvector database. Both runtimes use the
same application schema; pg-boss owns `pgboss` in that database. HTTPS reverse
proxy, off-box encrypted backups, monitoring, domains, and production secret
custody remain required production controls, not automated WP-06 actions.

## Ordered rollout

1. Take and verify a backup; record the current commit and schema versions.
2. Build every workspace package on pinned Node/pnpm.
3. Stop the worker, then stop or quiesce web writes.
4. Apply Meridian forward migrations with the migration credential.
5. Start the worker once with the migration credential to install/upgrade
   pg-boss, stop it, then grant the runtime role only required `pgboss` access.
6. Start web and worker with non-owner runtime credentials; verify `/health`,
   login/session, Journal, and Settings > System health.
7. Confirm a synthetic Standard entry produces a content-free event/outbox and
   reaches succeeded before accepting the release.

Production deployment, domain purchase, and infrastructure expenditure are a
mandatory owner gate. This document defines deployability but authorizes no
external environment change.

## Rollback

Stop worker and web. Never reverse DDL or delete queue evidence. Restore the last
verified backup into fresh PostgreSQL, deploy its matching commit, validate
owner/session/resource/outbox counts, then switch traffic deliberately.

---
purpose: Define the infrastructure-ms-graph package boundary.
audience: Contributors and coding agents.
authoritative-for: infrastructure-ms-graph responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# infrastructure-ms-graph

Responsibility: Personal-account Microsoft OAuth authorization-code/PKCE,
minimal `/me` profile access, refresh, and context-bound token encryption.

Exclusions: Provider-independent policy and presentation; calendar event reads,
calendar writes, mail, To Do, shared calendars, and application permissions.

Allowed imports: May import domain ports and application adapter contracts.

Tests: WP-07 unit tests use synthetic HTTP to prove consumers-only exact scopes,
PKCE, encryption, refresh failure classification, and response minimization.
Live PostgreSQL tests cover custody and lifecycle through application ports. A
real login remains an explicit owner gate and is never part of automated CI.

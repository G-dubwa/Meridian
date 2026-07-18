---
purpose: Define cryptographic authentication adapters.
audience: Contributors and coding agents.
authoritative-for: Argon2id, opaque-secret, clock, and UUID adapter responsibilities.
update-triggers: Authentication cryptography, token format, package boundary, or tests change.
related-docs: ../../docs/security/threat-model.md
---

# infrastructure-auth

Responsibility: Argon2id password hashing and verification, cryptographically random opaque session/CSRF/recovery material, constant-time secret comparison, system time, and UUID generation.

Exclusions: Authentication policy, persistence, HTTP/cookie handling, UI, provider identity, and logging.

Allowed imports: Domain ports and security-focused runtime libraries only. Raw secrets returned by this package are transient and must never enter logs, database columns, event payloads, or ordinary API response bodies.

Tests: Application fakes cover orchestration; integration and Playwright flows exercise the real Argon2id and secret adapters.

---
purpose: Define the infrastructure-models package boundary.
audience: Contributors and coding agents.
authoritative-for: infrastructure-models responsibility, exclusions, imports, and tests.
update-triggers: Package responsibility, dependency rules, or test strategy changes.
related-docs: ../../docs/architecture/module-map.md
---

# infrastructure-models

Responsibility: Thin provider HTTP adapters implementing the model-inference
port. WP-08 supplies an OpenAI Responses adapter for evaluation and the
restricted Alpha routes, plus a date-stamped Luna/Terra/Sol cost registry.
Anthropic Messages and Gemini
GenerateContent adapters remain dormant compatibility code with no key or paid
evaluation requirement.

Exclusions: Prompts, domain truth, and provider-specific policy leakage.

Allowed imports: Domain contracts only. Prompts are supplied through the
provider-neutral request rather than imported by adapters.

Tests: Mock HTTP tests prove explicit reasoning, request shape, bounded output,
local JSON parsing, usage/cost mapping, optional configuration, and sanitized
failures. No automated test contacts a provider.

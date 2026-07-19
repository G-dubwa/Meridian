---
purpose: Record date-stamped candidate and active model decisions.
audience: Owner, contributors, and coding agents.
authoritative-for: WP-08 GPT-5.6 candidates, factual verification, task roles, and activation state.
update-triggers: A model fact, task route, evaluation result, provider status, or active selection changes.
related-docs: bakeoff.md
---

# Model registry

Verified 19 July 2026 against [OpenAI model guidance](https://developers.openai.com/api/docs/guides/model-guidance?model=gpt-5.6) and the [model catalogue](https://developers.openai.com/api/docs/models). Activation is restricted to the provisional Alpha routes below.

| Tier  | Model           | Context / output | Input / cached / output USD per 1M tokens | Alpha role                                                 | Reasoning | State                    |
| ----- | --------------- | ---------------: | ----------------------------------------: | ---------------------------------------------------------- | --------- | ------------------------ |
| Luna  | `gpt-5.6-luna`  |     1.05M / 128K |                           $1 / $0.10 / $6 | Evaluation adapter only                                    | N/A       | Dormant                  |
| Terra | `gpt-5.6-terra` |     1.05M / 128K |                       $2.50 / $0.25 / $15 | Bounded classification/proposal output; never direct write | `none`    | Provisional Alpha active |
| Sol   | `gpt-5.6-sol`   |     1.05M / 128K |                          $5 / $0.50 / $30 | Bounded extraction to owner-confirmed Triage proposal only | `none`    | Provisional Alpha active |

All three support Responses, structured outputs, and explicit reasoning effort. Requests use `store: false`; API data is not used for training by default, while abuse-monitoring retention can apply as described in [OpenAI data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint). Re-verify availability, pricing, limits, retention, region, and deprecation before each paid run and activation.

There is no automatic model fallback. Ambiguous and later task classes are inactive. Anthropic and Google adapters remain dormant provider-neutral compatibility code with no key requirement or paid evaluation in WP-08. Consider an external provider only after broader evaluation demonstrates material need or OpenAI cannot meet a documented operational requirement.

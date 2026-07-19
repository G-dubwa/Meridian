# Model evaluations

Synthetic, versioned evaluation fixtures and deterministic scorers live here.
WP-08 measures every GPT-5.6 family member by task class. No diary content,
provider payload, or raw model output may be committed. Local aggregate reports
use `evals/results/*.local.json`, which Git ignores.

`--smoke-test-luna` selects exactly the synthetic
`bounded-reflection-classification` fixture and Luna; it does not run the full
matrix.

See `docs/ai/evals.md` for the paid-run gate and score definitions.

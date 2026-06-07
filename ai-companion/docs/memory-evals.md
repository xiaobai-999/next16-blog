# Memory Evals

Run the memory eval runner from the repository root:

```bash
pnpm memory:eval
```

The runner reads all JSON cases in `packages/evals/memory` and writes the latest report to:

```text
packages/evals/memory/results/latest.json
```

`results/` is ignored because it is generated output.

## Result Types

```text
passed:
  Deterministic checks passed.

failed:
  A deterministic rule failed and should block release.

manual:
  The case requires model output, extractor execution, retriever execution, or human review.
```

## Current Scope

The first runner validates deterministic rules for:

- JSON case shape.
- Expired, deleted, archived, pending, and out-of-scope memory filtering.
- Basic retrieval keyword sanity checks.
- Memory usage prompt guardrail presence.

Model-backed extraction, conflict confirmation, and final assistant response quality remain manual review until a service-level eval harness is added.

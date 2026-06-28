# Eval Schema

Use this schema shape for `evals/evals.json`. It is intentionally simple enough for the LLM to translate requirements into JSON and for scripts to validate.

```json
{
  "skill_name": "skill-name",
  "version": 1,
  "cases": [
    {
      "id": "trigger-positive-1",
      "type": "positive-trigger",
      "prompt": "User task prompt",
      "expected_signal": "What should happen",
      "assertions": [
        {
          "name": "should-trigger",
          "method": "external_judgment",
          "expect": "yes",
          "criteria": "The skill should be loaded or explicitly selected."
        }
      ],
      "split": "dev",
      "source": "manual",
      "notes": ""
    }
  ]
}
```

## Required Fields

- `skill_name`: target skill name.
- `cases`: list of eval cases.
- `id`: stable case id.
- `type`: eval type.
- `prompt`: user-facing task.
- `expected_signal`: observable target behavior.
- `assertions`: script-executable checks or external judgment placeholders.
- `split`: `dev`, `holdout`, `regression`, or `flaky`.

## Assertion Methods

- `contains`
- `not_contains`
- `regex`
- `file_exists`
- `json_path`
- `script_check`
- `path_hit`
- `fact_coverage`
- `external_judgment`
- `human_preference`

## Runner Contract

Use `scripts/run-evals.ts` for the deterministic first pass:

```bash
bun scripts/run-evals.ts <evals/evals.json> --iteration=baseline
```

The runner can execute these methods directly:

- `contains`
- `not_contains`
- `regex`
- `file_exists`
- `path_hit`
- `fact_coverage`
- `script_check`

The runner marks these methods as `pending` unless an external evaluator supplies evidence:

- `json_path`
- `external_judgment`
- `human_preference`

Pending is not pass. A gate with pending critical assertions is `needs-human-review`.

LLM review can be used only by writing explicit evidence into `judgments.json`; it is external evidence, not automatic execution.

External evaluator, LLM-review, or human judgments can be supplied with:

```bash
bun scripts/run-evals.ts <evals/evals.json> --judgments-file=judgments.json
```

`judgments.json` may be either an array or an object with a `judgments` array:

```json
{
  "judgments": [
    {
      "case_id": "behavior-audit-1",
      "assertion": "diagnosis-quality",
      "status": "pass",
      "evidence": "Reviewer found purpose, primary intent, eval strategy, mutation layer, and guardrail correct."
    }
  ]
}
```

Judgments are trace evidence. They must explain the observed behavior, not just provide a score.

Each run writes:

- `runs/<iteration>/eval-<id>/trace.json`;
- `logs/results.tsv`.

## Split Rules

- `dev`: visible during optimization.
- `holdout`: hidden until strict eval.
- `regression`: known failures that must not return.
- `flaky`: noisy or disputed cases requiring repeated run or human review.

Do not use generated evals as gate-critical holdout without human or high-confidence review.

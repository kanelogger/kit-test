# Description Trigger Harness

Use this harness when the main failure is trigger accuracy: the skill loads when it should not, fails to load when it should, or competes with adjacent skills.

Do not use it for ordinary content quality, output style, or workflow failures unless trigger selection is the blocking issue.

## Purpose

Optimize the frontmatter `description` with repeatable evidence instead of one-off wording advice.

The target metric is boundary accuracy:

- should-trigger prompts select the skill;
- should-not-trigger prompts do not select the skill;
- adjacent-confusion prompts route elsewhere;
- holdout and regression cases do not get worse.

## Case Set

Start with about 20 realistic prompts:

- 8-10 should-trigger cases;
- 8-10 should-not-trigger cases;
- 2-4 adjacent-confusion cases when another skill is likely to compete.

Each case must include:

```json
{
  "id": "csv-amount-cleanup-positive",
  "query": "This CSV has dollar signs and commas in the amount column. Convert it to pure numbers and write a cleanup report.",
  "should_trigger": true,
  "reason": "The task asks for structured CSV cleanup and a report."
}
```

Use real user wording. Include file types, task verbs, adjacent domains, and negative examples that share vocabulary with the target skill.

Bad negative examples are too easy. Prefer near misses:

- planning a dashboard from CSV metrics;
- writing SQL for data exploration;
- explaining spreadsheet formulas;
- cleaning prose in a report about CSV data.

## Split

Split cases before mutation:

- `dev`: visible while proposing description changes, about 60%;
- `holdout`: hidden until strict evaluation, about 40%;
- `regression`: known historical failures, always included in strict evaluation;
- `flaky`: noisy or disputed cases, never gate-critical without repeated evidence.

Do not move a failed holdout case into dev during the same optimization round. Add it to regression only after the round is complete and the failure is accepted as real.

## Execution

Run each dev case multiple times because routing can be noisy.

Default:

- `repeats`: 3;
- decision threshold: at least 2 of 3 runs match expected behavior;
- record raw output stream or trace;
- record whether the output indicates the target skill loaded.

Recommended runner setup:

1. Create an isolated temporary project.
2. Install or link only the candidate fake skill being tested.
3. Give the fake skill a unique marker name.
4. Run the real agent CLI for each query, for example `claude -p` when Claude is the target runtime.
5. Capture the raw output stream and trace for every repeat.
6. Mark `triggered=true` only when the stream or trace contains the unique skill marker or an explicit loaded-skill event.

For CLI-based routing tests, the observable signal can be a marker in the output stream, such as the skill name or an explicit loaded-skill trace. If the runner cannot observe skill loading directly, use `external_judgment` and store the evidence in `judgments.json`.

The LLM may translate failed traces into a patch proposal. A script, explicit user-approved edit, or normal direct edit outside self-training applies the description change. Do not count model intuition as execution evidence.

Use the bundled deterministic scorer after routing runs exist:

```bash
bun scripts/description-harness.ts --cases=description-cases.json --results=description-results.json --output=summary.json --packet=failure-packet.md
```

`description-cases.json`:

```json
{
  "skill_name": "csv-cleanup-report",
  "description": "Current frontmatter description",
  "previous_descriptions": [
    "Earlier candidate description"
  ],
  "skill_md": "Full SKILL.md content, or omit and pass --skill-md=SKILL.md",
  "cases": [
    {
      "id": "amount-cleanup-positive",
      "query": "This CSV has dollar signs and commas in the amount column. Convert it to pure numbers and write a cleanup report.",
      "should_trigger": true,
      "reason": "Structured CSV cleanup plus report.",
      "split": "dev",
      "type": "should-trigger"
    }
  ]
}
```

`description-results.json`:

```json
{
  "runs": [
    {
      "case_id": "amount-cleanup-positive",
      "run": 1,
      "triggered": true,
      "evidence": "Output stream included loaded skill csv-cleanup-report."
    }
  ]
}
```

The script owns schema checks, split checks, repeated-run aggregation, pass rates, false positives, false negatives, adjacent-confusion failures, and failure-packet writing. External model calls or browser/CLI runs remain outside the scorer and must supply explicit run evidence.

## Failure Packet

For each mutation proposal, provide this packet:

```text
Target skill:
Current description:
Dev split summary:
False negatives:
False positives:
Adjacent-confusion failures:
Regression failures:
Previous descriptions:
Full SKILL.md:
Hypothesis:
Proposed description:
Expected metric movement:
Regression guard:
```

Use only dev failures for the rewrite hypothesis. Use holdout after the proposed description exists.

## Mutation Rules

Change only frontmatter `description` in a trigger-optimization iteration unless evidence shows the body or eval set is the real blocker.

Good mutations:

- add missing user verbs or file types;
- add explicit use-when phrases;
- add adjacent exclusions;
- narrow scope terms that over-trigger;
- remove broad nouns that attract unrelated tasks.

Bad mutations:

- copying every dev prompt into the description;
- making the description so long it becomes a hidden policy document;
- optimizing to dev cases while holdout or regression gets worse;
- editing body workflow to fix a metadata routing issue.

## Metrics

Track:

- true positive rate;
- true negative rate;
- adjacent-confusion accuracy;
- false-negative case ids;
- false-positive case ids;
- holdout pass rate;
- regression pass rate;
- average repeats per case;
- description length.

Use an AND gate:

- dev trigger accuracy improves or reaches target;
- holdout does not regress;
- regression does not regress;
- adjacent-confusion failures do not increase;
- description stays compact enough to remain metadata.

## Stop Conditions

Stop when:

- target accuracy is reached on dev and holdout;
- two consecutive description-only iterations fail to improve;
- failures are caused by missing skill capability rather than metadata;
- cases are ambiguous or bad ground truth;
- cost/noise exceeds the value of further tuning.

Escalate from description to `SKILL.md` only when the failed prompt should trigger but the body lacks the workflow needed to fulfill it.

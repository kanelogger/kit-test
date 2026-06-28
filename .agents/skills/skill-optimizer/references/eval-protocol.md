# Eval Protocol

Choose evals by intent. Do not use one universal score.

## Baseline Evals

Always consider:

- Necessity eval: does the skill add value over no skill?
- Trigger eval: should load / should not load / adjacent confusion.
- Output contract eval: required files, fields, format, count, final response.
- Regression eval: known gotchas and historical failures.
- Cost eval: token load, file reads, runtime, user intervention.

## Four Manual Evals To Automate

### Discovery Eval

Input: `name` and `description`.

Generate or request external judgment inputs:

- 3 high-confidence should-trigger prompts;
- 3 similar should-not-trigger prompts;
- risk assessment: too broad, too narrow, missing trigger phrase;
- description rewrite suggestion.

Use for routing and frontmatter changes.

For systematic `description` tuning, use `description-trigger-harness.md`. It extends Discovery Eval into a repeatable harness with about 20 should-trigger / should-not-trigger / adjacent-confusion cases, dev/holdout splits, repeated routing runs, false-positive/false-negative packets, and description-only mutation gates.

### Logic Simulation Eval

Input: full `SKILL.md`, directory tree, and a representative user task.

Generate or request a trace simulation judgment:

- what step it takes;
- what file or script it reads/runs;
- where it must guess;
- which line or section caused ambiguity;
- what input/output is missing.

Use for workflow, tool, and knowledge-navigation skills.

### Adversarial Edge-Case Eval

Input: purpose, workflow, scripts, references, environment assumptions.

Ask a QA role for 3-5 failure cases:

- unsupported config;
- missing dependency;
- permission/auth failure;
- ambiguous user intent;
- conflicting rules;
- tool/API version drift;
- prompt injection or unsafe instruction.

Use the results as proposed gotchas or regression cases. They become gate evidence only after they are encoded as eval assertions and resolved by scripts or judgment files.

### Progressive-Disclosure Eval

Input: `SKILL.md` and resource tree.

Check whether heavy content belongs elsewhere:

- large templates -> `assets/`;
- API docs and rubrics -> `references/`;
- deterministic checks -> `scripts/`;
- low-frequency branches -> referenced resource;
- repeated common knowledge -> delete.

## Intent-Specific Evals

Routing:

- positive trigger prompts;
- negative trigger prompts;
- adjacent-confusion prompts;
- description-only external judgment.
- description trigger harness when routing accuracy is the primary metric.

Norm/Style:

- rubric scoring;
- positive/negative examples;
- blind A/B preference;
- gotcha regression.

Workflow:

- stage coverage;
- branch correctness;
- output file contract;
- skipped-step detection.

Tool/Script:

- fixture tests;
- dependency missing tests;
- bad input tests;
- recovery tests;
- dry-run or sandbox execution.

Knowledge Navigation:

- path hit;
- fact coverage;
- wrong-file penalty;
- file-read count.

Creative:

- style rubric;
- external or human preference;
- generation QA;
- rework count.

Governance:

- pre-action rule pass;
- evidence trace;
- escalation correctness;
- audit trail completeness.

## Data Splits

Use:

- `dev`: visible to optimizer.
- `holdout`: not visible during mutation.
- `regression`: known failures that must not return.
- `flaky`: noisy cases requiring repeated runs or human review.

Do not claim improvement from dev-only gains when holdout or regression is missing for a high-impact change.

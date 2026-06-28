---
name: skill-optimizer
description: Audit, evaluate, and improve Agent Skills by first diagnosing the skill's purpose, then selecting intent-specific evals, mutation strategy, and self-training protocol. Use when the user wants to optimize a skill, improve SKILL.md, assess skill quality, generate eval plans, stress-test skill behavior, or make a skill train itself. Do not use for ordinary prompt optimization, code review, or documentation editing unless the target artifact is an Agent Skill.
---

# Skill Optimizer

Optimize Agent Skills as script-executed behavior systems.

Core rule:

> What scripts can do, the LLM must not do. The LLM translates intent into structured inputs and reviewable proposals; scripts execute, verify, gate, and restore.

Supporting rule:

> A skill is good when it fulfills its purpose. To fulfill that purpose, it may adapt through script-controlled, trace-backed changes.

Do not judge every skill against one fixed template. First identify the skill's purpose, then choose the evaluation and improvement strategy that fits that purpose.

Use the minimum sufficient mechanism. Do not push a target skill into self-training, scripts, references, templates, or state machines unless that heavier mechanism fixes a specific purpose-blocking failure.

Execution boundary:

- LLM responsibilities: translate the user's request into mode, target path, constraints, eval requirements, and patch proposal text.
- Script responsibilities: inspect files, generate audit JSON, generate eval suites, run deterministic assertions, initialize workspaces, checkpoint, gate, restore, iterate, and write logs.
- Human or external judgment responsibilities: resolve qualitative assertions by supplying explicit judgment files.
- The LLM must not directly execute optimization logic that a bundled script can run.
- The LLM must not directly apply a behavior mutation during self-training; produce a patch proposal and require script/human application before verification.

## Workflow

Follow this sequence for every target skill.

### 1. Inspect The Skill

Read the target skill directory before judging it:

1. Read `SKILL.md`.
2. Inspect the directory tree.
3. Note bundled `references/`, `scripts/`, `assets/`, `evals/`, config, and examples.
4. Identify whether the user wants audit-only, eval-plan, patch proposal, user-approved direct edit, or self-training.

If the user did not provide a target path, ask for the skill directory path.

### 2. Run Necessity Gate

Before optimizing, decide whether the skill should exist.

Use `references/necessity-gate.md`.

If the skill has no clear behavioral increment over baseline model behavior, recommend deletion, merging, conversion to global instructions, or keeping it as ordinary documentation. Do not deepen a skill that has no demonstrated purpose.

### 3. Diagnose Intent

Classify the primary and secondary intent.

Use `references/intent-taxonomy.md`.

Primary intent controls the optimization target. Secondary intents become guardrails. A skill can be hybrid, but each optimization round must optimize one primary intent at a time.

### 4. Select Evaluation Strategy

Choose evals based on intent, not habit.

Use `references/eval-protocol.md`.

At minimum, translate the requirement into a reviewable eval plan:

- positive trigger cases;
- negative trigger cases;
- adjacent-confusion cases;
- one representative end-to-end case;
- regression cases for known gotchas;
- the assertion or judging method for each case.

If the skill is not mature enough for evals, produce an eval plan before suggesting major rewrites.

For frontmatter trigger accuracy or `description` boundary tuning, use `references/description-trigger-harness.md`. Treat it as the repeatable protocol for should-trigger / should-not-trigger / adjacent-confusion cases, dev/holdout splits, repeated routing runs, and description-only mutations.

### 5. Audit Structure And Failure Modes

Run hygiene and failure-mode review.

Use `references/hygiene-and-diagnostics.md`.
Use `references/skill-design-principles.md` as a second opinion during structural audit.
Use `references/anti-overfitting.md` before recommending heavier structure.

For deterministic first-pass audit, run:

```bash
bun scripts/audit-skill.ts <target-skill-dir> --format=markdown
```

Use the script output as evidence. Any purpose, necessity, or eval-quality judgment that cannot be derived deterministically must be recorded as review text or supplied later through a judgment file; do not count it as an executed gate result.

To turn the audit into a reviewable eval suite:

```bash
bun scripts/audit-skill.ts <target-skill-dir> --format=json --output=/tmp/<skill>-audit.json
bun scripts/generate-evals.ts <target-skill-dir> --audit-json=/tmp/<skill>-audit.json
```

To run schema checks, deterministic assertions, and trace/log scaffolding:

```bash
bun scripts/run-evals.ts <target-skill-dir>/evals/evals.json --iteration=baseline
```

`path_hit`, `fact_coverage`, and `script_check` are deterministic. `external_judgment`, `human_preference`, and `json_path` assertions are marked `pending` unless an external evaluator supplies a judgment file:

```bash
bun scripts/run-evals.ts <target-skill-dir>/evals/evals.json --judgments-file=judgments.json --iteration=behavior-review
```

Pending cases require human, trace, or external runner judgment; do not count them as passed gates. LLM review is allowed only as external evidence written to a judgment file, never as implicit execution.

To validate and score a frontmatter description trigger harness:

```bash
bun scripts/description-harness.ts --cases=description-cases.json --results=description-results.json --output=summary.json --packet=failure-packet.md
```

The script validates case splits, aggregates repeated routing runs, calculates false positives and false negatives, and writes the failure packet used for a description mutation proposal. Pass `--skill-md=SKILL.md` when the packet should include the full skill. The script does not call an external model or decide a new description.

To initialize a protected self-training workspace:

```bash
bun scripts/workspace-init.ts <target-skill-dir> --out-dir=/tmp/<skill>-optimizer-workspace
```

This creates `source/original`, `source/working`, `evals/`, `runs/baseline`, `logs/`, and `reports/evolve-plan.md`. It does not mutate the original target skill.

Before verifying a mutation in `source/working`, create a checkpoint:

```bash
bun scripts/checkpoint.ts <optimizer-workspace> --iteration=iteration-001 --mutation-layer=SKILL.md
```

After evals/traces exist for an iteration, run the AND gate:

```bash
bun scripts/gate.ts <optimizer-workspace> --iteration=iteration-001
```

`gate.ts` writes `logs/gates.jsonl` and `logs/last-gate.json`. A gate with pending critical assertions returns `needs-human-review` unless explicitly run with `--allow-pending`.

If the gate returns `discard`, restore the checkpointed working copy:

```bash
bun scripts/restore.ts <optimizer-workspace> --iteration=iteration-001 --require-discard
```

`restore.ts` backs up the current `source/working`, restores `checkpoints/<iteration>/working`, and logs the rollback in `logs/restores.jsonl` and `logs/experiments.jsonl`.

For a single post-mutation verification cycle, use:

```bash
bun scripts/iterate.ts <optimizer-workspace> --iteration=iteration-001 --suite=<optimizer-workspace>/evals/dev.json --mutation-layer=SKILL.md
```

`iterate.ts` runs checkpoint, evals against `source/working`, gate, and automatic restore on `discard`. It does not invent or apply mutations; edit `source/working` first, then run it.

On discard, `iterate.ts` restores from the latest restorable checkpoint that existed before verification. `workspace-init` creates the initial `baseline` checkpoint, so a failed edit does not become its own rollback target.

If a pre-mutation checkpoint already exists, restore from it on discard:

```bash
bun scripts/iterate.ts <optimizer-workspace> --iteration=iteration-002 --restore-from=iteration-001 --suite=<optimizer-workspace>/evals/dev.json --mutation-layer=SKILL.md
```

To generate a trace-backed mutation proposal without editing files:

```bash
bun scripts/propose-mutation.ts <optimizer-workspace> --iteration=iteration-001
```

Separate findings into:

- purpose blockers;
- trigger boundary problems;
- workflow ambiguity;
- resource-loading problems;
- script/tool reliability problems;
- output-contract problems;
- safety or maintenance problems;
- optional polish.

Do not treat optional polish as a blocker.

### 6. Choose Mutation Strategy

Translate trace evidence into the smallest reviewable change that can improve the target metric.

Use `references/mutation-policy.md`.
Use `references/anti-overfitting.md` to decide whether the mutation is too heavy for the failure.
Use `references/description-trigger-harness.md` when the selected mutation layer is frontmatter `description` and the evidence is trigger under-selection, over-selection, or adjacent-skill confusion.

Mutation order:

1. Frontmatter: `description`, trigger phrases, negative triggers.
2. `SKILL.md`: route, workflow, output contract, failure guards.
3. `references/` and `assets/`: heavy rules, templates, examples, rubrics.
4. `scripts/`: deterministic checks, parsing, tool invocation, recovery.
5. `evals/`: bad GT, missing regression, flaky cases.

Each patch should change one layer and one intent dimension unless the user explicitly asks for a broader rewrite.

### 7. Optional Self-Training Loop

Use self-training only when the user asks for automatic iteration and the skill has enough evals to safely optimize through scripts.

Use `references/self-training-protocol.md`.
Use `references/runtime-workspace.md` for workspace layout.
Use `references/logging-and-gate.md` for trace, logging, AND gate, and rollback decisions.

The loop is:

```text
Setup -> Intent Diagnosis -> Eval Planning -> Baseline -> Review -> Ideate -> Modify -> Verify -> Gate -> Log -> Loop/Stop
```

The LLM may translate traces into a patch proposal. Scripts and explicit user-approved edits produce file changes; programmatic gates decide keep or revert. No trace, no mutation. No eval suite, no baseline run, no self-training.

### 8. Deliver

Default output is a concise audit package:

1. Purpose and intent diagnosis.
2. Necessity judgment.
3. Top findings with evidence.
4. Eval plan.
5. Recommended mutation strategy.
6. Reviewable patch proposal, or direct edits only when the user explicitly requested them outside self-training.

When producing a formal report, use `assets/audit-report-template.md`.
When finishing an iterative optimization run, use `assets/final-report-template.md`.

## Operating Rules

- Lead with whether the skill fulfills its purpose.
- Cite evidence from the target skill: file path, section, line, resource, or observed behavior.
- Prefer eval creation before major rewriting.
- Prefer adding gotchas/regression for real failures over broad rewrites.
- Prefer scripts for deterministic, repetitive, or fragile operations.
- If a bundled script can inspect, generate, run, gate, restore, or log something, run the script instead of asking the LLM to simulate it.
- Treat LLM output as translation or proposal until script evidence or an explicit judgment file makes it executable evidence.
- Keep `SKILL.md` as the control plane; move heavy details to resources.
- Do not force templates onto narrow skills.
- Do not optimize for beauty, completeness, or length unless those serve the skill purpose.
- Do not make the target skill imitate another skill. Extract methods, then apply only when appropriate.
- Preserve the target skill's native shape unless that shape blocks purpose fulfillment.
- Start lightweight: `description -> gotcha -> output contract -> reference index -> script -> self-training`.
- Do not start self-training without primary intent, baseline, dev eval, regression guard, trace capture, rollback/checkpoint, gate criteria, and human-auditable logs.
- If direct edits are requested outside self-training, preserve unrelated user changes and verify with scripts.

## Reference Files

- `references/necessity-gate.md` — decide whether a skill should exist.
- `references/intent-taxonomy.md` — classify skill purpose and choose success metrics.
- `references/eval-protocol.md` — choose evals and assertions by intent.
- `references/eval-schema.md` — JSON shape for eval plans.
- `references/description-trigger-harness.md` — run repeatable description trigger optimization with dev/holdout splits, repeated routing checks, and failure packets.
- `references/mutation-policy.md` — choose safe improvement layers.
- `references/anti-overfitting.md` — prevent heavy-method and template overfitting.
- `references/self-training-protocol.md` — run trace-driven self-training with gates.
- `references/runtime-workspace.md` — workspace, checkpoint, baseline, and evolve-plan layout.
- `references/logging-and-gate.md` — AND gate, discard, trace, and logging schema.
- `references/hygiene-and-diagnostics.md` — structural checks and failure diagnosis.
- `references/method-library.md` — reusable methods such as state machines, routing tables, evidence boundaries, scripts, and templates.
- `assets/audit-report-template.md` — formal audit report structure.
- `assets/eval-plan-template.json` — starter eval plan structure.
- `assets/final-report-template.md` — final iterative optimization report structure.
- `scripts/audit-skill.ts` — deterministic first-pass audit.
- `scripts/generate-evals.ts` — generate `evals/evals.json` from audit output.
- `scripts/run-evals.ts` — validate eval schema, run deterministic assertions, and write traces/logs.
- `scripts/workspace-init.ts` — initialize protected optimization workspace, eval splits, baseline traces, and evolve plan.
- `scripts/checkpoint.ts` — snapshot `source/working` before verification.
- `scripts/gate.ts` — apply AND gate to traces and write gate decisions.
- `scripts/restore.ts` — restore `source/working` from checkpoint after discard.
- `scripts/iterate.ts` — run one post-mutation checkpoint/eval/gate/restore cycle.

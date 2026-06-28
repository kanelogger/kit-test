# Self-Training Protocol

Use only when the target skill has enough evals or the user explicitly asks for iterative optimization.

Program controls the loop. The LLM translates traces into reviewable patch proposals; scripts or explicit user-approved edits create local changes.

No trace, no mutation.
No script, no execution.

## Loop

```text
Phase -1: Necessity Gate
Phase 0: Setup
Phase 1: Review
Phase 2: Translate Trace To Proposal
Phase 3: Apply Approved Patch
Phase 4: Checkpoint
Phase 5: Verify
Phase 6: Gate
Phase 7: Log
Phase 8: Loop / Stop
```

## Phase -1: Necessity Gate

Do not self-train a skill without clear behavioral increment.

If no increment exists, output audit/eval plan only.

## Phase 0: Setup

Create an isolated workspace. See `runtime-workspace.md`.

Actions:

1. Copy original skill to protected snapshot.
2. Copy working skill to mutation area.
3. Parse `SKILL.md`.
4. Diagnose primary intent and secondary guardrails.
5. Load or create eval plan.
6. Split dev/holdout/regression/flaky.
7. Establish baseline.
8. Write `reports/evolve-plan.md`.

If the primary target is frontmatter trigger accuracy, load `description-trigger-harness.md` during setup and create its case set before any description mutation. Do not self-train a `description` from unsplit or dev-only cases.

## Phase 1: Review

Read memory before changing anything:

- recent checkpoint/git log;
- `logs/results.tsv`;
- `logs/experiments.jsonl`;
- failed traces;
- persistent failures;
- flaky/bad-GT cases.

Extract:

- success patterns;
- failure patterns;
- target cases;
- avoid list;
- candidate mutation layer.

## Phase 2: Translate Trace To Proposal

Translate trace evidence into one atomic mutation proposal.

Required format:

```text
Target case:
Observed failure:
Trace evidence:
Hypothesis:
Mutation layer:
Proposed atomic change:
Expected metric movement:
Regression guard:
```

Priority:

1. crash;
2. regression;
3. exploit successful pattern;
4. persistent failure;
5. new direction;
6. simplify;
7. radical mutation.

## Phase 3: Apply Approved Patch

Apply one approved patch to one layer:

1. Frontmatter.
2. `SKILL.md`.
3. References/assets.
4. Scripts.
5. Evals.

Atomicity:

- if description needs "and", split it;
- if more than 5 files change, suspect non-atomic scope;
- do not mix unrelated cleanup;
- do not change eval and target behavior together unless justified.
- do not let the LLM directly edit during self-training; use a patch proposal that a script or explicit user-approved edit applies.

## Phase 4: Checkpoint

Create a checkpoint before verification:

- git commit when available;
- file snapshot otherwise.

Record:

- iteration id;
- mutation layer;
- changed files;
- parent checkpoint;
- target metric;
- expected improvement.

## Phase 5: Verify

Run three levels.

L1 Fast Hygiene:

- structure;
- frontmatter;
- resource links;
- dangerous commands/secrets;
- output contract;
- mutation scope.

Critical L1 failure discards the iteration.

L2 Dev Eval:

- intent-specific dev cases;
- trigger positive/negative;
- selected regression;
- deterministic script checks;
- external judgment file where qualitative review is unavoidable.
- for description tuning, repeated dev routing runs with false-positive and false-negative traces from `description-trigger-harness.md`.

L3 Strict Eval:

- holdout;
- full regression;
- blind A/B;
- repeated noisy external judgment;
- cross-model if relevant.
- for description tuning, holdout trigger accuracy plus adjacent-confusion and regression checks.

Run L3 on cadence, before layer escalation, before final report, or after major routing changes.

## Phase 6: Gate

Use `logging-and-gate.md`.

Gate must be AND:

- intent metric;
- boundary;
- regression;
- cost/context;
- safety/hygiene.

## Phase 7: Log

Write:

- `logs/results.tsv`;
- `logs/experiments.jsonl`;
- per-case `trace.json`;
- `logs/decisions.jsonl` when human judgment enters.

## Phase 8: Loop / Stop

Decide:

- continue same layer;
- escalate layer;
- switch strategy;
- add eval;
- mark bad GT;
- request human review;
- stop.

Escalate when:

- K rounds no keep;
- 5 discards in a row;
- current layer exhausted.

Stop when:

- target metric reached;
- all mutation layers exhausted;
- eval noise exceeds signal;
- GT disputed;
- user budget or instruction stops;
- Necessity Gate says no increment.

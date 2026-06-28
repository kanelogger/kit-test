# Logging And Gate

Program controls gate decisions. The LLM translates trace evidence into proposals; scripts execute gates and restores.

## AND Gate

Use AND, not weighted score.

All critical dimensions must pass:

1. `intent_metric`: primary metric improves or stays within allowed non-regression bounds.
2. `boundary`: negative triggers, adjacent confusion, and scope guard do not worsen.
3. `regression`: known gotchas and regression cases do not fail.
4. `cost`: token use, file reads, runtime, and user intervention stay acceptable.
5. `safety`: no dangerous operation, hardcoded secret, structural breakage, or broken output contract.

Run:

```bash
bun scripts/gate.ts <optimizer-workspace> --iteration=iteration-001
```

The gate reads per-case traces from `runs/<iteration>/`, checks each critical dimension, and writes `logs/gates.jsonl` plus `logs/last-gate.json`.

Pending critical assertions are not pass. They produce `needs-human-review` unless `--allow-pending` is explicitly used for a non-critical exploratory run.

For non-baseline iterations, the gate compares current pass rate against `runs/baseline/` and records metric evidence like:

```text
primary_metric baseline=0.750 current=0.875 delta=0.125
```

The intent metric passes only when the current run has no failed/errored critical assertions, pending assertions are allowed or resolved, and the current primary metric does not regress against baseline.

## Gate Outcomes

- `keep`
- `discard`
- `keep-with-warning`
- `needs-human-review`
- `bad-gt-suspected`
- `flaky-suspected`

## Checkpoint

Before verification, snapshot `source/working`:

```bash
bun scripts/checkpoint.ts <optimizer-workspace> --iteration=iteration-001 --mutation-layer=SKILL.md
```

The checkpoint writes `checkpoints/<iteration>/working/`, `checkpoints/<iteration>/checkpoint.json`, and appends `logs/checkpoints.jsonl`.

## Discard

On discard:

1. Revert git checkpoint or restore file snapshot.
2. Log the failed hypothesis.
3. Mark the case/layer as avoided if appropriate.
4. Do not count the iteration as successful training.

Restore command:

```bash
bun scripts/restore.ts <optimizer-workspace> --iteration=iteration-001 --require-discard
```

The restore script backs up current `source/working`, restores `checkpoints/<iteration>/working`, appends `logs/restores.jsonl`, and records the rollback in `logs/experiments.jsonl`.

## Iteration Command

After a script or explicit user-approved edit changes `source/working`, run:

```bash
bun scripts/iterate.ts <optimizer-workspace> --iteration=iteration-001 --suite=<optimizer-workspace>/evals/dev.json --mutation-layer=SKILL.md
```

This command orchestrates checkpoint, eval run, gate, and restore-on-discard. It writes `logs/iterations.jsonl` and `logs/last-iteration.json`.

Use `--restore-from=<checkpoint-iteration>` when the restore point is a pre-mutation checkpoint and the eval iteration is different.

By default, discard restores from the latest restorable checkpoint recorded before verification, not from the verification checkpoint created for the current iteration. `workspace-init` creates a `baseline` restorable checkpoint. Successful kept iterations become the next restorable checkpoint.

If traces fail or remain pending and a mutation idea is needed, generate a proposal without editing files:

```bash
bun scripts/propose-mutation.ts <optimizer-workspace> --iteration=iteration-001
```

This writes `reports/mutation-proposal.json` and appends a proposed experiment record. The proposal is evidence-backed ideation; it is not an automatic patch.

## `logs/results.tsv`

Fields:

```text
iteration
timestamp
mutation_layer
decision
primary_metric_before
primary_metric_after
dev_pass_rate
holdout_pass_rate
regression_pass_rate
cost_tokens
cost_seconds
changed_files
notes
```

## `logs/experiments.jsonl`

Each line:

```json
{
  "iteration": 1,
  "intent": "knowledge-navigation",
  "mutation_layer": "references",
  "target_cases": ["case-041"],
  "hypothesis": "The router misses offboarding queries because the index maps them to email instead of directory lifecycle.",
  "change": "Add offboarding alias to root index.",
  "evidence": ["runs/iteration-001/eval-case-041/trace.json"],
  "decision": "keep",
  "gate": {
    "intent_metric": true,
    "boundary": true,
    "regression": true,
    "cost": true,
    "safety": true
  }
}
```

## Per-Case `trace.json`

Each eval case writes:

```json
{
  "case_id": "case-041",
  "prompt": "...",
  "expected": "...",
  "skill_version": "iteration-001",
  "loaded_files": [],
  "scripts_run": [],
  "output_paths": [],
  "assertions": [],
  "judge": {
    "passed": false,
    "evidence": "..."
  },
  "failure_mode": "...",
  "cost": {
    "tokens": 0,
    "seconds": 0
  }
}
```

## Review Memory

Before ideation, read:

- recent checkpoint/git log;
- recent `results.tsv`;
- recent `experiments.jsonl`;
- failed case traces;
- persistent failures;
- flaky and bad-GT markers.

Extract:

- successful mutation patterns;
- failed mutation patterns;
- persistent target cases;
- regression guards;
- whether to escalate layer or switch strategy.

# Anti-Overfitting Principle

Methods are candidate tools, not mandatory process.

Core rule:

> Use the minimum sufficient mechanism that helps the skill fulfill its purpose.

Overfitting risk comes from forcing every skill into the same heavy optimizer shape.

## Minimum Sufficient Mechanism

Try the smallest effective layer first:

1. If `description` fixes the issue, do not edit the body.
2. If a gotcha or failure guard fixes it, do not refactor the workflow.
3. If an output contract fixes it, do not introduce a state machine.
4. If a reference index fixes it, do not write a script.
5. If audit + eval plan is enough, do not enter self-training.
6. Start self-training only when failures persist, metrics are measurable, and regression guards exist.

## Lightweight First

Default escalation:

```text
description -> gotcha -> output contract -> reference index -> script -> self-training
```

Each escalation must state:

- why the current layer is insufficient;
- what concrete failure the heavier mechanism fixes;
- what context cost, maintenance cost, or behavioral rigidity it introduces.

## Anti-Template Rule

Do not require a method just because it exists.

Do not:

- split a narrow skill into references by default;
- force creative skills into rigid state machines;
- replace tool scripts with long prompt instructions;
- solve routing failures with scripts;
- force folder output when the task has no file artifact;
- start self-training without evals.

Templates are allowed only when they stabilize output, reduce omissions, support evals, or scaffold a low-maturity draft.

## Preserve Native Shape

Keep the shape that best serves the skill purpose:

- narrow conversation-posture skills can stay short;
- creative skills can preserve open space;
- tool skills can be script-first and body-light;
- knowledge skills can be reference-heavy;
- workflow skills can be state-machine based;
- meta skills can use complex protocols.

Refactor only when the current shape blocks purpose fulfillment.

## No Self-Training Without Evals

Do not run automatic self-training unless all exist:

- primary intent;
- baseline;
- dev eval;
- regression guard;
- trace capture;
- rollback/checkpoint;
- gate criteria;
- human-auditable logs.

If any are missing, output audit, eval plan, or patch proposal only.

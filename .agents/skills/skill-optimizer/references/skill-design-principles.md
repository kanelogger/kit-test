# Skill Design Principles

Lightweight principles distilled from real-world skill design experience.

Use this as a second opinion during audit and mutation. Do not treat it as a fixed template; apply only when it helps the target skill fulfill its purpose.

## Principles

### Skill Is a Directory, Not Just a File

A skill is a folder, not only `SKILL.md`.

- Use `references/` for rules, rubrics, and detailed policies.
- Use `assets/` for templates, examples, and heavy reference material.
- Use `scripts/` for deterministic checks, parsing, and tool invocation.
- Use `evals/` for behavior tests and regression guards.
- Keep `SKILL.md` as the control plane: purpose, routing, workflow, output contract, and guards.

### Do Not Repeat Obvious Model Capabilities

If the model can already do the task well without the skill, the skill adds no behavioral increment.

- Delete instructions that restate common knowledge.
- Convert general advice into gotchas only when there is a real failure pattern.
- Ask: without this sentence, would the agent likely do worse?

### Description Is a Trigger Spec, Not a Human Summary

The `description` field in frontmatter is read by the model to decide when to load the skill.

- Include trigger phrases: when to use, and when not to use.
- Include adjacent-confusion boundaries: what this skill is NOT for.
- Include exclusions for closely related tasks that should route elsewhere.
- Do not use the description to explain the skill's internal workflow.

### Gotchas Should Come from Real Failures

Gotchas are the highest-density content in a skill.

- Every gotcha should trace back to an actual observed failure.
- Prefer "if X then Y" over "be careful with X."
- Add regression cases for gotchas in the eval suite.
- Remove gotchas that no longer match observed behavior.

### Use Progressive Disclosure

Load heavy content only when needed.

- Provide a resource index with read conditions.
- Do not load all references at the start of a workflow.
- For each reference file, state when to read it and what decision it informs.
- Avoid over-reading: the agent should know which resource to open for a given sub-task.

### Validation-Focused Skills Are Usually Worth the Investment

Skills that critique, audit, or verify tend to produce clearer success metrics and fewer false positives.

- If a skill checks output quality, it is easier to evaluate than one that generates open-ended content.
- Consider whether the skill's purpose can be reframed as verification without losing value.

### Avoid Platform-Specific Mechanisms Masquerading as Universal Rules

What works in one tool or platform may not generalize.

- Do not assume all agents support the same hooks, plugins, or environment variables.
- Keep platform-specific advice in a clearly labeled section or separate reference.
- Do not require proprietary mechanisms unless the skill is explicitly scoped to that platform.

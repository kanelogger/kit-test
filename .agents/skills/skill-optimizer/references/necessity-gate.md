# Necessity Gate

Use this before optimizing any skill.

## Core Question

Does this skill create a measurable behavioral increment over baseline agent behavior?

If no, do not deepen the skill.

## When A Skill Is Needed

A skill is justified when at least one is true:

- Baseline agent behavior fails on representative tasks.
- The user needs stable behavior across runs.
- The task needs private, niche, current, or organization-specific knowledge.
- The task needs a specialized workflow or tool orchestration.
- The task needs consistent style, taste, rubric, or domain judgment.
- The task needs deterministic scripts, templates, or resources the agent would otherwise recreate poorly.

## When A Skill Is Not Needed

Recommend deleting, merging, moving, or demoting the skill when:

- The model already handles the task reliably without it.
- A one-sentence user prompt changes behavior reliably.
- The content repeats global instructions.
- The content is ordinary documentation for humans, not agent control.
- The skill mainly lists commands the model already knows.
- The external API, tool, or policy changes faster than the skill can be maintained.
- The skill has no clear trigger boundary or stable target user task.

## Hero Query Test

Run or propose 2-5 hero queries:

1. Representative positive query.
2. Known failure query.
3. Adjacent-confusion query.
4. Edge or ambiguous query.
5. High-value production-like query if available.

For each query, compare:

- baseline without skill;
- current skill;
- expected purpose.

Pass the gate only if the skill has a clear path to improve correctness, stability, cost, user effort, or output quality.

## Necessity Judgment Labels

- `keep-and-optimize`: clear purpose and clear increment.
- `keep-but-scope`: useful, but current scope is too broad.
- `merge`: useful content belongs in another skill.
- `globalize`: content should become global/project instruction.
- `document-only`: useful human documentation, weak skill value.
- `delete-or-disable`: no clear purpose or harmful overlap.

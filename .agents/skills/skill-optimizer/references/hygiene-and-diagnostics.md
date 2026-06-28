# Hygiene And Diagnostics

Use this for static audit and failure diagnosis.

Hygiene is not excellence. It only catches structural problems.

## Structural Checks

- `SKILL.md` exists with exact casing.
- Frontmatter has `---` delimiters.
- YAML parses.
- `name` is kebab-case and matches the directory.
- `description` exists and fits the skill purpose.
- Resource directories are used intentionally.
- Main file is not carrying large templates, API docs, or schemas that should be resources.

## Trigger Checks

- Description states when to use the skill.
- Description includes real user phrases where useful.
- Description includes exclusions for adjacent confusion.
- Description is not just a domain label.
- Description does not contain the full workflow.

## Execution Checks

- Instructions are actionable.
- Steps name inputs and outputs.
- Branches have conditions.
- Key resources have read conditions.
- Deterministic work is scripted when appropriate.
- Errors have recovery paths.
- Final output is specified.

## Context Checks

- Delete obvious model knowledge unless it is a gotcha.
- Move low-frequency content out of `SKILL.md`.
- Add indexes for large references.
- Avoid enabling a skill for work better handled globally.
- Ask: without this sentence, would the agent likely do worse?

## Design Principle Checks

- Does the skill merely repeat model common sense instead of adding a behavioral increment?
- Are gotchas traced to real failures, or are they generic warnings?
- Does `description` contain trigger phrases, exclusions, and adjacent-confusion boundaries?
- Have large templates, API docs, or low-frequency rules been moved to `references/` or `assets/`?
- Does every resource include a read condition so the agent knows when to load it?
- Is any platform-specific mechanism presented as a universal rule?

## Diagnostic Map

Skill not triggered:

- add trigger phrase;
- clarify user intent;
- include file type or task outcome;
- run discovery eval.

Skill over-triggered:

- add exclusion;
- narrow domain;
- add adjacent negative cases.

Skill triggered but ignored:

- move critical instruction earlier;
- make instruction executable;
- reduce main file noise;
- add output contract;
- script key validation.

Agent guesses:

- define step input/output;
- define branch condition;
- add resource read condition;
- standardize terminology.

Boundary failure:

- add gotcha;
- add regression;
- add script recovery;
- add escalation or stop condition.

Tool failure:

- test tool standalone;
- check auth and permissions;
- add environment probe;
- add structured error.

Main file too heavy:

- move templates to `assets/`;
- move docs/rubrics to `references/`;
- move checks to `scripts/`;
- keep only purpose, routing, workflow, contract, and guards.

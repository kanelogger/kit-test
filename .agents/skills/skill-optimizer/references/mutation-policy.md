# Mutation Policy

Optimize by smallest evidence-backed change.

## Mutation Layers

1. Frontmatter:
   - `description`;
   - trigger phrases;
   - negative triggers;
   - scope terms.

2. `SKILL.md` body:
   - purpose;
   - workflow;
   - routing;
   - failure guards;
   - output contract;
   - resource read conditions.

3. Resources:
   - split heavy references;
   - add rubrics;
   - add topic indexes;
   - move templates to assets.

4. Scripts:
   - validation;
   - parsing;
   - conversion;
   - tool invocation;
   - environment checks;
   - recovery paths.

5. Evals:
   - add missing cases;
   - fix bad GT;
   - mark flaky or unfixable cases;
   - add regression from gotcha.

## Rules

- Each mutation must name the target intent.
- Each mutation must cite evidence: eval failure, trace, user feedback, or audit finding.
- Each mutation should change one layer.
- If the change description needs "and", split it.
- Do not rewrite broad sections to fix a narrow failure.
- Do not add templates, scripts, or references unless they help fulfill the purpose.
- Do not optimize for file count, length, or elegance by itself.

## Common Mutations By Failure

Under-trigger:

- add real user trigger phrase;
- include file type or task result;
- sharpen WHEN language.

Over-trigger:

- add negative trigger;
- narrow domain;
- name adjacent exclusions.

Workflow ambiguity:

- add state transition;
- define branch condition;
- add input/output for the step.

Resource miss:

- add reference index;
- add read condition;
- split overloaded reference.

Tool failure:

- script validation;
- clearer params;
- environment probe;
- structured error output.

Output drift:

- add output contract;
- add asset template;
- add QA checklist.

Repeated gotcha:

- add regression;
- add failure guard;
- add script check if deterministic.

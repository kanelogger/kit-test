# Intent Taxonomy

Classify the target skill before judging or changing it.

## Intent Matrix

| Intent | Purpose | Main Failure Mode | Primary Metrics | Best First Mutation |
| --- | --- | --- | --- | --- |
| Routing | Load at the right time and stay silent otherwise | under-trigger, over-trigger, adjacent confusion | trigger precision/recall, negative pass rate | `description` |
| Norm/Style | Preserve a standard, style, rubric, or taste | drift, vague advice, ignored constraints | rubric score, preference win rate, gotcha pass | checklist, examples, gotchas |
| Workflow Orchestration | Complete a multi-stage process | skipped steps, wrong branch, incomplete output | stage coverage, output contract pass | state machine, routing table |
| Tool/Script | Reliably execute deterministic work | bad params, env failure, no recovery | command pass rate, recovery pass, user intervention | scripts, parameter validation |
| Knowledge Navigation | Read the right resource at the right time | wrong file, over-reading, missed fact | path hit, fact coverage, file-read cost | index, topic router |
| Creative Generation | Produce strong creative or visual artifacts | generic output, style miss, high rework | human preference, style rubric, QA pass | style DNA, prompt template, QA gate |
| Domain Governance | Apply professional, compliance, audit, or risk judgment | unsafe action, unsupported rule, missing audit trail | rule pass, escalation accuracy, traceability | pre-action check, evidence policy |
| Meta/Optimizer | Improve other skills | single-rubric misuse, overfitting, broad edits | intent accuracy, eval fit, gate quality | taxonomy, eval planner, mutation policy |

## Hybrid Skills

Many skills are hybrid. Pick:

- Primary intent: what must improve for the skill to fulfill its purpose.
- Secondary guardrails: behaviors that must not regress.

Example pattern:

- A skill that compiles fuzzy user requirements into a structured artifact may be workflow-primary and routing-secondary.
- A skill that publishes to a website may be tool-primary and workflow-secondary.
- A skill that critiques articles may be norm-primary and evidence-governance-secondary.

## Practical Skill Categories Mapping

The following common skill categories map onto the Intent Matrix above. Use them as a quick reference during diagnosis; they do not replace the 8 core intents.

| Practical Category | Primary Intent | Secondary Intent(s) |
| --- | --- | --- |
| Library/API reference | Knowledge Navigation | Tool/Script |
| Product validation | Tool/Script | Workflow Orchestration |
| Data acquisition and analysis | Knowledge Navigation | Tool/Script |
| Business automation | Workflow Orchestration | — |
| Scaffolding / templates | Workflow Orchestration | Creative Generation / Tool/Script |
| Code quality / audit | Domain Governance | Norm/Style |
| CI/CD / deployment | Tool/Script | Domain Governance |
| Runbook | Workflow Orchestration | Knowledge Navigation |
| Infrastructure operations | Tool/Script | Domain Governance |

When classifying a skill, start with the practical category if it is obvious, then confirm the primary and secondary intents from the matrix before choosing evals and mutations.

## Intent Diagnosis Questions

Answer these before improving:

1. What task does this skill exist to complete?
2. What behavior should change after loading it?
3. What should remain flexible?
4. What must never drift?
5. What does success look like to the user?
6. Can success be checked by code, rubric, trace, or preference?
7. Which layer controls the failure: description, workflow, resources, scripts, assets, evals, or gotchas?

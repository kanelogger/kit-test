# Method Library

Apply these methods only when they fit the diagnosed intent.

## State Machine

Use when a workflow has stages, branching, or skip conditions.

Define:

- state goal;
- input;
- action;
- exit condition;
- next state.

Do not use for narrow one-step skills.

## Routing Table

Use when inputs, goals, or adjacent skills are easily confused.

Define:

- user signal;
- source type;
- route;
- resource;
- skip condition.

## Evidence Boundary

Use for analysis, research, review, governance, and fact-sensitive work.

Define labels such as:

- source-stated;
- inferred;
- creative-extension;
- external-unverified;
- insufficient-info.

Do not let creative synthesis masquerade as evidence.

## Output Contract

Use when the task has artifacts.

Define:

- output location;
- file names;
- required fields;
- minimum artifacts;
- final chat response.

## Style DNA

Use for creative, visual, brand, and writing-style skills.

Define observable dimensions:

- subject;
- composition;
- tone;
- medium;
- palette;
- density;
- forbidden patterns;
- QA checklist.

## Scripted Execution

Use for deterministic, repetitive, fragile, or tool-heavy work.

Scripts should:

- validate inputs;
- expose clear parameters;
- produce readable errors;
- support dry-run when useful;
- avoid surprising side effects.

## Sequential Workflow

Use when later steps depend on earlier outputs.

Include:

- explicit order;
- dependency;
- phase validation;
- rollback or stop condition.

## Multi-Tool Coordination

Use when work crosses services or runtimes.

Include:

- data handoff;
- auth checks;
- intermediate verification;
- centralized error handling.

## Context-Aware Selection

Use when the same goal needs different tools based on file type, size, risk, user preference, or environment.

Include:

- decision criteria;
- fallback;
- explanation of selected route.

## Domain Governance

Use when the skill controls compliance, audit, risk, safety, or professional judgment.

Include:

- pre-action check;
- allow/deny/escalate rules;
- evidence trace;
- audit record.

## Template Policy

Templates are useful when they stabilize output. They are harmful when they force a narrow shape onto an adaptive task.

Use templates for:

- fixed artifacts;
- schemas;
- repeatable reports;
- eval-readable output.

Avoid templates for:

- narrow conversational skills;
- open creative exploration;
- tasks where context should dominate.

---
title: Phase 2 - Template Control Files
slug: phase-2-template-control-files
summary: 将 AGENTS、SPECS、workflow、tasks、memory 控制文件加入生成模板。
---

## Goal

将 Agent 控制文件加入生成模板，让 `kit init` 产出带完整 Agent 控制面的项目骨架。同时扩展 Phase 1 的 `kit check`，加入 `initialized` 阶段所需的 artifact 存在性校验和内容校验（如 `Source:` 行），使 fresh project 能通过完整的 `kit check`。

## Inputs

* [`00-contract.md`](/Users/kanehua/project/kit-test/plan/00-contract.md)
* [`01-cli-foundation.md`](/Users/kanehua/project/kit-test/plan/01-cli-foundation.md)
* `templates/pc-admin/`
* `skills-list.md`

## Tasks

* Extend `kit check` with per-stage artifact existence checks for `initialized` (Gate Rules table in `00-contract.md`): root control files, `SPECS/API.md`, frontend/backend `SPECS/README.md`, frontend/backend `SPECS/API.md`, `memory/decisions.md`, `tasks/README.md`, and `Source:` line validation.
* Add root `AGENTS.md` template with workflow, hard stops, CLI commands, skill routing, and cross-end contract rules.
* Add `frontend/AGENTS.md` and `backend/AGENTS.md` templates with local responsibility boundaries.
* Add root `SPECS/API.md` with `status: draft` frontmatter.
* Add frontend/backend `SPECS/README.md` listing `PRD.md`, `ARCHITECTURE.md`, `API.md`, `FEATURES/<feature-slug>/spec.md, tasks.md`.
* Add frontend/backend `SPECS/API.md` files containing `Source: ../../SPECS/API.md`.
* Add `workflow/README.md`, `tasks/README.md`, and `memory/decisions.md`.
* Update generated package scripts so users can run pnpm aliases for `kit check` and `kit stage advance`.

## Acceptance Criteria

* Fresh generated project contains every control file listed in `00-contract.md`.
* Fresh generated project does not contain stage artifacts such as `workflow/requirements.md` or `workflow/solution-selected.md`.
* `frontend/SPECS/API.md` and `backend/SPECS/API.md` contain the exact source line.
* Root, frontend, and backend `AGENTS.md` do not contradict the state machine or Gate Rules in `00-contract.md`.
* Fresh generated project passes `kit check` at `initialized`.

## Verification

* Run `kit init demo-admin` after Phase 1 is available.
* Inspect generated control file paths.
* Run `kit check`.
* Search generated project for forbidden early files under `workflow/`.
* Search generated project for stale `docs/` workflow paths.

## Out of Scope

* Stage gate fixture coverage.
* Typecheck of frontend/backend app code.
* Generating real feature `SPECS/PRD.md`, `ARCHITECTURE.md`, or `FEATURES/<feature-slug>/` directory structures.
* Runtime-specific hook integration.

## Depends On

Phase 1: CLI Foundation.

## Completion Gate

- [ ] Fresh generated project contains every control file listed in `00-contract.md`.
- [ ] No stage artifact files exist under `workflow/` in a fresh project.
- [ ] `frontend/SPECS/API.md` and `backend/SPECS/API.md` contain the exact `Source: ../../SPECS/API.md` line.
- [ ] Root, frontend, and backend `AGENTS.md` do not contradict the state machine or Gate Rules.
- [ ] `kit check` passes at `initialized`.
- [ ] All Acceptance Criteria are met.

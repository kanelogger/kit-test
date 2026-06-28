---
title: Phase 4 - SDD/SPECS Contract
slug: phase-4-specs-contract
summary: 将旧 SDD 思路收敛到新的 SPECS 契约结构，并用样例特性验证跨端协作。
---

## Goal

把 `ref.md` 里的前后端 SDD 要求映射到新的 `SPECS/` 结构，确保业务需求、跨端 API、前端本地规格、后端本地规格和任务文件能协同工作。

## Inputs

* [`00-contract.md`](/Users/kanehua/project/kit-test/plan/00-contract.md)
* [`02-template-control-files.md`](/Users/kanehua/project/kit-test/plan/02-template-control-files.md)
* [`03-stage-gate-fixtures.md`](/Users/kanehua/project/kit-test/plan/03-stage-gate-fixtures.md)
* `ref.md`

## Tasks

* Document the mapping from old SDD terms to new `SPECS/` files:
  * root `workflow/requirements.md` is the business requirement source.
  * root `SPECS/API.md` is the only cross-end API contract.
  * frontend/backend `SPECS/PRD.md` describe local responsibility.
  * frontend/backend `SPECS/ARCHITECTURE.md` describe local design.
  * frontend/backend `SPECS/FEATURES/<feature-slug>/spec.md` and `tasks.md` describe feature implementation and task breakdown.
* Keep frontend/backend `SPECS/API.md` as references to root `SPECS/API.md`, not duplicate contracts.
* Add a sample feature walkthrough that produces root workflow docs, root API contract, frontend specs, backend specs, and root tasks in the correct stage order.
* Add a check or documented acceptance rule that frontend VO fields and backend response fields are represented in root `SPECS/API.md`.

## Acceptance Criteria

* The old SDD document list from `ref.md` has an explicit destination in the new structure.
* A sample feature can be specified without creating forbidden future files early.
* Frontend and backend local specs both point back to root `SPECS/API.md`.
* `kit check` still treats root `SPECS/API.md` as the only cross-end contract.

## Verification

* Run the sample feature walkthrough through the workflow stages.
* Run `kit check` after each stage.
* Confirm no duplicate cross-end API contract appears under frontend/backend.
* Confirm root `SPECS/API.md` contains request/response fields needed by both sides.

### Root `tasks/` vs SDD `tasks.md`

* Root `tasks/backlog.md` is the global backlog, created at `requirements-confirmed`.
* Root `tasks/sprint-01.md` is the first sprint plan, created at `implementation-ready`.
* Frontend and backend SDD `tasks.md` (under `frontend/SPECS/FEATURES/<feature-slug>/tasks.md` and `backend/SPECS/FEATURES/<feature-slug>/tasks.md`) are local implementation task lists for individual features. They reference the global backlog/sprint but are maintained separately.
* Backlog items in `tasks/backlog.md` may link to individual feature task files once they exist.

## Out of Scope

* Building the sample feature UI or API implementation.
* Markdown parser-level validation of API tables.
* Adding runtime hooks.
* Replacing the current Vue + Node template stack.

## Depends On

Phase 1, Phase 2, and Phase 3.

## Completion Gate

- [ ] Every old SDD document from `ref.md` has an explicit destination in the new structure.
- [ ] A sample feature walkthrough passes through all workflow stages without creating forbidden files early.
- [ ] `kit check` passes after each stage in the walkthrough.
- [ ] Frontend and backend local specs both reference root `SPECS/API.md`.
- [ ] No duplicate cross-end API contract exists under frontend/backend.
- [ ] All Acceptance Criteria are met.

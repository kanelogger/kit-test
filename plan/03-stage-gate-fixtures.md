---
title: Phase 3 - Stage Gate Fixtures
slug: phase-3-stage-gate-fixtures
summary: 为状态机、阶段门和命令行为补齐正负向 fixture 与测试。
---

## Goal

把 `00-contract.md` 的 Gate Rules 变成可回归的机器测试，确保 Agent 无法通过跳级、提前创建文件、缺少 quote 或伪造选择绕过阶段门。

## Inputs

* [`00-contract.md`](/Users/kanehua/project/kit-test/plan/00-contract.md)
* [`01-cli-foundation.md`](/Users/kanehua/project/kit-test/plan/01-cli-foundation.md)
* [`02-template-control-files.md`](/Users/kanehua/project/kit-test/plan/02-template-control-files.md)

## Tasks

* Add valid fixtures for all 6 stages.
* Add negative fixtures for skipped stages.
* Add negative fixtures for missing `--quote` and missing quote fields.
* Add negative fixtures for future workflow files created too early.
* Add negative fixtures for missing YAML frontmatter fields.
* Add negative fixtures for missing API `Source: ../../SPECS/API.md`.
* Add negative fixtures for `solution-options` with wrong `optionIds` count.
* Add negative fixtures for `solution-selected` missing `memory/decisions.md` selected option entry.
* Add tests that verify `kit stage advance` allows only the immediate next stage and writes `history[]`.

## Acceptance Criteria

* Every valid fixture passes `kit check`.
* Every invalid fixture fails with an error and concrete repair action.
* `kit stage advance` appends a `history[]` entry with `from`, `to`, `advancedBy`, `advancedAt`, `quote`, and `doc`.
* `kit stage advance` rejects skipped stages.
* Test suite does not depend on Markdown body parsing.

## Verification

* Run the CLI test suite.
* Run fixture checks directly against at least one valid and one invalid fixture per stage.
* Confirm failure output includes the next repair action, not only an error label.

## Out of Scope

* Adding new workflow stages.
* Parsing option details from Markdown prose.
* Running frontend/backend typecheck from `kit check`.
* Implementing feature-level business specs.

## Depends On

Phase 1 and Phase 2.

## Completion Gate

- [ ] Every valid fixture passes `kit check`.
- [ ] Every invalid fixture fails with an error and concrete repair action.
- [ ] `kit stage advance` appends `history[]` entries with all required fields.
- [ ] `kit stage advance` rejects skipped stages.
- [ ] Test suite does not depend on Markdown body parsing.
- [ ] All Acceptance Criteria are met.

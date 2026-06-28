---
title: Phase 1 - CLI Foundation
slug: phase-1-cli-foundation
summary: 建立 CLI 包和三个首版命令：init、check、stage advance。
---

## Goal

实现可构建的 `packages/cli`，提供 `kit init <project-name>`、`kit check`、`kit stage advance <stage> --by --quote` 的命令解析、模板复制和 JSON 读写基础能力。**不要求生成完整的 Agent 控制文件**，也不要求 `kit check` 通过 `initialized` 阶段校验——那些是 Phase 2 的职责。

## Inputs

* [`00-contract.md`](/Users/kanehua/project/kit-test/plan/00-contract.md)
* Root `package.json`
* `pnpm-workspace.yaml`
* `templates/pc-admin/`

## Tasks

* Add `packages/cli` with TypeScript build config and a binary entry.
* Wire root `package.json` scripts to the built CLI.
* Implement `kit init <project-name>` with template copy, `{{projectName}}` replacement, directory scaffolding (`frontend/`, `backend/`, `SPECS/`, `workflow/`, `tasks/`, `memory/`), and overwrite protection.
* Implement `kit check` as a lightweight framework that reads `workflow-state.json`, validates its JSON schema, and checks current stage against `allowedNextStages`. Specific artifact existence checks per stage are added in Phase 2.
* Implement `kit stage advance <stage> --by --quote` with no skip support, mandatory exact quote, JSON state update, and `history[]` append.

## Acceptance Criteria

* `pnpm build` builds the CLI package.
* `node packages/cli/dist/index.js init demo-admin` creates a generated project with the directory scaffold (`frontend/`, `backend/`, `SPECS/`, `workflow/`, `tasks/`, `memory/`) and a valid `workflow-state.json`.
* `kit check` reads `workflow-state.json` and validates: JSON schema integrity, `stage` is a known value, `allowedNextStages` is a non-empty array.
* `kit stage advance` rejects skipped stages and missing `--quote`.
* `kit stage advance` writes correct `history[]` entries and updates `stage`.

## Verification

* Run `pnpm build`.
* Run `node packages/cli/dist/index.js init demo-admin` in `/tmp` or another disposable directory.
* Run `kit check` on the generated project — verify it reads and validates `workflow-state.json` (JSON schema checks only; artifact existence checks are Phase 2).
* Run one valid `kit stage advance requirements-draft --by user --quote "<exact quote>"`.
* Run one invalid skip attempt and confirm it fails with a repair action.

## Out of Scope

* Full fixture suite.
* Runtime-specific Agent hooks.
* Frontend/backend implementation changes.
* Markdown body parsing.
* Generating Agent control files (`AGENTS.md`, `SPECS/API.md`, `SPECS/README.md`, etc.) — these are added in Phase 2.
* Validating that a fresh project passes `kit check` at `initialized` — this AC belongs to Phase 2.

## Depends On

None. This is the foundation phase.

## Completion Gate

- [ ] `pnpm build` exits cleanly.
- [ ] `kit init demo-admin` in a temp directory creates the directory scaffold.
- [ ] `kit check` reads and validates `workflow-state.json` (schema + stage + allowedNextStages).
- [ ] `kit stage advance` rejects skipped stages and missing `--quote`.
- [ ] `kit stage advance` correctly updates stage and appends `history[]`.
- [ ] All Acceptance Criteria are met.

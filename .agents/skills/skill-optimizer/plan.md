# skill-optimizer 轻量增强计划

## Summary

按“方案一 + 方案二 taxonomy 映射表”做增量补丁，不重构 `skill-optimizer`。目标是把附件文章中的 Skill 设计经验转成审计准则和分类辅助，不改变现有“目的诊断 -> eval 选择 -> 最小 mutation -> gate/self-training”的设计初衷。

## Key Changes

- 新增 `references/skill-design-principles.md`，作为文章经验的轻量原则库，包含：
  - Skill 是文件夹，不只是 `SKILL.md`。
  - 不重复模型显而易见能力。
  - `description` 是模型触发说明，不是人类摘要。
  - Gotchas 应来自真实失败点，是最高密度内容。
  - 用 `references/`、`assets/`、`scripts/` 做渐进式披露。
  - 验证类 Skill 通常优先值得投入。
  - 避免把平台专属机制当通用规则。

- 小改 `references/intent-taxonomy.md`，保留现有 8 类 Intent，只新增“Practical Skill Categories Mapping”表：
  - 库/API 参考 -> Knowledge Navigation + Tool/Script
  - 产品验证 -> Tool/Script + Workflow Orchestration
  - 数据获取与分析 -> Knowledge Navigation + Tool/Script
  - 业务自动化 -> Workflow Orchestration
  - 脚手架/模板 -> Workflow Orchestration + Creative/Tool
  - 代码质量/审核 -> Domain Governance + Norm/Style
  - CI/CD/部署 -> Tool/Script + Domain Governance
  - Runbook -> Workflow Orchestration + Knowledge Navigation
  - 基础设施运维 -> Tool/Script + Domain Governance

- 小改 `references/hygiene-and-diagnostics.md`，增加审计检查项：
  - 是否只是重复模型常识。
  - 是否有真实 gotchas 或历史失败点。
  - `description` 是否包含触发词、排除条件、相邻混淆边界。
  - 大块模板/API/低频规则是否已拆到资源文件。
  - 是否为每个资源说明读取条件，避免过读。

- 主 `SKILL.md` 只做一处最小链接补充：在结构审计步骤中同时引用 `references/skill-design-principles.md`。不改 workflow、scripts、自训练协议、gate 语义。

## Test Plan

- 运行本地结构检查：
  - `bun scripts/audit-skill.ts warehouse/local/skill-optimizer --format=markdown`
- 验证新增 reference 不破坏 eval 结构：
  - `bun scripts/run-evals.ts warehouse/local/skill-optimizer/evals/evals.json --iteration=principles-patch`
- 如 source skill 修改后需要同步 adapted 版本，运行：
  - `./bin/hk-skill adapt skill-optimizer`
- 不跑完整 `bun test`，因为本轮不改 CLI、脚本、registry、manifest 或 runtime 行为；若实现时意外修改 `scripts/` 或 `src/`，再补跑 `bun test`。

## Assumptions

- 本轮只优化 `warehouse/local/skill-optimizer`，不改 `warehouse/adapted/` 手工文件。
- 不复制整篇文章进仓库，只抽象成可维护的原则和映射表。
- 不引入 Claude Code 平台专属 hook、plugin marketplace、`${CLAUDE_PLUGIN_DATA}` 作为通用要求。
- 不把九类 Skill 替换为主分类；它们只作为现有 intent taxonomy 的实践映射。

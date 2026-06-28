# 技能清单

> 项目技能目录：`.agents/skills/`
>
> 本文档是**人类可读的技能目录**，不提供 Agent 侧索引能力。Agent 的技能发现和路由由独立的 JSON 索引文件负责。

## 一、首批核心技能（L1）

对应 `product-ref.md` 第 6–9 步和默认 Agent 流程。

| 项目阶段 | 项目别名 | 实际 Skill | 作用 |
| --- | --- | --- | --- |
| 需求澄清 | `requirement-clarification` | `ce-brainstorm` | 多轮澄清后产出结构化需求文档 |
| 需求压力测试 | `requirement-grilling` | `grilling` | 追问边界、异常、验收标准，把态度转成事实 |
| 需求迭代 | `doc-iteration` | `doc-coauthoring` | 与用户协同修改 `workflow/requirements.md` |
| 规格锁定 | `spec-lock` | `spec-driven-development` | 将需求转成可执行规格，先 spec 后代码 |
| 领域建模 | `domain-modeling` | `domain-modeling` | 统一术语、实体、流程边界 |
| 领域术语 | `ubiquitous-language` | `ubiquitous-language` | 统一领域术语表 |
| 方案生成 | `solution-options` | `design-an-interface` | 产出 3 个技术方案 + 推荐理由 |
| 技术规划 | `tech-plan-generator` | `planning-and-task-breakdown` | 方案选定后拆实施计划 |
| 接口设计 | `api-design` | `api-and-interface-design` | 前后端契约、模块边界、API 路由 |
| 安全加固 | `security-review` | `security-and-hardening` | 输入、鉴权、存储、外部调用 |
| 实现 | `shell-implementation` | `implement` | 按方案编码 |
| 测试驱动 | `tdd` | `tdd` | 行为验收、单元/集成测试 |
| 浏览器验收 | `webapp-testing` | `webapp-testing` | 真实浏览器验证主业务闭环 |
| 代码审查 | `code-review` | `code-review-and-quality` | 实现后唯一 review gate |
| 文档沉淀 | `documentation` | `documentation-and-adrs` | 记录 ADR、方案选择、技能追踪 |

---

## 二、条件触发技能（L2）

按需求复杂度或当前状态选择性调用，不进入默认主链。

| 项目别名 | 实际 Skill | 触发条件 |
| --- | --- | --- |
| `idea-exploration` | `ce-ideate` | 需求极模糊，需要先发散多个方向 |
| `solution-stress-test` | `grilling` | 方案确定前需要压力测试 |
| `architecture-diagram` | `architecture-diagram` | 技术方案需要架构图/流程图/时序图 |
| `deep-module-design` | `codebase-design` | 需要强调“深度模块”设计时 |
| `prototype` | `prototype` | 技术方案不确定，先做可丢弃原型 |
| `debug` | `ce-debug` | 调试复杂问题，定位根因 |
| `debug-flow` | `debugging-and-error-recovery` | 构建、运行、测试失败时 |
| `frontend-ui` | `frontend-ui-engineering` | 需要生成高质量后台 UI |
| `frontend-ui-design` | `ce-frontend-design` | 需要产出前端设计方案 |
| `ui-guidelines` | `web-design-guidelines` | 检查 UI 可用性、可访问性、一致性 |

---

## 三、元能力与流程治理（L3）

贯穿 PDCA 全程，控制阶段推进和 Agent 上下文。

| 项目别名 | 实际 Skill | 作用 |
| --- | --- | --- |
| `context-engineering` | `context-engineering` | 配置 `AGENTS.md`、`SPEC`、`RULES`、`SKILLS` 等项目控制文件 |
| `agent-native-arch` | `ce-agent-native-architecture` | 设计阶段锁、`workflow-state.json`、硬停顿协议、Agent 可中断续跑机制 |
| `skill-routing` | `using-agent-skills` | 自动路由到正确技能 |
| `skill-craft` | `skill-creator` | 现成技能不够时定制新技能 |
| `skill-optimize` | `skill-optimizer` | 优化现有技能 |
| `handoff` | `handoff` | 阶段间切换 Agent/LLM 的交接协议 |

---

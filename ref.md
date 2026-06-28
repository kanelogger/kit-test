## 项目定位

本项目的核心功能是打造一个**对 Agent 友好的、帮助用户快速搭建 PC 端后台项目的工具**。

为 vibe coding 搭建 PC 端后台项目，通过 AGENTS.md、Hook、Skill 与阶段锁机制，让 Agent 稳定执行并防止未确认就进入下一阶段。

## 重置后的项目结构

整个项目重置，定位是给 **vibe coding 搭建一个良好的开发环境**。体现在：

* 有控制文件：`AGENTS.md` / `SPEC` / `RULES` / `Template`
  * `AGENTS.md`：放基础上下文（常驻）。这层解决的是：AI 根本不知道你有这套机制。不写进去，AI 主动使用 skill 的概率会很低。根目录的 `AGENTS.md` 必须保留并聚焦通用规则。前后端项目需要分别写 `AGENTS.md`。
  * **Hook**：做路由增强（提高触发概率）。如果运行环境支持 hooks，就可以做一层"意图路由增强"。这层解决的是：AI 知道有 skill，但不一定想起来用。
  * **Skill**：提供流程和工具（真正执行）。这层解决的是：AI 想用了，但执行过程不稳定。
  * **SPEC**：生成两份 SDD 文档（前端一份、后端一份）。接口契约对齐，前端 SDD 中的接口调用与后端 SDD 中的接口定义必须严格对应；字段映射一致，前端 VO 中的字段名与后端返回的 JSON 字段名一一对应。
  * 全栈 SDD 生成提示词模板：

    ```text
    这是一个前后端全栈开发工作区，需要你设计技术接口方案，同时开发前后端项目；
    首先你需要 cd 到对应前后端应用目录中，创建 sdd 文件；
    所以你需要生成两份 sdd 文档，之后我会启动两个 agent 分别实现；
    在生成之前，如果你需要确认某些细节，你应当先确认后生成 sdd 文档。

    前端应用：service-frontend
    /sdd-propose  feature/your-feature-name
    前端修改入口参考：@FeatureTable/index.tsx:53-58 @columns/index.tsx

    后端应用：service-backend
    /sdd-propose  feature/your-feature-name
    后端修改入口参考接口：/api/v1/feature/list

    需求内容：（附上需求文档或描述，并提供前后端需求点清单）
    ```

* 有基础模板。

## 用户旅程（第 6 步起）

从第六步开始，在收到用户回答前，**不得创建/修改这些文件**；没有验收文档，**不得进入下一阶段**。

1. `npm install <kit>`
2. `npx <kit> init <project-name>`：初始化项目，把项目结构搭建好。
3. `cd <project-name>`
4. 运行 Agent
5. 输入业务需求
6. Agent 调用技能询问用户、完善需求 → **产出需求文档**
7. 用户查看需求文档，再进行对话并且迭代 → **调整的需求文档**
8. 根据调整的需求文档，调用技能、结合项目模板进行技术方案设计，提供 3 个技术方案以及推荐理由让用户进行选择；提供用户推荐方案，也允许用户自主定义 → **技术方案文档**
9. 调用技能，将用户选择的技术方案……

## PDCA 阶段感实现

如何实现整个 PDCA 过程的阶段感？（可以在每个大阶段暂停换 Agent / LLM。）

1. **阶段锁**

   把流程拆成阶段文件（存放在 `workflow/` 下）：

   ```text
   workflow/requirements.md
   workflow/solution-options.md
   workflow/solution-selected.md
   workflow/implementation-ready.md
   ```

   后一阶段必须引用前一阶段的确认字段，否则禁止继续。

2. **状态文件**

   写一个机器可读状态，比如 `workflow-state.json`，校验脚本读这个状态；不满足就重回上一步。

3. **禁止默认选择**

   给推荐方案，但禁止默认选择。可以改成：

   > `Selected by: Agent default`

   只允许在用户显式说"你替我选"后使用。否则方案选择必须停下来等用户。

4. **硬停顿协议**

   明确写：

   > STOP after asking the clarification question. Do not continue until the user replies.

## SDD 文档清单

一次完整的全栈 SDD 生成，会产出以下文档：

### 前端 SDD

* `proposal.md` — 需求提案，描述前端要做什么。
* `spec.md` — 技术规格，组件设计、接口调用、状态管理。
* `tasks.md` — 任务拆分，每个 task 对应一个可执行的代码变更。

### 后端 SDD

* `proposal.md` — 需求提案，描述后端要做什么。
* `spec.md` — 技术规格，接口设计、数据库设计、分层架构。
* `design.md` — 详细设计，类图、字段映射、SQL。
* `tasks.md` — 任务拆分。

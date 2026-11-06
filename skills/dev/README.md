# 开发

> "No-one knows exactly what they want"  
> — David Thomas & Andrew Hunt, _The Pragmatic Programmer_  
> （同类问题见 [mattpocock/skills §#1](https://github.com/mattpocock/skills#1-the-agent-didnt-do-what-i-want)）

| Skill                                                     | 用途                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`as-far-as-i-know`](as-far-as-i-know/SKILL.md)           | 用户写下当前理解。agent 先给结论（共识 / 部分共识 / 未达成共识 / 证据不足），再给仓库、文档和代码里的依据。不顺着话附和。                                                                                                                    |
| [`file-github-issue`](file-github-issue/SKILL.md)         | 把已经说定的问题和方案写成公开 GitHub issue。默认英文，只用仓库里已有的 label。后面的 agent 只读 issue 就能开工。                                                                                                                            |
| [`as-the-field-knows`](as-the-field-knows/SKILL.md)       | 用户写下观点。agent 先查开源和业界的常见做法，再给结论（`主流对齐` / `部分对齐` / 偏离主流 / 领域分裂 / 证据不足）和搜索依据。默认不用 subagent。                                                                                            |
| [`spec-driven-delivery`](spec-driven-delivery/SKILL.md)   | 短 Spec，带用户故事和验收。执行时按 Phase 提交，提交说明遵循 staged-commit-message。做到一半时默认不另开对抗审查；做完后默认用 subagent 查验收和代码质量，并改掉问题。                                                                       |
| [`issue-worktree-pr`](issue-worktree-pr/SKILL.md)         | 从干净的 `main` 开工作树，交付一个 issue 或口头目标。分阶段提交，然后开到 `main` 的 draft PR。手动 `/issue-worktree-pr`。                                                                                                                    |
| [`nightly-hardening`](nightly-hardening/SKILL.md)         | 晚上从给定分支或当前分支开工作树，自己改一截。默认可做的 issue，或按 improve-codebase-architecture、trim-and-deepen 的启发做小范围硬化。分阶段提交，subagent 改质量，再开到源分支的 draft PR。默认直接动手；用户要先看大纲时才停。手动调用。 |
| [`staged-commit-message`](staged-commit-message/SKILL.md) | 按 staged diff 和近期 commit 的写法写 Conventional Commit。默认一条。能拆开时，或用户要求时，拆多条，写入 `COMMIT.md`。只有用户明确说“提交”才 `git commit`。                                                                                 |
| [`prepare-release`](prepare-release/SKILL.md)             | 发版准备。先核对或声明项目版本。默认只根据上次发版以来的提交起草中英双语 release note。只有用户明确说“直接发版”或 ship，才打 tag、发布。                                                                                                     |
| [`trim-and-deepen`](trim-and-deepen/SKILL.md)             | 一大批改动之后，删掉刚改过的面上多余的代码和过度防御。架构上要加深的地方只写 proposed note，不直接改结构。手动 `/trim-and-deepen`。                                                                                                          |
| [`statechart`](statechart/SKILL.md)                       | 把代码里隐含的状态机显式化：状态、事件、不变式，画成 Mermaid 状态图，给出违反不变式的最短路径。默认不做模型检查。手动 `/statechart`。                                                                                                        |

本机这份 `file-github-issue` 给 IDE 里的 agent。Grok Bot 上的同名 skill 在 [`bots/skills/file-github-issue`](../../bots/skills/file-github-issue/SKILL.md)，两份各自维护。

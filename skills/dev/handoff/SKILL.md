---
name: handoff
description: >-
  把当前会话的进度压缩成交接文档，让下一个会话或另一个 agent 能接着干；也能从已有文档恢复上下文。
  文档默认写 OS 临时目录，按项目分目录，只放指针不复制已有材料，敏感信息要脱敏。
  只在用户显式要求「handoff」「交接」「到交接文档恢复」时使用。Manual only — 不要在会话结束、
  compact、checkpoint、上下文将满时自动触发，也不要拿它当摘要或状态汇报。
disable-model-invocation: true
---

# handoff

只在用户显式要求时写：说「handoff」「交接」「交接文档」才算。会话要结束、上下文快满、compact 之前，都不要自己生成——那是会话末尾，写出来的多半是摘要，不是交接。

不替代 commit、issue 或 PR：能写成提交的就提交，能贴链接的就贴链接，文档里只留指针。

## 写交接

先收机械状态，不要凭印象写：

```bash
git status --short
git branch --show-current
git log --oneline -n 10
git diff --stat
```

再建骨架（脚本会打印路径）：

```bash
scripts/handoff-new.sh <slug>              # 默认写 ${TMPDIR:-/tmp}/agent-handoff/<项目>/
scripts/handoff-new.sh <slug> --workspace  # 需要进仓库时写 docs/handoffs/
```

`<slug>` 用 2–4 个英文小写词描述在做的事，例如 `discord-bot-invite`，不要用 `fix`、`update` 这种看不出对象的词。

然后把每一节写实：

| 节 | 写什么 |
|---|---|
| Unfinished Tasks | 没做完的任务，带 `[in_progress]` / `[pending]`，能交接后直接重建 |
| Goal | 两三句话，为什么做这件事 |
| Recent Asks (Verbatim) | 用户最近 3–5 条原话，逐字引用；只引用户，不引自己的回答 |
| Done | 已完成并验证过的事，带路径 |
| In Progress / Next | 下一个动作是什么，卡在哪一步 |
| Open Questions | 还没定的点，等谁或等什么 |
| Key Files & Paths | 涉及的文件，写清为什么重要；用正斜杠 |
| Decisions & Gotchas | 做过的取舍、踩过的坑、不能再犯的地方 |
| How to Verify | 能复跑的命令或检查 |

空的小节直接删掉，留标题等于什么都没说。

写完打印一句指针就够了：

```text
Handoff 已写入 <路径>
新会话里执行：/handoff resume <路径>
```

临时目录里的文件可能被系统清理，重要时用 `--workspace` 落到仓库。

## 接交接（resume）

用户给路径、粘贴文档或说「接着上次」时：

1. 读文档；只有路径时先确认文件存在，不存在就列出同目录下的文件让用户挑。
2. 按 Unfinished Tasks 重建任务列表（平台有任务工具就用，没有就在回复里列成清单）。
3. 给一段简报：目标、已完成、下一步、待定问题，各一行。
4. 停下来问要不要开始，不要读完就动手。文档里的「下一步」不是授权。

例外只有用户自己说了「开始」「接着做」，这时先简报再动手。

## 硬规则

- 文档里不写 token、密钥、个人信息；路径里也别带。
- 不复制已有的 spec、issue、commit 内容，写路径或链接。
- 不把交接文档当 commit 的替代品；代码状态以 git 为准。
- 完成的工作不需要 handoff，那是 commit 和 PR 的事。
- 用户没提 handoff 就不要主动生成。

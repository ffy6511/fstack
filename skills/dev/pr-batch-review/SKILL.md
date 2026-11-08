---
name: pr-batch-review
description: >-
  批量审 PR：先用脚本做机械筛选，再按合并风险分三档（可直接合 / 要先本地验证 / 要作者改）。
  要验证的一个 PR 开一个 worktree 和一个 herdr pane 并行跑，最后汇总成表。
  默认不发评论、不 approve、不 merge。用户说「批量看 PR」「过一遍 open PR」「帮我分流 review」时使用。
---

# pr-batch-review

把一批 open PR 变成一张能直接做决定的表，外加少量本地验证结论。默认不动远端。

## 输入

开工前确认三件事，缺哪件就问：

- 仓库：`owner/repo`。用户没说时用 `gh repo view --json nameWithOwner` 取当前目录的。
- 数量：默认 30。超过 30 先问要不要分批。
- 要不要本地跑：默认允许；用户说「只看不跑」时停在第二步。

## 第一步：机械筛选

```bash
scripts/prefilter.sh owner/repo 30
```

这一步只列事实，不做判断。按规则直接归档，不进入后面的阅读：

| 看到什么 | 归到哪 |
|---|---|
| `isDraft` 为 true | 草稿，先不问 |
| CI 红 | 「CI 红，先修」 |
| CI pending | 「等 CI」 |
| `mergeable` 是 `CONFLICTING` | 「有冲突」 |
| 只改文档 | 轻通道：读完确认没夹带代码即可 |
| 只动依赖 | 单独列，看锁文件和版本跨度 |

## 第二步：读规格

每个 PR 控制在 3 分钟内：

```bash
gh pr view <n> --json title,body,files,reviews,comments,closingIssuesReferences
gh pr diff <n>
```

- 有关联 issue 时先读 issue 正文和 non-goals。issue 是 spec，PR 描述只是作者的说法。
- 读项目根的 `AGENTS.md` 和相关 `docs/`，规则写在那里。
- 已有的 bot review（Codex 之类）先看一遍。已提的发现标 `[已提]`，只补新的，不重复劳动。
- 扫 diff 时先对一件事：改动面和 PR 描述是否对得上。

## 第三步：分三档

| 档 | 判据 | 产出 |
|---|---|---|
| A 可直接合 | CI 绿、无冲突、改动自洽、描述与 diff 一致、有对应测试、不碰对外契约 | 写清「看了什么、还有什么没验」 |
| B 要本地验证 | 读代码判断不了：布局、并发、平台差异、性能、交互 | 写出要验的具体行为和验收动作 |
| C 要作者改 | 契约与实现不一致、文档或测试没同步、超出 issue 范围、缺边界处理 | 行级 findings 加严重度 |

明显属于 C 的 PR 不要塞进「本地测一下」。跑起来正常也不代表契约完整。

## 第四步：B 档并行验证

一个 PR 一个 worktree，一个 pane。树直接停在 PR 头，不建本地分支；要代作者改时用显式 refspec 推回。开工前读 [references/pane-brief.md](references/pane-brief.md)，按模板写 brief。

**worktree 目录名必须带 PR 号**：统一 `<worktree_root>/<repo>-pr-<n>`；用 worktrunk 建树时用 `<repo>.pr-<n>`。不要拿分支名、issue 号或任务名当目录名——并行开几个之后，一眼分不清哪个目录对应哪个 PR，回头找人、推回、清理都会出错。

### 一个 pane 只做一个 PR

默认一个 pane 只审一个 PR：pane 名 `pr-<n>`，worktree 里只有那一个 PR 的树，brief 里写明范围只限它。

只有两种情况可以合进同一个 pane：

- 两个 PR 是 stacked 关系，一个的 base 就是另一个的头分支；
- 同一个 issue 拆出的连续分片，分开验没有意义。

合并时 pane 名写成 `pr-<a>+pr-<b>`，worktree 仍然各建一个，brief 里写清为什么合。除此之外，验证中顺带发现的其它 PR 问题只记进汇总，不在这个 pane 里顺手改、顺手验。

```bash
# 1) 读头分支和来源
gh pr view <n> --json headRefName,headRepositoryOwner,isCrossRepository,maintainerCanModify

# 2) fork 加成本地 remote（同仓库 PR 跳过）
git remote get-url <owner> >/dev/null 2>&1 || \
  git remote add <owner> https://github.com/<owner>/<repo>.git

# 3) 抓头分支，detached 开树：没有分支，就没有上游，也不会多出影子分支
#    目录名必须带 PR 号（<repo>-pr-<n>），不要用分支名
git fetch <owner> refs/heads/<headRefName>:refs/remotes/<owner>/<headRefName> --no-tags
git worktree add --detach <worktree_root>/<repo>-pr-<n> FETCH_HEAD

# 4) 起 pane 派单
python3 <herdr-dshbot>/scripts/herdr_dsh.py spawn --name pr-<n> --cwd <worktree>
python3 <herdr-dshbot>/scripts/herdr_dsh.py send --pane <pane> --text '<单行 brief>'
```

### 要代作者改并推回时

detached HEAD 也能推，refspec 写全就行：

```bash
git -C <worktree> push <owner> HEAD:refs/heads/<headRefName>
```

想留一条同名本地分支（改起来顺手）时：

```bash
git -C <worktree> switch -c <headRefName>
git -C <worktree> push --set-upstream <owner> HEAD:<headRefName>
```

- 不要先造 `pr-<n>` 再推：名字对不上，push 会落到一条新分支。
- 推回前确认 PR 开了「Allow edits by maintainers」。没开或没权限会被拒，改走给作者提建议。
- 用户没让改就不 push；验证阶段的改动留在 worktree 里，报告里写清。

- 并发上限 4 个 pane，超了分批。
- 单个 PR 上限 30 分钟，读和验证合计。到点没结论就写「未完成」，不硬撑。
- 不跑全量 e2e。UI 改动用截图对比，边界只验这一处。

## 第五步：汇总

固定结构，不按 PR 顺序堆流水账：

1. 一张表：`PR | 档 | 一句话结论 | 证据 | 下一步`
2. A 档一段：每行写「改动做了什么、看过哪些文件、没验什么」。
3. C 档用 findings：`文件:行` + 严重度（P0 阻塞 / P1 应改 / P2 可跟）+ 一句为什么。
4. 「未验证」单独一节：哪条没验、为什么、补验要多久。

## 硬规则

- 不发评论、不 approve、不 merge；默认不 push，用户点名代作者改时才推回 PR 分支。要发评论先问。
- 一个 pane 只做一个 PR；合并的例外只有 stacked 和同一 issue 的连续分片，且 pane 名要写清 `pr-<a>+pr-<b>`。
- worktree 目录名和 pane 名都要带 `pr-<n>`：以后按 PR 号就能直接定位目录和会话。
- 只碰自己开的 worktree 和 pane，用户已有的 pane 只读。
- 不确定写「未确认」，不猜。
- PR 描述不是事实来源，以 diff 和 issue 为准。
- A 档也要写「看了什么」。没读就归 A 档，等于替作者背书。

## 收尾

pane 用完先问要不要留，用户还要看就留着；worktree 不删，交给用户处置。

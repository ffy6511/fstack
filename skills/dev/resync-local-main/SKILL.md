---
name: resync-local-main
description: >-
  本地分支有未推送的提交、远端同一分支又出现了新提交时，先备份并暂存本地改动，拉取远端，
  再把本地提交重放到远端之上，最后校验内容没变、恢复工作区。默认不 push。
  用户说「远端 main 有新提交」「先 stash 再 pull 再重放」「本地落后了」时使用。
---

# resync-local-main

用在一种具体局面：本地 `main`（或任意跟踪分支）有几个没推的提交，远端同一分支又前进了。要的结果是本地提交原样保留、排到远端最新提交之后，也就是 rebase 一遍。

## 什么时候不该用

- 想丢掉本地提交：那是 `git reset --hard origin/main`，先问清楚再动。
- 当前是 detached HEAD。
- 仓库里有进行中的 rebase、merge 或 cherry-pick：先处理完。

## 一条命令

```bash
scripts/resync.sh                  # 基线取当前分支的上游
scripts/resync.sh origin/main      # 显式指定
scripts/resync.sh --dry-run        # 只看计划，不动 git
```

脚本顺序固定：

1. 把当前 HEAD 记到 `refs/backups/resync-<时间>`。
2. 工作区有改动就先 `git stash push`（加 `-u` 连未跟踪文件一起收）。
3. `git fetch <remote> --prune`。
4. 已经包含远端就结束；否则 `git rebase <base>`。
5. 重放后比对内容：`git diff <备份> HEAD`，不一致就逐个文件列出来。
6. `git stash pop` 把工作区还回去。

## 冲突时

脚本停下，打印冲突文件和三条出路：

```bash
# 解决后继续
git add <文件> && git rebase --continue

# 放弃，回到重放前的状态
git rebase --abort && git reset --hard refs/backups/resync-<时间>

# 工作区改动还在 stash 里
git stash list
```

冲突时不要替用户选一边。两边改到同一处，只有用户知道要哪个。

## 验收

- `git log --oneline <base>..HEAD` 的提交集合和重放前一致，顺序变了、内容没变。
- `git diff <备份> HEAD` 为空。
- 工作区回到重放前的样子，stash 已 pop。
- 没有 push。

## 推不推

默认不推。rebase 之后本地历史和远端分叉，真推要用 `git push --force-with-lease`，并且用户明确说了才做。

## 边界

- 分支名不写死 `main`。基线默认取分支自己的上游，取不到再让用户传。
- 本地范围里有 merge 提交时，普通 rebase 会压平它们。脚本会提示；要保留合并结构得换 `--rebase-merges`，那是另一个决定，先问。
- 目标分支如果在另一个 worktree 里被检出，去那边操作，不要在这里硬切。

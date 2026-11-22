---
name: resync-local-main
description: >-
  两种同步：把分支 A 的本地提交和未提交改动同步到本地 main，先更新 origin/main
  并重放 main 自身的未推送提交，再把改动在 main 上重新提交，A 的提交不动；
  或把当前分支重放到它自己的远端最新提交之上。全程备份、stash 和校验，默认不 push。
  用户说「把分支 A resync 到 main」「当前分支 resync」「本地落后了」时使用。
---

# resync-local-main

先确认方向和目标。用户说「把分支 A resync 到 main」「把分支同步到本地 main」时，源是分支 A，目标是本地 `main`。用户说「当前分支 resync」时，目标就是当前分支，基线取它自己的上游。

## 分支 A 同步到本地 main

在分支 A 的 worktree 执行：

```bash
scripts/sync-to-main.sh          # 默认目标 main
scripts/sync-to-main.sh main
scripts/sync-to-main.sh main --dry-run
```

顺序固定：

1. 找到检出目标 `main` 的 worktree，要求它工作区干净。
2. 备份分支 A 和目标 `main` 的 HEAD。
3. `git fetch` 目标分支的远端。`main` 能快进到 `origin/main` 就快进。两边分叉时，把 `main` 自己的未推送提交逐条重放成新提交再接到 `origin/main` 上，并逐提交校验 patch-id。
4. 用 stash 收走分支 A 的未提交改动，包括未跟踪文件。
5. 在目标 worktree 的临时分支上，把 A 独有的提交按从旧到新逐条重放成新提交。提交说明和作者保留，作者时间与提交时间用重放当时，所以这些提交是 `main` 上最新的。不跑 pre-commit 和 commit-msg 钩子。A 自己的引用完全不动。
6. 逐提交校验 patch-id，`main` 快进到临时分支，删掉临时分支。
7. 把分支 A 的 stash 应用到 `main` 的 worktree，成功后再删掉 stash。分支 A 工作区干净，提交原样保留。

两类提交都要保留：

- 源分支 A 独有的提交，在 `main` 上重放成带当前时间的新提交，不搬 A 的引用。
- 目标 `main` 自己的未推送提交，以同样的方式接到最新 `origin/main`。

源分支没有独有提交时，重放数量为 0，只迁移工作区改动。已经 push 过的分支也能当源分支：脚本只写目标分支，A 的提交哈希不变，不用 force push。

目标结果是：`main` 上有两种重放出来的新提交，加上分支 A 原来的未提交改动；分支 A 的提交和哈希保持原样，只不再保留未提交改动。只把 A 快进到 `main` 会漏掉工作区改动，不能作为完成状态。

## 当前分支同步到自己的上游

「当前分支 resync」或「更新当前分支」使用：

```bash
scripts/resync.sh                  # 基线取当前分支的上游
scripts/resync.sh origin/main      # 显式指定
scripts/resync.sh --dry-run        # 只看计划，不动 git
```

先备份 HEAD，stash 当前工作区，fetch 当前分支的远端上游，再把当前分支的未推送提交逐条重放成新提交，接到最新上游之上。作者时间与提交时间用重放当时。最终历史是「远端更新 → 刚刚重放的本地提交」，每笔提交的补丁保持不变。

## 先找对工作树

目标分支可能检出在另一个 worktree。先运行：

```bash
git worktree list --porcelain
```

`sync-to-main.sh` 从源分支的 worktree 执行，会自己定位 `main` 的 worktree。`resync.sh` 从要更新的那个分支的 worktree 执行。

## 什么时候不该用

- 想丢掉本地提交：那是 `git reset --hard origin/main`，先问清楚再动。
- 当前是 detached HEAD。
- 仓库里有进行中的 rebase、merge 或 cherry-pick：先处理完。

## 冲突时

重放在目标 worktree 的临时分支上做，冲突停在那个 worktree 里，`main` 和分支 A 都没有被改动。脚本会打印冲突文件、临时分支名、stash 提交和收尾命令。不要替用户选边。

解决后按打印的顺序收尾：

```bash
git -C <main 的 worktree> add <文件>
git -C <main 的 worktree> commit --author="<原作者>" -F <说明文件>
# 再按脚本打印的剩余提交继续重放
git -C <main 的 worktree> checkout main
git -C <main 的 worktree> merge --ff-only sync-replay-<时间>
git -C <main 的 worktree> branch -D sync-replay-<时间>
git -C <main 的 worktree> stash apply <stash 提交>
git stash drop stash@{0}
```

放弃：

```bash
git -C <main 的 worktree> checkout -f main
git -C <main 的 worktree> branch -D sync-replay-<时间>
git -C <main 的 worktree> reset --hard refs/backups/sync-to-main-target-<时间>
git stash list          # 源分支的未提交改动还在这里
```

放弃后分支 A 的改动留在 stash 里，要么 `git stash pop` 放回 A 的 worktree，要么明确说要丢掉。冲突时不要替用户选一边：两边改到同一处，只有用户知道要哪个。

## 验收

- 分支 A 到 `main`：`main` 上有源分支改动重放出来的新提交，原未提交改动已在 `main` 工作区；分支 A 工作区干净，HEAD 和 `refs/backups/sync-to-main-source-<时间>` 相同。
- 重放前后逐提交 patch-id 一致；提交数为 0 时明确记录为 0。
- 源分支的提交哈希不变。脚本会断言 HEAD 没动。
- 当前分支同步：重放前后的每一笔本地提交 patch-id 一致；`HEAD..<base>` 为空。
- 工作区回到预期状态，stash 已清理。
- 没有 push。

## 推不推

默认不推。源分支不再被改写，推它还是普通 push。`main` 自己的未推送提交会被重放到 `origin/main` 上，如果这些提交以前 push 过，本地 `main` 就和远端分叉了，推它要用 `git push --force-with-lease`，并且用户明确说了才做。

## 边界

- 分支名不写死 `main`。基线默认取分支自己的上游，取不到再让用户传。
- 本地范围里有 merge 提交时脚本停下来，不压平。要保留合并结构是另一个决定，先问。
- 重放用临时分支 `sync-replay-<时间>`。中断后临时分支、stash 和备份 ref 都留着，按脚本打印的命令收尾或放弃。
- `sync-to-main.sh` 会自动进入目标分支的 worktree；目标分支必须干净。`resync.sh` 要在待更新分支自己的 worktree 里执行。

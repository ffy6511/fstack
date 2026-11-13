---
name: resync-local-main
description: >-
  两种同步：把分支 A 的本地提交和未提交改动同步到本地 main，先更新 origin/main
  并重放 main 自身的未推送提交；
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
3. `git fetch` 目标分支的远端，把 `main` 自己的未推送提交重放到 `origin/main`，并逐提交校验 patch-id。
4. 用 stash 收走分支 A 的未提交改动，包括未跟踪文件。
5. 把分支 A 独有的提交 rebase 到更新后的 `main`，逐提交校验 patch-id，再让 `main` 快进到分支 A 的 HEAD。
6. 把分支 A 的 stash 应用到 `main` 的 worktree。
7. stash 应用成功后删除。分支 A 保持干净，`main` 得到分支 A 的提交和全部未提交改动。

两类提交都必须保留：

- 源分支 A 独有的提交，重放到更新后的 `main`。
- 目标 `main` 自己的未推送提交，重放到最新 `origin/main`。

源分支没有独有提交时，重放提交的数量为 0，工作区改动仍照常迁移。任何提交都只在本地重放，默认不 push。

目标结果是：本地 `main` 拥有两类重放后的提交，以及分支 A 原来的未提交改动；分支 A 不再保留这些未提交改动。只把分支 A 快进到 `main` 会漏掉工作区改动，不能作为完成状态。

## 当前分支同步到自己的上游

「当前分支 resync」或「更新当前分支」使用：

```bash
scripts/resync.sh                  # 基线取当前分支的上游
scripts/resync.sh origin/main      # 显式指定
scripts/resync.sh --dry-run        # 只看计划，不动 git
```

先备份 HEAD，stash 当前工作区，fetch 当前分支的远端上游，再把当前分支的未推送提交 rebase 到最新上游之上。最终历史是「远端更新 → 本地提交」，本地提交内容保持不变。

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

脚本停下并打印冲突文件。两条路径都不要替用户选边：

```bash
# 解决后继续
git add <文件> && git rebase --continue

# 放弃，回到重放前的状态
git rebase --abort && git reset --hard refs/backups/sync-to-main-source-<时间>

# stash 还保留在列表里
git stash list
```

冲突时不要替用户选一边。两边改到同一处，只有用户知道要哪个。

## 验收

- 分支 A 到 `main`：`main` 包含分支 A 重放后的提交，原未提交改动已在 `main` 工作区；分支 A 工作区干净。
- 源分支和目标 `main` 的本地提交在重放前后 patch-id 一致；提交数为 0 时明确记录为 0。
- 当前分支同步：重放前后的每一笔本地提交 patch-id 一致；`HEAD..<base>` 为空。
- 工作区回到预期状态，stash 已清理。
- 没有 push。

## 推不推

默认不推。rebase 之后本地历史和远端分叉，真推要用 `git push --force-with-lease`，并且用户明确说了才做。

## 边界

- 分支名不写死 `main`。基线默认取分支自己的上游，取不到再让用户传。
- 本地范围里有 merge 提交时，普通 rebase 会压平它们。脚本会提示；要保留合并结构得换 `--rebase-merges`，那是另一个决定，先问。
- `sync-to-main.sh` 会自动进入目标分支的 worktree；目标分支必须干净。`resync.sh` 要在待更新分支自己的 worktree 里执行。

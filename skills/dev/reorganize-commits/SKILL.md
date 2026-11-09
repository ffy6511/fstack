---
name: reorganize-commits
description: >-
  把当前分支上未推送的提交和工作区未提交的改动当成一个整体，重新拆成若干提交。
  重排前后文件内容逐字节一致，不 push、不碰远端。用户说「重新组织 commit」「undo 掉这些提交重新提交」
  「把未提交改动和旧提交一起重排」「整理一下提交历史」时使用。
---

# reorganize-commits

整理的是**本地**这一批改动：当前分支上还没 push 的提交，加上工作区里还没提交的修改。目标是把它们合成一个整体，按意图重新切成几个提交。最终文件内容和现在完全一样，功能不变。

不做的：不 push，不改远端，不动已经推送出去的提交，不改代码本身。分支已推送、本地又领先时，只重排领先的那部分；剩下的需要 force-push，那是另一个决定。

## 第一步：确认范围和基线

```bash
git status --short
git log --oneline --graph -n 15
```

基线取法：

- 分支有上游：用 `@{upstream}`，范围就是本地领先的那些提交。
- 分支没有上游（比如 `issue-worktree-pr` 建的树）：用 `git merge-base HEAD origin/main`，也就是分叉点。不要用 `origin/main` 的最新提交，否则会把别人后进的提交卷进来。

工作区有进行中的 rebase / merge / cherry-pick 时，先处理完再开始。

默认不 fetch、不 pull。用户没明说远端有更新，就不要碰网络。

用户明确要求「先同步远端」时，先走 `resync-local-main`：备份 HEAD、stash 工作区、fetch、把本地提交 rebase 到远端之上、校验、恢复工作区；同步完再回来整理提交。

## 第二步：快照并摊平

```bash
scripts/snapshot.sh --dry-run   # 先看范围
scripts/snapshot.sh             # 快照、建备份 ref、摊平到基线
```

脚本按顺序做三件事：

1. 先看一眼 `git status`，别把构建产物或大文件带进快照；然后 `git add -A` 提交一个本地临时提交，把「已提交 + 未提交 + 未跟踪」合成一份。这是安全网：不这样做，`git reset` 之后未提交的改动就找不回来了。
2. 把 HEAD 记到 `refs/backups/reorg-<时间>`。这个 ref 不 push，重排完成后只留在这里。
3. `git reset <基线>`：提交从分支上消失，所有改动回到工作区，索引清空。

## 第三步：分组

先看范围，再提方案：

```bash
git status --short
git diff                                     # 摊平后的全部改动
git log --oneline <基线>..refs/backups/reorg-<时间>   # 旧提交，作为意图参考
```

给出分组表（路径 → 目的 → 拟用 message），等用户确认再动手。旧提交的消息只当草稿：内容已经合并过，照抄会写出和 diff 不符的说明。

分组按意图，不按目录。一个文件只属于一组最省事；确实要拆到一个文件里两组改动时，用 `git apply --cached` 打补丁，再用 `git diff --cached` 核对。不要用 `git add -p`，它是交互式的。

## 第四步：逐组重建

```bash
git add -- <这一组的路径>
git status --short          # 确认只有这一组进了索引
git commit -F - <<'EOF'
<type>(<scope>): <description>

- <point>
EOF
```

提交消息的格式和拆分规矩按 `staged-commit-message`，不在这里重复。范围里有 merge 提交时先问一句：这个流程会把它们压平。

## 第五步：校验等价

```bash
scripts/verify.sh refs/backups/reorg-<时间>
```

通过的条件是两条都成立：

- `git diff <备份> HEAD` 为空，也就是最终内容和快照逐字节一致；
- `git status` 干净，没有漏提交的改动。

不一致就回滚，不要在这上面修修补补：

```bash
git reset --hard refs/backups/reorg-<时间>
git reset HEAD^    # 连快照提交也去掉，回到「旧提交 + 未提交改动」的原样
```

## 硬规则

- 不 push，不 fetch，不碰远端。
- 等价性是验收标准，靠内容比对证明，不靠「测试通过」推断。
- 分组时如果需要改代码才能拆开，停下来说明，不要为了让提交好看而改代码。
- 校验通过后再问用户要不要删备份 ref；没确认就留着。

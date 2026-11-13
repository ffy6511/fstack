#!/usr/bin/env bash
# 把当前分支的提交和未提交改动同步到另一个 worktree 中的目标分支。
# 默认目标为 main；默认不 push。
#
# 用法: sync-to-main.sh [目标分支] [--dry-run]

set -euo pipefail

target="main"
dry=0

usage() {
  cat <<'EOF'
用法: sync-to-main.sh [目标分支] [--dry-run]

  目标分支          默认 main，必须检出在另一个 worktree
  --dry-run         只检查并打印计划，不动 git
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
    *) target="$1"; shift ;;
  esac
done

die() { echo "$1" >&2; exit 2; }

git rev-parse --git-dir >/dev/null 2>&1 || die "不在 git 仓库里"

source_branch=$(git branch --show-current)
[ -n "${source_branch}" ] || die "当前是 detached HEAD，先切回源分支"
[ "${source_branch}" != "${target}" ] || die "源分支和目标分支都是 ${target}"

target_worktree=""
current_worktree=""
while IFS= read -r line; do
  case "${line}" in
    "worktree "*) current_worktree=${line#worktree } ;;
    "branch "*) [ "${line#branch }" = "refs/heads/${target}" ] && target_worktree=${current_worktree} ;;
  esac
done < <(git worktree list --porcelain)
[ -n "${target_worktree}" ] || die "目标分支 ${target} 没有检出在 worktree 里"

for dir in . "${target_worktree}"; do
  for state in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD; do
    if [ -e "$(git -C "${dir}" rev-parse --git-path "${state}")" ]; then
      die "${dir} 有进行中的 ${state}，先把它处理完"
    fi
  done
done

remote=$(git config "branch.${target}.remote" || true)
merge=$(git config "branch.${target}.merge" || true)
[ -n "${remote}" ] && [ -n "${merge}" ] || die "目标分支 ${target} 没有上游"
upstream="${remote}/${merge#refs/heads/}"

source_commits=$(git rev-list --count "${target}..HEAD")
source_changes=$(git status --porcelain | wc -l | tr -d ' ')
source_merges=$(git rev-list --merges --count "${target}..HEAD")
target_changes=$(git -C "${target_worktree}" status --porcelain | wc -l | tr -d ' ')
target_commits=$(git rev-list --count "${upstream}..${target}")
target_merges=$(git rev-list --merges --count "${upstream}..${target}")

if [ "${dry}" = 1 ]; then
  echo "源分支：${source_branch}"
  echo "目标分支：${target}（${target_worktree}）"
  echo "目标上游：${upstream}"
  echo "源分支待重放提交：${source_commits} 个"
  echo "目标分支待重放提交：${target_commits} 个"
  [ "${source_merges}" -gt 0 ] && echo "注意：源分支范围有 ${source_merges} 个 merge 提交，普通 rebase 会压平"
  [ "${target_merges}" -gt 0 ] && echo "注意：目标分支范围有 ${target_merges} 个 merge 提交，普通 rebase 会压平"
  echo "源分支未提交文件：${source_changes} 个"
  echo "目标未提交文件：${target_changes} 个（实际执行要求为 0）"
  echo "会把两边待重放的提交和源分支全部未提交改动同步到 ${target}"
  exit 0
fi

[ "${target_changes}" -eq 0 ] || die "目标 ${target} 的 worktree 有未提交改动，先处理 ${target_worktree}"

echo "源分支待重放提交：${source_commits} 个"
echo "目标分支待重放提交：${target_commits} 个"

ts=$(date +%Y%m%d-%H%M%S)
source_backup="refs/backups/sync-to-main-source-${ts}"
target_backup="refs/backups/sync-to-main-target-${ts}"
git update-ref "${source_backup}" HEAD
git update-ref "${target_backup}" "refs/heads/${target}"
echo "源分支备份：${source_backup}"
echo "目标分支备份：${target_backup}"

commit_patch_ids() {
  git rev-list --reverse --no-merges "$1" |
    while IFS= read -r commit; do
      git show --pretty=format: "${commit}" |
        git patch-id --stable |
        awk '{print $1}'
    done
}

old_target_patches=$(commit_patch_ids "${upstream}..${target}")
old_source_patches=$(commit_patch_ids "${target}..${source_branch}")

git fetch "${remote}" --prune

if ! git -C "${target_worktree}" merge-base --is-ancestor "${upstream}" "${target}"; then
  echo "更新 ${target}：把本地提交重放到 ${upstream}"
  [ "${target_merges}" -gt 0 ] && echo "注意：目标范围里有 ${target_merges} 个 merge 提交，rebase 会压平它们"
  git -C "${target_worktree}" rebase "${upstream}"
fi

new_target_patches=$(commit_patch_ids "${upstream}..${target}")
if [ "${old_target_patches}" != "${new_target_patches}" ]; then
  echo >&2
  echo "目标 ${target} 重放前后的 patch-id 不一致。备份：${target_backup}" >&2
  exit 5
fi
echo "校验通过：${target} 本地提交 ${target_commits} 个，内容一致"

stash=""
stash_ref=""
if [ -n "$(git status --porcelain)" ]; then
  git stash push -u -m "sync ${source_branch} to ${target} ${ts}"
  stash=$(git rev-parse refs/stash)
  stash_ref="stash@{0}"
  echo "源分支改动已 stash：${stash}"
fi

echo "把 ${source_branch} 重放到 ${target}"
[ "${source_merges}" -gt 0 ] && echo "注意：范围里有 ${source_merges} 个 merge 提交，rebase 会压平它们"
if ! git rebase "${target}"; then
  echo >&2
  echo "rebase 中断。解决后：git add <文件> && git rebase --continue" >&2
  echo "放弃：git rebase --abort && git reset --hard ${source_backup}" >&2
  [ -n "${stash}" ] && echo "源分支改动仍在 stash：${stash}" >&2
  exit 3
fi

new_source_patches=$(commit_patch_ids "${target}..${source_branch}")
if [ "${old_source_patches}" != "${new_source_patches}" ]; then
  echo >&2
  echo "源分支 ${source_branch} 重放前后的 patch-id 不一致。备份：${source_backup}" >&2
  [ -n "${stash}" ] && echo "源分支改动仍在 stash：${stash}" >&2
  exit 5
fi
echo "校验通过：${source_branch} 提交 ${source_commits} 个，内容一致"

echo "让 ${target} 包含 ${source_branch} 的提交"
git -C "${target_worktree}" merge --ff-only "${source_branch}"

if [ -n "${stash}" ]; then
  echo "把源分支未提交改动应用到 ${target}"
  if ! git -C "${target_worktree}" stash apply "${stash}"; then
    echo >&2
    echo "stash 应用失败。源分支改动仍保留在：${stash}" >&2
    exit 4
  fi
  git stash drop "${stash_ref}" >/dev/null
fi

echo "完成。${target} 现在包含 ${source_branch} 的提交和未提交改动，未 push。"
echo "目标 worktree：${target_worktree}"

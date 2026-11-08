#!/usr/bin/env bash
# 把本地分支上未推送的提交重放到远端最新提交之上。
# 全程留备份，失败可回滚；默认不 push。
#
# 用法: resync.sh [基线，如 origin/main] [--dry-run] [-u|--include-untracked]

set -euo pipefail

usage() {
  cat <<'EOF'
用法: resync.sh [基线] [--dry-run] [-u|--include-untracked]

  基线              默认取当前分支的上游（branch.<name>.merge），如 origin/main
  --dry-run         只检查并打印计划，不动 git
  -u                stash 时连同未跟踪文件一起收走
EOF
}

base=""
dry=0
untracked=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry=1; shift ;;
    -u|--include-untracked) untracked="-u"; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
    *) base="$1"; shift ;;
  esac
done

die() { echo "$1" >&2; exit 2; }

git rev-parse --git-dir >/dev/null 2>&1 || die "不在 git 仓库里"

branch=$(git branch --show-current)
[ -n "${branch}" ] || die "当前是 detached HEAD，先切回要同步的分支"

for state in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD; do
  if [ -e "$(git rev-parse --git-path "${state}")" ]; then
    die "有进行中的 ${state}，先把它处理完（--continue 或 --abort）"
  fi
done

if [ -z "${base}" ]; then
  remote=$(git config "branch.${branch}.remote" || true)
  merge=$(git config "branch.${branch}.merge" || true)
  [ -n "${remote}" ] && [ -n "$merge" ] || die "分支 ${branch} 没有上游，显式指定基线，例如 origin/main"
  base="${remote}/${merge#refs/heads/}"
fi

remote=${base%%/*}
git rev-parse --verify --quiet "${base}" >/dev/null || die "基线 ${base} 不存在，先 git fetch ${remote}"

ts=$(date +%Y%m%d-%H%M%S)
backup="refs/backups/resync-${ts}"

if [ "$dry" = 1 ]; then
  echo "分支：${branch}"
  echo "基线：${base}"
  echo "本地待重放：$(git rev-list --count "${base}..HEAD") 个提交"
  echo "工作区改动：$(git status --porcelain | wc -l | tr -d ' ') 个文件"
  echo "会创建备份：${backup}"
  exit 0
fi

old_base=$(git rev-parse "${base}")
git fetch "${remote}" --prune
new_base=$(git rev-parse "${base}")

if git merge-base --is-ancestor "${base}" HEAD; then
  echo "本地已经包含 ${base}，不需要重放"
  exit 0
fi

git update-ref "${backup}" HEAD
echo "备份：${backup}"
echo "回滚：git reset --hard ${backup}"

stashed=0
if [ -n "$(git status --porcelain)" ]; then
  git stash push ${untracked} -m "resync ${ts}"
  stashed=1
  echo "工作区改动已 stash"
fi


count=$(git rev-list --count "${base}..HEAD")
merges=$(git rev-list --merges --count "${base}..HEAD")
echo "本地领先 ${count} 个提交，开始 rebase 到 ${base}"
[ "${merges}" -gt 0 ] && echo "注意：范围里有 ${merges} 个 merge 提交，rebase 会压平它们"

if ! git rebase "${base}"; then
  echo >&2
  echo "rebase 中断，冲突文件：" >&2
  git diff --name-only --diff-filter=U >&2 || true
  echo "解决后：git rebase --continue" >&2
  echo "放弃并回到原状：git rebase --abort && git reset --hard ${backup}" >&2
  [ "${stashed}" = 1 ] && echo "stash 还留着：git stash list" >&2
  exit 3
fi

echo "新历史："
git log --oneline "${base}..HEAD"

# 先把工作区还回去，再做校验：校验失败也不该把用户的改动留在 stash 里
if [ "${stashed}" = 1 ]; then
  git stash pop || {
    echo "stash 恢复有冲突，手动处理；stash 仍保留在列表里" >&2
    exit 4
  }
fi

# 重放是否保住了本地提交的改动：比较「本地相对旧基线的 diff」和「本地相对新基线的 diff」
patch_id() { git diff "$1" "$2" | git patch-id --stable | awk '{print $1}'; }
old_patch=$(patch_id "${old_base}" "${backup}")
new_patch=$(patch_id "${new_base}" HEAD)
if [ "${old_patch}" = "${new_patch}" ]; then
  echo "校验通过：本地提交的改动和重放前一致"
else
  echo "本地提交的改动和重放前不一致，逐个文件核对：" >&2
  git diff --stat "${backup}" HEAD >&2
  exit 5
fi

echo "完成。本地 ${branch} 现在领先 ${base} $(git rev-list --count "${base}..HEAD") 个提交，未 push。"

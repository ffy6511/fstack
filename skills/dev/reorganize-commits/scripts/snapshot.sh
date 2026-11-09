#!/usr/bin/env bash
# 快照当前分支（含未提交改动），记到 refs/backups，然后把分支摊平到基线。
# 只动本地历史：不 fetch、不 push、不碰远端。
#
# 用法: snapshot.sh [基线] [--dry-run]

set -euo pipefail

usage() {
  cat <<'EOF'
用法: snapshot.sh [基线] [--dry-run]

  基线        默认取分支的上游；没有上游时取与 origin/main 的分叉点
  --dry-run   只打印范围和基线，不做任何改动
EOF
}

base=""
dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
    *) base="$1"; shift ;;
  esac
done

die() { echo "$1" >&2; exit 2; }

git rev-parse --git-dir >/dev/null 2>&1 || die "不在 git 仓库里"
branch=$(git branch --show-current)
[ -n "$branch" ] || die "当前是 detached HEAD，先切回要整理的分支"

for state in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD; do
  if [ -e "$(git rev-parse --git-path "$state")" ]; then
    die "有进行中的 ${state}，先处理完"
  fi
done

if [ -z "$base" ]; then
  upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)
  if [ -n "$upstream" ]; then
    base="$upstream"
  else
    base=$(git merge-base HEAD origin/main 2>/dev/null) || die "没有上游，也找不到与 origin/main 的分叉点；显式传基线"
  fi
fi
git rev-parse --verify --quiet "$base" >/dev/null || die "基线 ${base} 不存在"

commits=$(git rev-list --count "${base}..HEAD")
dirty=$(git status --porcelain | wc -l | tr -d ' ')

if [ "$dry" = 1 ]; then
  echo "分支：${branch}"
  echo "基线：${base}"
  echo "本分支未推送的提交：${commits}"
  echo "工作区改动（含未跟踪）：${dirty}"
  echo "范围：${base}..HEAD 的提交 + 工作区改动，重排后内容不变"
  exit 0
fi

ts=$(date +%Y%m%d-%H%M%S)
backup="refs/backups/reorg-${ts}"

# 先把「已提交 + 未提交 + 未跟踪」合成一个本地临时提交，否则 reset 之后
# 未提交的改动无法找回。这个提交不 push，重排完成后只留在备份 ref 里。
pre_head=$(git rev-parse HEAD)
git add -A
if git diff --cached --quiet; then
  echo "工作区没有新改动，直接给当前 HEAD 建备份"
else
  git commit -q --no-verify -m "wip: reorg snapshot ${ts}"
fi

git update-ref "${backup}" HEAD
echo "快照：${backup}"
echo "回滚：git reset --hard ${backup}"

echo "旧提交（会全部摊平）："
git log --oneline "${base}..${pre_head}" | sed 's/^/  /'

git reset -q "${base}"
echo "已摊平到 ${base}：改动都在工作区，索引已清空"
echo "接下来：git status 看范围，分组后逐组 git add -- <路径> 再提交"

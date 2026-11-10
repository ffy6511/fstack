#!/usr/bin/env bash
# 建一份交接文档的骨架，打印落盘路径。
# 默认写 OS 临时目录（按项目分目录）；--workspace 时写进仓库 docs/handoffs/。
#
# 用法: handoff-new.sh [slug] [--workspace]

set -euo pipefail

slug=""
workspace=0
for arg in "$@"; do
  case "$arg" in
    --workspace) workspace=1 ;;
    -*) echo "未知参数：$arg" >&2; exit 2 ;;
    *) slug="$arg" ;;
  esac
done

sanitize() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//' | cut -c1-40
}

root=$(git rev-parse --show-toplevel 2>/dev/null || true)
project=$(sanitize "$(basename "${root:-$PWD}")")
[ -n "$project" ] || project="project"
[ -n "$slug" ] || slug="handoff"
slug=$(sanitize "$slug")
[ -n "$slug" ] || slug="handoff"

if [ "$workspace" = 1 ]; then
  dir="${root:-$PWD}/docs/handoffs"
else
  tmp="${TMPDIR:-/tmp}"
  dir="${tmp%/}/agent-handoff/${project}"
fi
mkdir -p "$dir"

ts=$(date +%Y-%m-%d-%H%M)
file="$dir/${ts}-${slug}.md"
[ -e "$file" ] && file="$dir/${ts}-$(date +%S)-${slug}.md"

branch=$(git branch --show-current 2>/dev/null || echo "-")
[ -n "$branch" ] || branch="-"

cat > "$file" <<EOF
# Handoff: ${slug}

$(date '+%Y-%m-%d %H:%M %Z') · ${project} · branch: ${branch}

## Unfinished Tasks

## Goal

## Recent Asks (Verbatim)

## Done

## In Progress / Next

## Open Questions

## Key Files & Paths

## Decisions & Gotchas

## How to Verify
EOF

echo "$file"

#!/usr/bin/env bash
# 校验重排后的内容和快照逐字节一致，且没有漏提交的改动。
# 用法: verify.sh <备份 ref>

set -euo pipefail

backup="${1:?用法: verify.sh <备份 ref>}"
git rev-parse --verify --quiet "$backup" >/dev/null || { echo "找不到 ${backup}" >&2; exit 2; }

fail=0

if [ -n "$(git diff --name-only "${backup}" HEAD)" ]; then
  echo "HEAD 的内容和快照不一致，逐文件看：" >&2
  git diff --stat "${backup}" HEAD >&2
  fail=1
else
  echo "HEAD 与快照逐字节一致"
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "工作区还有没提交的内容：" >&2
  git status --short >&2
  fail=1
fi

if [ "$fail" = 0 ]; then
  echo "校验通过：重排前后内容等价"
else
  echo "校验失败。回滚：git reset --hard ${backup}" >&2
  exit 3
fi

# sourced by sync-to-main.sh and resync.sh
# 把已有提交的补丁逐条做成新提交。提交说明和作者保留，
# 作者时间与提交时间用执行当时，所以重放结果是目标分支上最新的提交。

replay_one() {
  local wt="$1" commit="$2"
  local msg author

  if git -C "${wt}" rev-parse -q --verify "${commit}^2" >/dev/null; then
    echo "提交 ${commit} 是 merge，不压平。" >&2
    return 2
  fi

  msg=$(mktemp)
  git -C "${wt}" log -1 --format=%B "${commit}" >"${msg}"
  author=$(git -C "${wt}" log -1 --format='%an <%ae>' "${commit}")

  if ! git -C "${wt}" show --format= --binary "${commit}" | git -C "${wt}" apply --3way --index; then
    echo "重放冲突：$(git -C "${wt}" rev-parse --short "${commit}") $(git -C "${wt}" log -1 --format=%s "${commit}")" >&2
    git -C "${wt}" diff --name-only --diff-filter=U >&2 || true
    rm -f "${msg}"
    return 3
  fi

  if git -C "${wt}" diff --cached --quiet; then
    env -u GIT_AUTHOR_DATE -u GIT_COMMITTER_DATE \
      git -C "${wt}" commit --no-verify --allow-empty --author="${author}" -F "${msg}"
  else
    env -u GIT_AUTHOR_DATE -u GIT_COMMITTER_DATE \
      git -C "${wt}" commit --no-verify --author="${author}" -F "${msg}"
  fi
  local rc=$?
  rm -f "${msg}"
  return "${rc}"
}

replay_commits() {
  local wt="$1"
  shift
  local commit seen=0
  for commit in "$@"; do
    if [ "${seen}" -eq 1 ]; then
      echo "尚未重放：$(git -C "${wt}" rev-parse --short "${commit}") $(git -C "${wt}" log -1 --format=%s "${commit}")" >&2
      continue
    fi
    echo "重放 $(git -C "${wt}" rev-parse --short "${commit}") $(git -C "${wt}" log -1 --format=%s "${commit}")"
    if ! replay_one "${wt}" "${commit}"; then
      seen=1
      echo "尚未重放：$(git -C "${wt}" rev-parse --short "${commit}") $(git -C "${wt}" log -1 --format=%s "${commit}")" >&2
    fi
  done
  [ "${seen}" -eq 0 ]
}

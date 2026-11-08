#!/usr/bin/env bash
# pr-batch-review 第 0 步：机械筛选。只列事实，不做判断。
# 用法: prefilter.sh <owner/repo> [limit]

set -euo pipefail

repo="${1:?用法: prefilter.sh <owner/repo> [limit]}"
limit="${2:-30}"

command -v gh >/dev/null || { echo "缺 gh" >&2; exit 2; }
command -v jq >/dev/null || { echo "缺 jq" >&2; exit 2; }

gh pr list --repo "$repo" --state open --limit "$limit" \
  --json number,title,isDraft,mergeable,mergeStateStatus,reviewDecision,updatedAt,changedFiles,additions,deletions,files,statusCheckRollup \
| jq -r '
  def st: (.conclusion // .state // "PENDING");
  def ci:
    (.statusCheckRollup // []) as $c
    | if ($c | length) == 0 then "none"
      elif any($c[]; st == "FAILURE" or st == "ERROR" or st == "TIMED_OUT" or st == "CANCELLED") then "red"
      elif any($c[]; st == "PENDING" or st == "QUEUED" or st == "IN_PROGRESS") then "pending"
      else "green" end;
  def kind:
    ([.files[].path] | map(select(test("\\.(md|mdx|txt)$") | not))) as $code
    | if ($code | length) == 0 then "docs-only"
      elif any($code[]; test("(^|/)(package\\.json|pnpm-lock\\.yaml|Cargo\\.lock)$")) then "deps"
      else "code" end;
  .[]
  | [ (.number | tostring), ci, (.mergeable // "?"), (.mergeStateStatus // "?"), kind,
      (.isDraft | tostring), (.changedFiles | tostring),
      ("+" + (.additions | tostring) + "/-" + (.deletions | tostring)), .title ]
  | @tsv
' | column -t -s $'\t'

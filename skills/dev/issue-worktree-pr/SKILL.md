---
name: issue-worktree-pr
description: >
  Deliver a GitHub issue or an oral goal from a clean $BASE (user-named
  branch else main) via a new branch
  and git worktree: phase commits, optional trim, subagent acceptance, local
  CI-equivalent, a close footer on the last commit when delivering an issue,
  then a draft PR into $BASE (English). Invoke with
  /issue-worktree-pr or $issue-worktree-pr. Manual only — do not auto-run on
  generic "implement this", "open a PR", or "work on #N" requests. Do not
  implement on a dirty primary checkout. Do not merge the PR.
disable-model-invocation: true
---

# Issue worktree PR

Turn **one** issue or oral goal into a **draft PR** against `$BASE`, on an
isolated worktree. The originating chat is not the spec — the issue (or the
user's written goal) is.

Do **not** start this pipeline unless the user asked to deliver / implement.

Companion skills (read when that step runs; do not copy their rules here):

| Step | Skill |
| --- | --- |
| Phase commits | `$staged-commit-message` (phase-during-work / Commit) |
| Late simplify | `$trim-and-deepen` **TRIM track only**, if that skill is installed |
| Acceptance | one completion subagent (below). `$review` is optional extra, not required |

## Defaults

- Base: the branch the user named (e.g. canary); else canonical `main` (or `master` if that is the default). Call it `$BASE`.
- Isolation: **always** `git worktree add --no-track` + new branch from `$UPSTREAM/$BASE`. The new branch must not track `$BASE`. Never commit on the caller's dirty primary tree. Never bare-`git push`.
- Branch prefix from issue **kind**: `feat/` · `fix/` (Bug/Fix) · `docs/` ·
  `chore/`. Default `feat/` if unclear.
- PR: `--draft`, `--base "$BASE"`, **English** title and body. `gh pr create --draft --base "$BASE"` (same as nightly-hardening). `Closes #N` only
  when delivering a numbered issue — in the PR body **and** as a footer on the
  branch's **last commit** (step 7).
- Do not merge, tag, rebase-onto-base, or force-push.

## Workflow

### 1. Load the goal

- **Issue `#N`:** `gh issue view N --repo OWNER/REPO` (canonical remote, same
  rule as `$file-github-issue`). Treat the issue body as the spec: problem,
  non-goals, approach, acceptance. Record the digits as `ISSUE` (no `#`) for
  the worktree name.
- **Oral / pasted goal:** write a 5-line restatement (problem, approach,
  non-goals, acceptance, out of scope) in the reply, then proceed. Do not
  invent an issue unless the user asked.

Stop if the goal is two ownership areas with no sequencing. Ask once which
increment to deliver, or split.

### 2. Isolate from `$BASE`

In the **existing** clone (read-only for this step):

1. `git remote -v` + `gh repo view` → canonical remote `UPSTREAM`.
2. `git fetch "$UPSTREAM" "$BASE"`.
3. Confirm the current checkout is **not** already this delivery worktree.
4. Branch name: `<prefix>/<slug>` — slug from the issue title or goal, kebab,
   ASCII, ≤40 chars. Example: `#137` Feat → `feat/eval-network-reuse-attempt`.
5. Worktree name: use `ISSUE` when the goal has a numbered issue; otherwise
   use `<slug>`. Example: `#137` → `repo-wt-137`; an oral goal named
   `eval-network-reuse-attempt` → `repo-wt-eval-network-reuse-attempt`.
6. Worktree path (sibling of the repo root, never inside it):

```bash
ROOT=$(git rev-parse --show-toplevel)
PARENT=$(dirname "$ROOT")
NAME=$(basename "$ROOT")
if [ -n "${ISSUE:-}" ]; then
  WORKTREE_SUFFIX="$ISSUE"
else
  WORKTREE_SUFFIX="$SLUG"
fi
# --no-track is required. `git worktree add -b` defaults to --track when
# the start point is a remote-tracking branch (`$UPSTREAM/$BASE`). That sets
# branch.$BRANCH.merge to refs/heads/$BASE, so a later bare `git push`
# updates $BASE instead of the delivery branch.
git worktree add --no-track -b "$BRANCH" "$PARENT/${NAME}-wt-${WORKTREE_SUFFIX}" "$UPSTREAM/$BASE"
```

If that path exists, reuse the existing worktree after confirming it is for
this delivery; do not clobber it. For an oral goal, choose a different slug
and recompute the path.

Immediately verify the new branch has **no** upstream. Run this in the new worktree and stop if it fails:

```bash
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)
if [ -n "$upstream" ]; then
  git branch --unset-upstream
  upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)
fi
test -z "$upstream"
git status -sb   # must be "## $BRANCH" with no "..." tracking suffix
```

`@{upstream}` printing `$UPSTREAM/$BASE` or `refs/heads/$BASE` means the branch is still aimed at the branch it was cut from. Unset it and re-check. Do not commit, and do not push, until this check passes.

All later commands run with cwd = that worktree. Do not run a bare `git push` (no refspec) at any point in this pipeline.

### 3. Phase the increment

Read the target repo's agent/architecture docs **in the worktree** before
editing (`AGENTS.md`, `docs/design/`, issue "Design impact").

If the issue says design-first, Phase 0 is **only** the cited design/docs
paths. Then implementation phases that match Acceptance, not module layers.

Each phase:

1. Implement that slice only.
2. Focused tests for that slice (repo's documented gate, not invented CI).
3. Stage **only** those paths. Follow `$staged-commit-message` Commit /
   phase-during-work. No `git add .`.
4. Next phase on a clean tree.

Do not implement everything and split commits at the end.

### 4. Trim (optional)

If `$trim-and-deepen` is installed, run it on the **branch diff vs
`$UPSTREAM/$BASE`**. TRIM only (delete/collapse defensive redundancy). Do not
run DEEPEN unless the user asked. Commit trim as its own `refactor` /
`chore` phase if it is non-trivial.

If the skill is missing, skip. Do not invent a second trim procedure.

### 5. Completion subagent

Spawn **one** read-leaning subagent against this worktree. Give it:

- Issue URL or the 5-line oral restatement
- `git diff "$UPSTREAM/$BASE"...HEAD` (and remaining uncommitted if any)
- Acceptance list from the issue

Ask it to return: pass/fail per acceptance item, blocking vs follow-up
findings, scope creep. It must **not** edit.

Executor: fix **blocking** items, phase-commit, re-check at most **twice**.
Cheap follow-ups optional; otherwise name them in the PR, do not claim done.

Skip only if the user said so, or the change is docs-only with no code path.

### 6. CI-equivalent + docs

Before opening the PR, run what **this repo** documents for push / PR
(path-filtered jobs in `.github/workflows/` or `AGENTS.md`). Do not invent
a full matrix. Do not skip because "only docs" unless the workflow files
agree.

Docs that belong with the behavior stay in that phase's commit (or an
immediate `docs` commit). Public/reader docs must not use GitHub issue
numbers if the target repo forbids that.

Failing CI-equivalent → fix in the worktree, do not open the PR.

### 7. Close marker on the last commit (numbered issue only)

GitHub reads closing keywords from **commit messages** when the commit lands
on the default branch (rebase-merge, fast-forward, or a direct push). The PR
body alone only closes on merge-commit / squash. So for a numbered issue, the
**last** commit of the branch must carry a closing footer before the push in
step 8:

```
fix(parser): reject empty tool name

Closes #137
```

Run this in the worktree with `ISSUE` set. The commit rewrite is bounded: it
amends only the branch tip, and only before that tip was pushed.

```bash
test "$(git rev-list --count "$UPSTREAM/$BASE"..HEAD)" -ge 1   # never amend the base commit
msg=$(git log -1 --format=%B)
if printf '%s\n' "$msg" | grep -Eiq "(closes?|closed|fix(e[sd])?|resolves?|resolved)[[:space:]]+#?${ISSUE}([^0-9]|$)"; then
  echo "close marker present"
else
  tmp=$(git rev-parse --git-dir)/ISSUE_CLOSE_FOOTER
  printf '%s\n\nCloses #%s\n' "${msg%$'\n'}" "$ISSUE" > "$tmp"
  git commit --amend -F "$tmp"
  rm -f "$tmp"
fi
git log -1 --format=%B        # must end with "Closes #<N>"
git rev-list -1 HEAD          # changed: amend rewrote the tip
```

Also scan the whole branch before pushing — a stray closing keyword anywhere
will auto-close that issue once the commits land on `$BASE`:

```bash
git log --format=%B "$UPSTREAM/$BASE"..HEAD \
  | grep -Eio "(closes?|closed|fix(e[sd])?|resolves?|resolved)[[:space:]]+#?[0-9]+" \
  | grep -Eiv "#?${ISSUE}\$" || true
```

Empty output is the expected result. Anything printed closes a different issue
— confirm it is intended (a genuine cross-reference) or fix it by amending
before the push. Do not push with an unintended close marker.

Rules:

- Footer goes on the **last** commit only. Do not spray `Closes` across every
  phase commit, and do not create an empty commit to hold it.
- Append, never replace: keep the original subject and body, add one blank
  line, then the footer. A message that already closes a **different** issue
  is handled by the check above, not by stacking a second footer on top.
- Amend **before** the push. If the tip is already pushed, do not amend and do
  not force-push — report the added footer as a follow-up instead.
- Oral goals: skip this step entirely; no `Closes` in the commit or the PR.
- The PR body still carries `Closes #N` (step 8), so the merge-commit and
  squash paths close the issue too.

### 8. Draft PR

Push with an explicit destination ref. A bare `git push`, or `git push "$UPSTREAM"`, follows `branch.$BRANCH.merge` and will update `$BASE` when that config is wrong.

```bash
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)
case "$upstream" in
  ""|"$UPSTREAM/$BRANCH") ;;
  *)
    echo "refusing to push: upstream is '$upstream', not '$UPSTREAM/$BRANCH'" >&2
    exit 1
    ;;
esac
git push -u "$UPSTREAM" "HEAD:refs/heads/$BRANCH"
test "$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}')" = "$UPSTREAM/$BRANCH"
gh pr create --repo OWNER/REPO --draft --base "$BASE" --head "$BRANCH" \
  --title "<type>(<scope>): <english subject>" \
  --body-file -
```

Body (English):

```markdown
## Summary
<what changed, one short paragraph>

## Approach
<the knob / files / default = omit means old behavior>

## Test plan
- [ ] <local CI-equivalent actually run>
- [ ] <acceptance item>

Closes #<N>
```

Omit `Closes` for oral goals. Reply with the PR URL. Do not merge.

## Guardrails

- One issue/goal per worktree.
- No secrets in commits, PR body, or evidence paths.
- No host-absolute paths in tracked docs.
- PASS / product verdicts stay whatever the target repo already owns.
- Do not push from the user's primary dirty checkout.
- Do not delete the worktree unless the user asks.
- The delivery branch must not track `$UPSTREAM/$BASE`. `git worktree add -b` against a remote-tracking start point tracks that start point unless `--no-track` is passed. After create, `@{upstream}` must be empty. After the step-8 push, it must be `$UPSTREAM/$BRANCH`. A bare `git push` is forbidden for the whole pipeline.
- A numbered issue's close marker lives on the branch tip as a `<keyword> #N` footer, added by amend before the push (step 7). Only the tip; never rewrite pushed commits to add it.

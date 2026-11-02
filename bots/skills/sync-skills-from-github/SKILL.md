---
name: sync-skills-from-github
description: >-
  Use when the user asks to pull/push Grok Bot skills with GitHub, sync
  grokbot-skills, or after editing skills on another machine.
---
# Sync skills with GitHub

Repo: `ffy6511/grokbot-skills` (private). Box path: `/home/box/agent-data/workflows` (this directory is the git working tree).

## Pull (default)

1. `cd /home/box/agent-data/workflows`
2. `gh auth setup-git` if HTTPS auth fails
3. `git fetch origin` then `git status`
4. If local has uncommitted changes that would block pull, stash or stop and tell the user — do not force-overwrite without asking
5. `git pull --ff-only origin main`
6. Report which skill folders changed (new / updated / removed). Only directories that contain `SKILL.md` count as skills
7. Do not edit Cursor-managed or plugin skills; they are outside this repo

## Push (only when asked, or when the user said to publish local skill edits)

1. Same `cd`
2. `git status` / `git diff`
3. Stage only skill folders + `README.md` (never secrets, `.env`, tokens)
4. Commit with a clear message; author: Junhao Zhuo / `ffy6511@users.noreply.github.com`
5. `git push origin main` (request approval if the host blocks the push)

## Safety

- Prefer `--ff-only` pulls. Never `reset --hard` or force-push unless the user explicitly asks
- Keep recipes generic; host-specific paths belong in memory/routines, not in shared skills

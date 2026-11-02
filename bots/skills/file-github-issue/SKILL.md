---
name: file-github-issue
description: >-
  Turn a discussed problem and agreed approach into a public GitHub issue a
  later agent can implement from, without the originating chat. Use when the
  user says 写成 issue, 开个 issue, create/file an issue, 把方案写成 issue, 交给 agent 用
  issue, or /file-github-issue. Default English. Labels only from the target
  repo. Do not implement unless also asked.
---
# File GitHub Issue

Write an issue a stranger-agent can execute from. The chat is not attached.

Do **not** start implementation unless the user said to implement as well.
If anything is unclear enough to change the issue, ask the user (chat question or widget) and **wait** before creating.

## Defaults

- **English** title and body. Switch language only if the user says so, or the repo's issue templates / recent issues are clearly not English and the user did not specify.
- **Create** the issue (do not stop at a draft) unless the user asked for a draft only.
- One issue per independent increment. Split if two approaches or two ownership areas.
- File **as the user** (their `gh` login or their connected GitHub connector). Never invent a bot identity as author.

## Tooling on Grok Bot

Prefer, in order:

1. **`gh` on the user's registered machine** (Shell with that `machineId`) when they named a host checkout or you already use that machine for the repo.
2. **GitHub connector / MCP** (`issue_write` / create issue) when it is authenticated as the user and can write the target repo.
3. If neither can write: stop, say why, paste title + body for the user to file. Do **not** open a personal-fork issue silently.

Do not put secrets in the issue body. Do not commit the issue text into the product repo unless asked.

## Workflow

### 1. Resolve the repo

From context or the host checkout: `git remote -v`, `gh repo view`. Prefer the **canonical / upstream** repo the team files issues on (org remote with write access), not a personal fork, unless the user named a repo.

If remotes disagree or write access is missing, stop and say which repo you would use.

### 2. Load the project's taxonomy (required)

Read what this repo already uses. Do not invent labels.

1. `.github/ISSUE_TEMPLATE/*` (default title prefix, required sections, default labels).
2. `gh label list --repo OWNER/REPO` (or the connector's label list).
3. A few recent issues: title style and which labels actually get applied.

Pick from that set:

| Slot | What to take |
| --- | --- |
| **Kind** | Exactly one: `Feat` / `Fix` / `Bug` / `Docs` / `Chore` / `question`, or `type:feat` / `type:fix` if that is the repo's scheme. Match the template. |
| **Area** | Every material surface: `area:runtime`, `area:config`, … Only labels that exist. |
| **Priority** | `p0` / `p1` / `p2` only if the repo defines them and the user implied urgency. Default `p2` when that label exists and nothing was said. |

Title follows the repo (often `feat(scope): …` or the template's `feat: ` prefix).

### 3. Draft a self-contained body

A later agent must understand **problem + intended change** from this issue alone. Include:

1. **Problem** — what is true today, why it hurts, who hits it. Cite current code/docs with **repo-relative** paths.
2. **Non-goals** — what this issue must not change.
3. **Approach** — the agreed mechanism (which file, which knob, what default). One approach, not a menu.
4. **Operator / API surface** — env names, CLI flags, config fields; empty/default = current behavior when that is the contract.
5. **Design impact** — whether `docs/` or lock/schema must move first.
6. **Acceptance** — observable checks an implementer can fail against (including the no-change default).
7. **Pointers** — repo-relative paths and existing issue numbers only.

Follow the repo template's required headings when they exist; map the sections above into them rather than ignoring the template.

When the user pointed at a local design note (e.g. an Obsidian backlog), **absorb** the agreed decisions into these sections. Do not link private absolute paths; do not say "see backlog on my Mac".

### 4. Public-issue hygiene (hard)

**Forbidden in title and body:**

- Absolute machine paths (`/Users/…`, `/home/…`, `C:\…`).
- Local-only names as if they were the product (`my Mac`, `this laptop`, Clash subscription URLs, LAN IPs used as the design).
- Secrets, tokens, API keys, `.env` values.
- Chat debris: "as we discussed", "in this session", "you said", uncommitted draft section numbers, bot/room names as requirements.

**Required form:**

- Paths: `src/…`, `docs/design/…`, `docker/attempt/build.py`.
- Hosts and products by public name (`pypi.org`, official base image tag), not a developer's disk layout.
- If a Dataset or example must be named, use the in-repo or published name, not a checkout path.

### 5. Create and return

With `gh` (host Shell):

```sh
gh issue create --repo OWNER/REPO --title "…" --label "A,B,C" --body-file -
```

Or the equivalent GitHub connector create-issue call with the same title, labels, and body.

Reply with the **issue URL** and the **labels applied**. Do not dump the full body again.

## Tiny shape (when the repo has no stronger template)

```markdown
## Problem
…

## Non-goals
…

## Approach
…

## Acceptance
…

## Pointers
- `docs/…`
- `src/…`
```

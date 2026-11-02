---
name: getting-started
description: >-
  Use this when the imported host-coding bot first talks with its new owner, to
  set language, product checkout, git rules, and the issue→branch→e2e loop.
---
# Getting started

You help the owner take a GitHub issue or change goal, **implement it yourself on their registered host machine checkout**, commit in stages with their git author, run real e2e with screenshots, and stop short of push/PR unless they ask. Do not hand coding work to a Cursor cloud agent unless they explicitly ask for that.

On first chat, ask **one question at a time**, wait for answers, then act:

1. **What should I call you, and which language should we use by default?**
2. **What is the primary product GitHub repo, and where is the checkout on your registered computer?** (absolute path + machine). Connect GitHub if needed.
3. **What git author name/email should commits use (repo-local config), and what is the default base branch?** (default `main` if they do not say).
4. **Push / PR policy?** Default: never push and never open a PR unless they explicitly ask in that turn.
5. **How do you want e2e proven?** (desktop app screenshots, browser, unit+manual). Note whether verification skills may live only on the assistant side and must **not** be committed into product feature branches.

After answers:

- Write short **profile memories** for language, repo, host checkout path/machine, git author, base branch, push/PR policy, direct-edit-on-host (no cloud handoff by default), and e2e preference (no API keys, no tokens).
- Confirm the standing loop: issue/goal → branch from base → **you** edit and commit on the host → e2e screenshots → report; push/PR only on explicit ask.
- Do not create standing routines unless they ask.

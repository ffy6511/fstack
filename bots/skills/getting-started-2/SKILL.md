---
name: getting-started
description: >-
  Use this when the imported Daily Flow bot first talks with its new owner, to
  set language, Feishu wiki docs, X bookmark folders, and the weekday digest
  routine.
---
# Getting started

You turn X bookmark folders (and optional RSS/blog rows) into a weekday digest in Feishu. Feishu edits go through local `lark-cli --as user` only — never the Feishu/Lark MCP plugin, never AuthenticateMcpServer, never a Feishu auth card.

On first chat, ask **one question at a time**, wait for answers, then act:

1. **What should I call you, and which language should we use by default?**
2. **Where are your Feishu runbook docs?** Ask for the root wiki link, the runbook (写作口径 / 文风 / 配图), and the RSS·Blog checklist wiki (if any). Confirm they already use `lark-cli` on this computer; do not offer Feishu MCP auth.
3. **What are the X bookmark folder names for unread and done?** Default suggestion: `to read` → `done`. Confirm the X plugin is connected for their account.
4. **Where should daily digests live in Feishu?** Ask for the tree path pattern (e.g. 日报/年/月/YYYY-MM-DD) and whether same-day runs should append.
5. **When should the weekday routine fire?** Default: workdays 08:00 in their timezone, flexible window. Confirm timezone.
6. **Image policy?** Default: only architecture / explanatory figures that help understanding; skip list-style long images; target display width ~480–560px; prefer original images via `lark-cli docs +media-insert`; when unsure, skip.

After answers:

- Write short **profile memories** for language, Feishu wiki links, lark-cli-only rule, X folder names, digest path pattern, schedule/timezone, and image policy (no tokens, no passwords).
- Create or update the weekday routine from those answers: read runbook first; fetch before edit; never overwrite a whole doc; each item = short title + thorough summary + source link; move processed X bookmarks unread→done; stay quiet when there is nothing new; message the owner only when there is real content, with the day's Feishu link and item count.
- Do not auto-publish to a personal blog unless they ask.
- Start the first digests only after the routine (or a one-off they request) is set.

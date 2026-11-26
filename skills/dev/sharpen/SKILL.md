---
name: sharpen
description: >-
  把用户的提示词改深，不改大：先说顶尖从业者在这里会多做的一步、他们会从什么原始材料开始、
  用哪些方法和工具、以及除你我之外什么能证明结果是对的，再按这些重写提示词。
  只在用户显式输入 `/sharpen` 时使用。
disable-model-invocation: true
metadata:
  upstream: https://github.com/cursor/plugins/blob/main/pstack/skills/sharpen/SKILL.md
  upstream_commit: b7b93c3
  upstream_license: MIT, Copyright (c) 2026 Lauren Tan
---

# sharpen

I want a deeper version of this task, not a bigger one. Before rewriting it, do four things:

1. Say what a top professional in this field would do here that I'm not asking for.
2. Name the rawest material they would start from instead of what has already been digested for me.
3. Name the specific methods and tools they would use.
4. Say what, other than you or me, would show the result is right.

Then rewrite my prompt to ask for exactly that.

Have the rewritten prompt ask the agent to prototype any choice an experiment can settle and recommend an option based on what it observed. Leave product or preference choices that no experiment can settle for me to make.

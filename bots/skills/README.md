# Grok Bot skills

目录和 [grokbot-skills](https://github.com/ffy6511/grokbot-skills) 仓库根一致，当前同步到 [`cea1e1e`](https://github.com/ffy6511/grokbot-skills/commit/cea1e1e4553a72d39520df463bd41a0899f3ca19)（2026-11-01）。

Bot 拉取的是那个仓库。这里改完，要同步到 `grokbot-skills` 的 `main`，Bot 才会拉到。

`herdr-grokbot/scripts/grokbot-notify.sh` 目前只在本仓库。远端 SKILL 会调用这个脚本。

| Skill | 用途 |
| --- | --- |
| [`herdr-grokbot`](herdr-grokbot/SKILL.md) | 用 herdr 远程驱动本机编程 agent。完成或卡住时，webhook 唤醒 Bot。 |
| [`openchamber-grokbot`](openchamber-grokbot/SKILL.md) | 用 OpenChamber 在 Mac 上开侧边栏里能看见的编程会话。完成时 webhook 回调。 |
| [`issue-branch-e2e`](issue-branch-e2e/SKILL.md) | 在主机上从 issue 开功能分支，分阶段提交，截 e2e。默认不 push，不开 PR。 |
| [`file-github-issue`](file-github-issue/SKILL.md) | 在 Bot 上把已经说定的方案写成 GitHub issue。 |
| [`getting-started`](getting-started/SKILL.md) | host-coding bot 第一次和主人对话：语言、仓库、issue 流程。 |
| [`getting-started-2`](getting-started-2/SKILL.md) | Daily Flow bot 第一次对话：语言、飞书文档、X 书签、工作日 digest。目录名和 frontmatter 里的 `name` 不同，frontmatter 仍是 `getting-started`。 |
| [`ageval-suite`](ageval-suite/SKILL.md) | 交接或运行 ageval / TB suite 评测。 |
| [`sync-skills-from-github`](sync-skills-from-github/SKILL.md) | 把 `grokbot-skills` 和 Bot 上的 skill 目录双向同步。 |

本机 IDE 的 `file-github-issue` 在 [`skills/dev/file-github-issue`](../../skills/dev/file-github-issue/SKILL.md)。两份各自维护。

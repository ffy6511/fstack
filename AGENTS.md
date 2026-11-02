# fstack

这是个人工作流仓库。编辑时先看路径，再决定这份材料给谁用。

| 目录 | 放什么 |
| --- | --- |
| `skills/<组>/<id>/` | 本机 agent 的 skill。一组对应一类工作，里面是真实目录。 |
| `agents/<组>/AGENTS.md` | 该类工作的说明模板。链到别的项目根之后，才在那个项目里生效。 |
| `automations/<组>/<name>/` | 本机定时或无人值守任务。 |
| `bots/skills/<id>/` | Grok Bot 的 skill。目录和 [grokbot-skills](https://github.com/ffy6511/grokbot-skills) 仓库根一致。 |
| `bots/automations/<name>/` | Grok Bot 的 routine。 |
| `rules/` | 复制到 agent 用户规则的个人说明。 |

## 维护

- 根 `README.md` 只说明仓库怎么分、怎么链到项目。skill、任务、routine 的名单写在对应二级目录的 `README.md`。新增、改名或挪走一项时，改那份名单，不把名单抄回根 README。
- 组 README 先写这一组用来做什么，再列里面的 skill 或任务。句子写具体动作，不写看不出对象的比喻。
- 对外的中文说明按 [`skills/writing/humanizer-zh`](skills/writing/humanizer-zh/SKILL.md) 改。写完再跑 `skills/writing/writing-style/scripts/check_writing_style.py`。
- 本仓库里的 skill 是真实目录。软链接只放在使用它的项目里，不放进这个仓库。
- 一个 skill 只放在一个组。别的项目还要用它时，在那个项目里再链这一个目录。
- `bots/skills/<id>/` 与 [grokbot-skills](https://github.com/ffy6511/grokbot-skills) 仓库根一一对应。这里改完，同步到那个仓库的 `main`，Bot 才会拉到。同步时带上 `herdr-grokbot/scripts/grokbot-notify.sh`，远端 SKILL 会调用它。
- `skills/dev/file-github-issue` 给本机 agent，`bots/skills/file-github-issue` 给 Grok Bot。两份正文各自维护。
- 机器路径和密钥放各 skill 的 `preferences.toml`（不进 git），或本机 `~/.config/`。不写进 `SKILL.md`。新 skill 需要本机配置时，提交 `preferences.example.toml`，在 `SKILL.md` 写清首次 setup。
- `agents/<组>/AGENTS.md` 是给别的仓库用的模板。打开本仓库时，子目录里的 `AGENTS.md` 会被当成那个目录的规则。任务目录里的 vault 说明用 `vault-context.md`，不用 `AGENTS.md`。
- 说明里不写私密项目的名字、地址，也不把只在某一台机器上才成立的找回步骤写进根 README。

# DSH

只有 DSH 能用的 skill。正文直接调 DSH 自己的工具或插件（`proactive_set`、`show_view`、`herdr` 之类），别的 agent 拿去跑不了，所以不放 `skills/` 里跟通用 skill 混在一起。

| Skill                                   | 用途                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`proactive-dm`](proactive-dm/SKILL.md) | 用户说「X 之后私聊我」「过 10 分钟提醒我」时，用 dsh-proactive 在当前私聊会话建一次性闹钟，到点唤醒后主动发消息；群聊里定位不到私聊会话，不承诺。 |
| [`panel-note`](panel-note/SKILL.md)     | 用户点名「写到面板」时，往工作区 `NOTES.md` 追加一条带时间戳的小节，用户在右栏（dsh-marktext / dsh-better-sidebar）能同时看到并编辑。             |

链给 DSH 用：`ln -s <本仓>/dsh-skills/<id> ~/.dsh/skills/<id>`。

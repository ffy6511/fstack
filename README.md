# fstack

个人工作流。这个仓库放我自己的 agent 材料：本机用的 skill、到点跑的任务、Grok Bot 的 skill 和 routine、可复用的 prompt，以及换一类工作时用的说明。

不同程序读不同的目录。本机 skill 再按工作分成二级目录，里面是真实文件。要用的时候 clone 这个仓库，再把 skill 目录软链接到项目或家目录。链接不放进这个仓库。

每一组里面有什么，写在该目录的 README。

```
skills/
  obsidian/          vault 笔记、论文、学习单元、公开同步
  writing/           中文用词、文档、长文页面、代码讲解、口播视频
  blog/              正文、语法和配图
  dev/               核对理解、issue、spec、worktree、提交、发版
agents/
  obsidian/AGENTS.md vault 的目录、隐私、笔记格式
  dev/AGENTS.md      软件仓库里能复用的短说明
automations/
  obsidian/          本机定时任务
bots/
  skills/            目录同 grokbot-skills 仓库根
  automations/       Grok Bot 的 routine
prompts/
  images/            生图、改图用的风格说明
rules/
  anti-sycophancy.md 反迎合，每次对话都带
  general.md          git 操作先问，e2e 验收不主动跑
```

| 目录 | 说明 |
| --- | --- |
| [`skills/obsidian`](skills/obsidian/README.md) | vault |
| [`skills/writing`](skills/writing/README.md) | 写作与成稿 |
| [`skills/blog`](skills/blog/README.md) | 正文、记号和配图 |
| [`skills/dev`](skills/dev/README.md) | 开发协作 |
| [`skills/research`](skills/research/README.md) | 找论文、比 SOTA、精读 |
| [`automations/obsidian`](automations/obsidian/README.md) | 本机定时任务 |
| [`bots/skills`](bots/skills/README.md) | Grok Bot skill |
| [`bots/automations`](bots/automations/README.md) | Grok Bot routine |
| [`prompts`](prompts/README.md) | 生图等可复用 prompt |
| [`rules`](rules/README.md) | 用户规则 |

## 挂到一个项目

agent 读取的是 `<skills 根>/<skill-id>/SKILL.md`。项目里的 `.agents/skills` 保持普通目录，把要用的 skill 目录链进去。可以链一整组，也可以再从别的组补一个。

```bash
mkdir -p .agents/skills
ln -s ~/path/to/this-repo/skills/obsidian/* .agents/skills/
ln -s ~/path/to/this-repo/skills/writing/writing-style .agents/skills/
ln -s ~/path/to/this-repo/agents/obsidian/AGENTS.md ./AGENTS.md
```

如果这一组就是项目要用的全部 skill，可以把 `skills/<组>` 直接链成 `.agents/skills`。

`agents/<组>/AGENTS.md` 整份都能用时，链到项目根。项目自己的构建命令、目录例外，写在项目那份里。

`rules/` 里的说明复制到 agent 的用户规则。换一个仓库，这些规则仍然要带上。

每一组都要出现在所有项目里时，把链接放进会随所有项目加载的 skill 目录。只在某一类项目里使用时，链接放在该项目的 `.agents/skills`。

## 本地偏好

机器相关路径和工具选项放在各 skill 的 `preferences.toml`，**不进 git**。仓库只保留 `preferences.example.toml`。

```bash
cp skills/<group>/<name>/preferences.example.toml skills/<group>/<name>/preferences.toml
# 编辑 preferences.toml，设 initialized = true
```

根目录 `.gitignore` 已忽略 `**/preferences.toml`。新增带本机配置的 skill 时，example 进仓，真实文件 gitignore，`SKILL.md` 写清首次 setup。

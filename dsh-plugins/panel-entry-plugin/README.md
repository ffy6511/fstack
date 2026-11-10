# @fstack/dsh-panel-entry

右侧栏多一个 **Panel** 入口。打开它，工作区里的 `NOTES.md` 就作为文件资源在右栏打开——渲染交给已经认领 `.md` 的 tab 类型（`dsh-marktext` 的所见即所得，或官方预览）。本插件自己不画文档。

## 为什么是它

配套 [`panel-note`](../../dsh-skills/panel-note/SKILL.md) skill 的约定：用户点名要写进面板的内容，agent 用 `write`/`edit` 追加到 `NOTES.md`，用户在右栏同一份文件上协作。这个插件只补最后一公里——省掉「在文件树里翻到 NOTES.md 再点开」。

## 怎么工作

1. 用 DSH 原生的 `sidebarRightTabs` 注册一个 tab 类型，外加一条侧栏 guide 入口（`Panel`）。
2. tab 体里只有一句说明和一个「重新打开」按钮；挂载时自动跑一次打开流程。
3. 打开流程先问 host 的 `/dsh-panel-entry/ensure?cwd=…`：文件不在就写一份骨架，在就不动。
4. 打开时先看 `ctx.betterSidebar`：装了 `dsh-better-sidebar` 就用它的 `openFile(scope, 'NOTES.md')`，文件进它的编辑器 tab（冲突条也在那儿）。
5. 没装时退回 DSH 原生：`ctx.sidebarRight.openResource('dsh-resource://file/session/<sid>/NOTES.md')`，由认领 `.md` 的 tab 类型接手（`dsh-marktext` 或官方预览）。

不注册工具、不写文件、不存状态；编辑器的选择交给宿主和已装的插件。

## 安装

从一个 checkout 装进 profile：

```bash
git clone https://github.com/ffy6511/fstack.git
dsh plugin --profile desktop add ./fstack/dsh-plugins/panel-entry-plugin
```

然后**完全退出并重开 DSH**。客户端 bundle 只在启动时加载，刷新页面不够。

## 已知边界

- 只认工作区根目录的 `NOTES.md`；文件名写死在 `client.js` 顶部的 `FILE`。
- 文件不存在时先建再开：host 侧 `/dsh-panel-entry/ensure` 用 `wx` 写一份只有标题和一句说明的骨架，已有文件绝不覆盖。
- 会话 id 先取 tab 自带信息，取不到就找主视图保留的那个会话；两者都没有时 tab 里显示一行错误，不静默失败。

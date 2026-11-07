# Pele 图表 · Pele diagrams

用 [Pele](https://github.com/obsidianmd/pele) 1.13.0 渲染对话中的 Mermaid 代码块。

- 自动识别 `mermaid` / `mermaidjs` / `mmd` 围栏代码块，覆盖 Mermaid 12.1 的内置类型。
- 图表 / 源码双向切换，源码可复制。
- 缩放、拖拽平移、恢复 100%、适应视图、双击切换、全屏预览、SVG 下载。
- 流式输出时等内容稳定再渲染；解析失败或超限时回退源码。
- 节点标签里的 `$$...$$` 用 KaTeX 排版（MathML），只在出现公式时加载 KaTeX。
- 「设置 → Pele 图表」可调主题色、圆角、图表字号、配色、默认视图、工具栏、最大高度和缩放动画，带实时预览。

## Pele 和 Mermaid.js

Pele 读取 Mermaid 语法，但用自己的布局和视觉风格，和 Mermaid.js 的默认外观不一致。

- 布局、节点间距和连线路由由 Pele 决定；需要和 Mermaid 文档完全一致的外观时，用 Mermaid.js 的渲染器。
- 主题用 CSS 变量，改主题色、圆角、配色不需要重新渲染 SVG。
- 不支持任意 HTML 标签和 JS 点击回调；链接支持。
- 数学公式由插件额外挂载的 KaTeX 提供，输出 MathML，依赖浏览器的 MathML 支持。
- 运行时约 733 kB raw / 270 kB gzip；KaTeX 只有出现 `$$` 时加载。

## 安装与更新

用 DSH 的插件安装流程选择本目录，装进要用的 profile。安装会把这个目录链接到 profile 的 `node_modules`，源目录不要移动或删除；改完 `client.js`、`index.js` 后重载插件生效。

安装、更新和卸载的具体命令见[根 README](../../README.md) 的「DSH 插件」一节。

## 设置与数据

设置页在「设置 → Pele 图表」。偏好保存在 `$DSH_HOME/pele-diagram/settings.json`（默认 `~/.dsh`），同时在当前浏览器缓存一份。

## 构成

- `index.js` — Host 半：Pele 和 KaTeX 运行时路由、外观设置读写路由。
- `client.js` — 浏览器半：代码块增强、图表卡片、全屏查看器和设置页。
- `vendor/pele-1.13.0.js` — 固定版本的 Pele 全量浏览器包（MIT，见 `vendor/pele.LICENSE`），按需加载，不走 CDN。
- `vendor/katex-0.19.1.min.js` — 公式排版用的 KaTeX（MIT，见 `vendor/katex.LICENSE`），只在出现 `$$` 时加载。
- `cordis.patch.yml` — 挂载 `pele-diagram` 这一行。

Pele 的渲染选项和 CSS 变量见 [pele.run/theming](https://pele.run/theming) 和 [pele.run/api](https://pele.run/api)。

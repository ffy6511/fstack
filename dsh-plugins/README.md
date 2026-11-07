# dsh-plugins

DeepSeek Harness 的本地插件。每个子目录是一个独立的 npm 包，源码留在这个仓库，装进 profile 后由 DSH 加载。

| 插件 | 包名 | 说明 |
| --- | --- | --- |
| [`pele-diagram-plugin`](pele-diagram-plugin/README.md) | `@fstack/dsh-pele-diagram` | 用 Pele 渲染对话里的 Mermaid 代码块：源码与图表切换、缩放、拖拽、全屏、SVG 下载、TeX 公式，设置里可改主题色、圆角、配色、字号等。 |

## 安装与更新

用 DSH 的插件安装流程选择子目录，装进要用的 profile。安装会把这个目录链接到 profile 的 `node_modules`，源目录不要移动或删除；改完 `client.js`、`index.js` 后重载插件生效。

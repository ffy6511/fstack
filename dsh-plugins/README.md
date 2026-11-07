# dsh-plugins

DSH 本地插件。一个子目录一个独立 npm 包，源码留在这个仓库，装进 profile 后由 DSH 加载。

| 插件                                                     | 包名                        | 说明                                                                                                                |
| -------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [`pele-diagram-plugin`](pele-diagram-plugin/README.md)   | `@fstack/dsh-pele-diagram`  | 在对话里渲染 Mermaid：源码与图表切换、缩放拖拽、全屏、SVG 下载、TeX 公式，主题色和字号可在设置里改。                |
| [`openui-blocks-plugin`](openui-blocks-plugin/README.md) | `@fstack/dsh-openui-blocks` | 模型用 `render_ui` 写一段 openui-lang，聊天按 harness 自己的 token 和图表规则画成指标、表格、排行条、步骤或提示块。 |

## 安装

```bash
dsh plugin --profile desktop add ./dsh-plugins/<目录>
```

然后完全退出并重开 DSH。开发约定见 [AGENTS.md](AGENTS.md)。

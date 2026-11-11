# ageval Viewer

在 DSH Web 右侧栏查看本机或 SSH 服务器上的 ageval suite runs，并把选中的结果摘要发送给当前 session 或新建 session 分析。SSH 模式按需读取轻量证据，不下载整个数据集或工作区。

## 安装

从 fstack checkout 根目录执行：

```bash
dsh plugin --profile web add ./dsh-plugins/ageval-viewer-plugin
```

通过 DSH 插件管理器加载或重载此插件。不要为了更新插件关闭正在工作的 DSH App。插件只读数据，不启动、重试、replace、删除或修改评测。

## 使用

1. 打开右侧栏的 `ageval`。
2. 点击顶部数据源：本机输入绝对路径；SSH 选择本机配置中的 Host，逐层点击目录，或输入绝对路径后点“前往”。目录列表不递归扫描整台服务器。
3. 点击“保存并打开”。已保存路径保留最近 12 个，可从顶部“最近路径”或数据源弹窗快速切换，然后按 bench、model、suite 筛选。
4. 勾选 suite，输入问题后发送给当前 session，或新建一个 session 让默认 agent 分析。
5. 点开 suite 查看 P/F/E、通过率、错误分桶和 task。点 task 打开轨迹：按用户、Agent、思考、工具、观察、终端、权限筛选，右侧细条是步骤大纲，点一下跳到那一步。`文件` tab 里是 result.json 和 summary.json。

注入给 agent 的上下文包含只读声明、dataset 根目录、suite 的状态与计数，以及用于继续用 `ageval view` 检查的路径。Host 端还注册 `ageval_read_suite` 工具，供 agent 按 bench 和 suite id 读取一个 suite 的详细摘要。

## SSH 读取

复用 DSH 所在 Mac 用户的 OpenSSH 配置（包含 Include、IdentityFile、ProxyCommand/ProxyJump、ssh-agent）。连接前以 `ssh -G` 展示配置，实际连接仍用 Host 别名。仅支持配置中的具体别名，通配符 Host 不作为端点。

服务器需要 Python 3。固定只读脚本经 SSH stdin 执行，不在服务器安装 daemon、不写脚本文件。第一次连接必须先在用户终端确认主机指纹，并让密钥可通过 ssh-agent/Keychain 非交互认证；插件不收集或存储密码。端口和跳板配置沿用 OpenSSH，控制连接使用独立短连接，避免遗留 ControlPath 不可用。

列表只取 suite 的 summary/progress，点开 Attempt 才读取 result/summary/trajectory，以及存在时的 evaluation observation/checks。不会进入 `box/`、源码、依赖、缓存和 invocation raw。断网时显示错误，不伪装为最新结果，不创建本地镜像。配置保存在 `~/.config/fstack/ageval-viewer.json`，旧 root 配置自动兼容。

## 安全边界

- dataset 根目录必须是绝对路径且存在。
- suite、bench、task 和 attempt 的读取都限制在 dataset 根目录内。
- Web API 只接受 loopback 请求。
- 插件不执行 ageval CLI，不读取凭证，不写 `.ageval`。

## 已知限制

- 当前通过 DSH 的公开 session/conversation API 将只读上下文作为一条消息发送；结构化上下文 chip 仍需 composer attach 接缝，当前版本不伪装提供该能力。
- task 详情只读取 summary 中已有的 `run_id`；若 suite 使用其他索引方式，面板只显示 suite 级摘要。
- 本机 Attempt evidence 单文件上限 192KB；SSH 单文件上限 1MB，JSONL 在完整行边界截断。尚未提供继续加载超过上限部分的分页，不把截断轨迹当成完整证据。PASS 仍以独立评测为准。
- 同一 task 若 summary 里有多次 attempt，行尾可以选择 run。没有 `run_id` 的 task 打不开轨迹。

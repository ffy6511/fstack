# ageval Viewer

在 DSH Web 右侧栏查看本机、SSH 服务器或 GitHub 仓库中的 ageval suite runs，并把选中的结果摘要发送给当前 session 或新建 session 分析。SSH 和 GitHub 模式按需读取轻量证据，不下载整个数据集或工作区。

## 安装

从 fstack checkout 根目录执行：

```bash
dsh plugin --profile web add ./dsh-plugins/ageval-viewer-plugin
```

通过 DSH 插件管理器加载或重载此插件。不要为了更新插件关闭正在工作的 DSH App。插件只读数据，不启动、重试、replace、删除或修改评测。

## 使用

1. 打开右侧栏的 `ageval`。
2. 点击顶部数据源：本机输入绝对路径；SSH 选择本机配置中的 Host；GitHub 输入 `owner/repository`、分支或 tag，再逐层浏览仓库目录。GitHub 私有仓库复用本机 `gh` 的安全登录；没有登录时可从弹窗发起设备登录。
3. 点击“保存并打开”。已保存路径保留最近 12 个，可从顶部“最近路径”或数据源弹窗快速切换，然后按 bench、model、suite 筛选。
4. 勾选 suite，输入问题后发送给当前 session，或新建一个 session 让默认 agent 分析。
5. 点开 suite 查看 P/F/E、通过率、错误分桶和 task。点 task 打开轨迹：按用户、Agent、思考、工具、观察、终端、权限筛选，右侧细条是步骤大纲，点一下跳到那一步。`文件` tab 里是 result.json 和 summary.json。

注入给 agent 的上下文包含只读声明、dataset 根目录、suite 的状态与计数，以及用于继续用 `ageval view` 检查的路径。Host 端还注册 `ageval_read_suite` 工具，供 agent 按 bench 和 suite id 读取一个 suite 的详细摘要。

## GitHub 读取

GitHub source 固定到打开时解析出的 commit。通过本机 `gh` 读取凭证和 API，token 不进入浏览器、配置文件、分析上下文或远端请求。公开仓库可在未登录时回退到 GitHub API；私有仓库需要本机 `gh` 已登录且账号能读取仓库。登录按钮只启动 `gh auth login --hostname github.com --web` 的设备流程，插件展示一次性代码并轮询状态，不代管密码或 token。

仓库目录用 Git Trees API 按目录读取，suite 只读取 summary/progress，Attempt 才读取 result/summary/trajectory 和 evaluation evidence。超过大小上限、Git LFS 指针、symlink、submodule 和 GitHub 截断树会明确提示，不下载整个仓库。

## 缓存管理

顶部“设置”可查看缓存策略、GitHub 目录树的内存占用，并确认清理。GitHub 账号左侧显示用户 API 返回的头像，图片地址仅允许 GitHub 官方头像域名，加载失败显示默认用户图标。

- 本机：直接读取原文件，不复制、不另存缓存。
- SSH：按需将轻量证据传入内存，不创建本地镜像或临时证据文件。
- GitHub：目录树有 Host 内存缓存，最多 256 项 / 16 MB（序列化数据估算）；证据 blob 按需读取、不落盘。重载插件后内存缓存释放。
- 没有本地磁盘缓存目录，因此不提供“打开缓存文件夹”按钮。当前页面的列表和轨迹数据保留到关闭或替换，不计入 Host 目录树缓存；头像可能由浏览器按 HTTP 策略缓存，不在插件清理范围内。
- 清理只释放插件维护的目录树缓存，不删除本机或远端原文件，不影响 GitHub 登录、配置、已保存路径或当前页面。后续浏览会重新读取目录；清理之前已经发出的目录请求不会将该次响应重新写回缓存。

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

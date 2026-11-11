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
列表在各 bench 内默认按 suite 创建时间倒序，可切换创建时间正序、通过率升降序或名称排序；缺失值始终排在最后。suite 行显示创建时间。task 行显示摘要已有的开始/完成时间和耗时；旧记录缺少时间时可点击“读取时间”，只按需读取当前 Attempt 的 summary，不下载轨迹。没有记录的时间明确显示未知，不使用文件修改时间或 suite 时间代替。

4. 勾选 suite，输入问题后发送给当前 session，或新建一个 session 让默认 agent 分析。
5. 点开 suite 查看 P/F/E、通过率、错误分桶和 task。点 task 打开轨迹：按用户、Agent、思考、工具、观察、终端、权限筛选，右侧细条是步骤大纲，点一下跳到那一步。`文件` tab 里是 result.json 和 summary.json。

注入给 agent 的上下文包含只读声明、dataset 根目录、suite 的状态与计数，以及用于继续用 `ageval view` 检查的路径。Host 端还注册 `ageval_read_suite` 工具，供 agent 按 bench 和 suite id 读取一个 suite 的详细摘要。

## 运行追踪

由 DSH 所在主机的 Agent 调用 `ageval_register_run` 登记具体 suite。SSH 实验仍由本机读取，不要求远端 Agent 上报。登记不会切换当前浏览数据源；也可在浏览结果中勾选 suite 后点击“登记追踪”。

```json
{
  "source": { "kind": "ssh", "host": "configured-host", "path": "/absolute/dataset-root" },
  "dataset": ".",
  "suite": "suite-id",
  "title": "实验名称",
  "refreshSeconds": 60
}
```

- `ageval_register_run`：按数据源、dataset、suite 去重，首次读取失败仍登记为等待证据。可以传入 `reporter` 标记 Agent/session（描述信息，不是认证身份）。
- `ageval_list_tracked_runs`：读取最近统计、观测状态与阶段历史。
- `ageval_checkpoint_run`：传入登记 `id`，立即读取真实证据并记录阶段；可传 `label` 命名。
- `ageval_archive_run`：归档停止采样；`archived: false` 恢复追踪。不停止进程、不删除实验文件。

“追踪中”按实验分组展示阶段表格，每行是首次观测或一个后续阶段，共用通过率、P/F/E、较上一阶段的净变化与观测时间列。尚未保存为阶段的最新变化单独标为“当前观测”。点击实验名称查看当前 suite/task/轨迹详情；阶段行仅展示历史统计，不伪装为历史轨迹。工具栏的刷新、记录阶段、归档，以及面板切换、发送分析等使用官方图标按钮，悬停或键盘聚焦显示官方 tooltip。

单条刷新和自动采样均复用现有 suite reader，按登记 ID 定位，无需切换选中数据源。实验操作组仅在悬停或键盘聚焦该实验时浮现，固定在当前横向滚动视口的右侧；触屏始终显示。每条记录提供“自动更新追踪记录”开关，关闭后只手动采样，设置重启后保留；已经开始的读取可能完成一次，开关不清空历史。删除按钮位于每一条采样行，确认后仅移除该阶段，保留 suite 登记、其他采样和源文件。删除中间采样后，其后一次有效结果的差值标为不可比较，不捏造重算后的 task 迁移。suite 标题只显示名称和列标题；来源、采样方式、最近读取等通过信息按钮展开。

追踪列表与详情可勾选加入 AI 分析，最多 24 条。底部可输入问题、发给当前 session 或新建 session；“已选”弹窗支持取消单条或清除选择，含其他标签页的选择也会列出。分析选择独立于浏览面板，可同时包含本机、SSH 和 GitHub。发送的是最近存储的观测及最近 8 个阶段，明确标出数据源、commit、新鲜度和读取错误，不在发送时伪装刷新。Agent 可通过 `ageval_read_tracked_suite(id)` 和 `ageval_read_tracked_attempt(id, task, run?)` 读取各自来源的实际证据，无需切换当前 viewer source；返回实际读取时间和 revision，不修改存储阶段。GitHub 使用该登记最近观测的固定 commit。

每次手动刷新都会新增一条有唯一 ID 的采样行，即使数值无变化也记录零变化；读取失败同样记录失败行，不将旧结果伪装成刷新成功。Host 默认每 60 秒自动采样（可在登记时设为 30–3600 秒），每条记录合并并发读取，后台按顺序读取、失败退避。每 5 分钟在结果变化时保存阶段，首次观测、命名检查点和完成时立即保存。已完成记录暂停自动采样，仍可手动刷新。DSH 关闭期间不采样；重启后继续，最近成功读取时间用于判断数据是否过期。`running` 只是文件中的记录状态，进程存活未验证。

GitHub 默认在未指定 commit 时跟随 ref，每次观测固定到解析出的 commit；`followRef: false` 可保持固定版本。未提交到仓库的运行结果不可见。P/F/E 变化是净变化，task 状态变化单独记录；任务总数或完整 task 集合改变时标记不可直接比较，评测配置一致性尚未验证。

登记与阶段历史保存在 `$DSH_HOME/ageval-viewer/tracking.json`（默认 `~/.dsh/ageval-viewer/tracking.json`），使用串行写入和原子替换，权限 0600。最多 100 条登记、每条保留首次观测及最近 47 个阶段（旧记录已淘汰的首次观测无法补回），文件上限 32 MB。仅保留统计及最新/阶段基线的 task 状态，不保存轨迹或工作区。这是持久化历史，不属于缓存，不会被“清理内存缓存”删除。损坏的历史不自动覆盖，现有浏览功能仍可用。

## GitHub 读取

GitHub source 固定到打开时解析出的 commit。通过本机 `gh` 读取凭证和 API，token 不进入浏览器、配置文件、分析上下文或远端请求。公开仓库可在未登录时回退到 GitHub API；私有仓库需要本机 `gh` 已登录且账号能读取仓库。登录按钮只启动 `gh auth login --hostname github.com --web` 的设备流程，插件展示一次性代码并轮询状态，不代管密码或 token。

仓库目录用 Git Trees API 按目录读取，suite 只读取 summary/progress，Attempt 才读取 result/summary/trajectory 和 evaluation evidence。超过大小上限、Git LFS 指针、symlink、submodule 和 GitHub 截断树会明确提示，不下载整个仓库。

## 设置

设置项在 DSH 自己的设置侧边栏里，不另外开面板：打开 DSH 设置，左侧选「ageval 评测追踪」。

- **数据目录**：追踪登记、阶段历史和来源配置的存放位置，默认 `$DSH_HOME/ageval-viewer`。可以改成任意绝对路径或 `~/` 开头的路径；保存时会迁移现有文件，重启 Host 后生效。旁边的「打开文件夹」在系统文件管理器里打开该目录。
- **缓存**：查看缓存策略与 GitHub 目录树的内存占用，并确认清理。GitHub 账号左侧显示用户 API 返回的头像，图片地址仅允许 GitHub 官方头像域名，加载失败显示默认用户图标。

- 本机：直接读取原文件，不复制、不另存缓存。
- SSH：按需将轻量证据传入内存，不创建本地镜像或临时证据文件。
- GitHub：目录树有 Host 内存缓存，最多 256 项 / 16 MB（序列化数据估算）；证据 blob 按需读取、不落盘。重载插件后内存缓存释放。
- 没有本地磁盘缓存目录，因此不提供“打开缓存文件夹”按钮。当前页面的列表和轨迹数据保留到关闭或替换，不计入 Host 目录树缓存；头像可能由浏览器按 HTTP 策略缓存，不在插件清理范围内。
- 清理只释放插件维护的目录树缓存，不删除本机或远端原文件，不影响 GitHub 登录、配置、已保存路径或当前页面。后续浏览会重新读取目录；清理之前已经发出的目录请求不会将该次响应重新写回缓存。

## SSH 读取

复用 DSH 所在 Mac 用户的 OpenSSH 配置（包含 Include、IdentityFile、ProxyCommand/ProxyJump、ssh-agent）。连接前以 `ssh -G` 展示配置，实际连接仍用 Host 别名。仅支持配置中的具体别名，通配符 Host 不作为端点。

服务器需要 Python 3。固定只读脚本经 SSH stdin 执行，不在服务器安装 daemon、不写脚本文件。第一次连接必须先在用户终端确认主机指纹，并让密钥可通过 ssh-agent/Keychain 非交互认证；插件不收集或存储密码。端口和跳板配置沿用 OpenSSH，控制连接使用独立短连接，避免遗留 ControlPath 不可用。

列表只取 suite 的 summary/progress，点开 Attempt 才读取 result/summary/trajectory，以及存在时的 evaluation observation/checks。不会进入 `box/`、源码、依赖、缓存和 invocation raw。断网时显示错误，不伪装为最新结果，不创建本地镜像。配置保存在 `$DSH_HOME/ageval-viewer/config.json`（默认 `~/.dsh/ageval-viewer/config.json`），旧 root 配置自动兼容。

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

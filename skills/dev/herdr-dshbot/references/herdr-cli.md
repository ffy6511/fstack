# herdr CLI 速查

按 herdr 0.8.0 写。升级后先 `herdr status` 和 `herdr pane list` 冒烟。

## 控制面

CLI 走本机 unix socket `~/.config/herdr/herdr.sock`，每条命令回一行 JSON。成功是 `{"id": "cli:...", "result": {...}}`；失败是 `{"error": {"code": ..., "message": ...}}`，退出码非 0。

从普通 shell 能完整控制：开 pane、发键、读屏、给 agent 改名。不需要 `HERDR_ENV=1`，也不需要人在 herdr 里。

## 命令面

| 命令 | 用途 |
| --- | --- |
| `herdr status` | client 与 server 状态 |
| `herdr workspace list` | workspace 列表，`result.workspaces[].{workspace_id,label}` |
| `herdr pane list [--workspace <id>]` | pane 列表。`--workspace` 只认 id（`w9`），不认名字（`dsh`） |
| `herdr pane split <pane> --direction down\|right --no-focus --cwd <dir> --env K=V` | 分屏，返回 `.result.pane.pane_id` |
| `herdr pane rename <pane> <label>` | 改 pane 名 |
| `herdr pane run <pane> <cmd>` | 在 pane 里起进程 |
| `herdr pane send-text <pane> <text>` | 往终端打字；文本里的换行会立刻提交 |
| `herdr pane send-keys <pane> <key>` | 发按键，例如 `Enter`、`Esc`、`ctrl+u` |
| `herdr pane read <pane> --source visible --lines N` | 读屏幕 |
| `herdr pane close <pane>` | 关 pane，进程一起结束 |
| `herdr tab create --workspace <id> --cwd <dir> --label <text> --no-focus` | 新 tab |
| `herdr agent list` | 所有 agent，带 `pane_id`、`agent_status`、`revision` |
| `herdr agent get <name\|pane_id>` | `.result.agent.{agent_status,revision}` |
| `herdr agent rename <pane_id\|name> <name>` | 给 agent 命名，名字在存活 agent 里唯一 |
| `herdr agent wait <name> --until <state> --timeout <ms>` | 等状态；`--until` 可重复 |
| `herdr agent read <name> --source recent-unwrapped --lines N` | 读最近输出 |

## 状态语义

| 状态 | 含义 |
| --- | --- |
| `idle` | 等输入，可以发下一条 |
| `working` | 在跑；短任务可能只存在一瞬间 |
| `blocked` | 等批准或等回答，先读屏幕 |
| `done` | 干完，界面还没回看 |
| `unknown` | 没有上报。dsh-tui 缺 `HERDR_BIN_PATH` 时一直停在这里 |

`revision` 随状态和内容变化递增。判断「任务被接走」靠它，不靠状态。

## 按键与引导页

- `dsh-tui` 首次进 pane 会弹模型引导：`Esc` 跳过，再 `Enter` 进会话。
- 输错用 `ctrl+u` 清行。
- `send-text` 里的 `\n` 会立刻提交整段，后面的行进不了同一个输入框。

## 已知限制

- `agent prompt` 报 `agent_not_ready`：dsh-tui 不在 herdr 内置 kind 里，没有 `interactive_ready`。发任务走 `pane send-text` + `pane send-keys Enter`。
- `agent wait` 不带 `--until` 时匹配 `idle` / `done` / `blocked`。发完任务立刻 wait 会命中旧状态，看起来像秒回。
- `agent start --kind dsh-tui` 不可用，`--kind` 只认内置值。
- 本地 manifest 覆盖（`~/.config/herdr/agent-detection/<agent>.toml`）只能给 herdr 已认识的 agent 打补丁，不能新增 kind。dsh-tui 靠自身上报，不需要注册。

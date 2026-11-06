---
name: herdr-dshbot
description: >-
  在 herdr 的 pane 里起 dsh-tui 跑 DSH 任务：默认共用一个 workspace，一个任务一个
  pane，pane 名写任务名，用户随时能接手。固定 HERDR_BIN_PATH 这条硬要求，只能用 pane
  层发任务，先等 revision 变化再等结算。用户提到 herdr、dsh-tui、要把 DSH 会话放进
  pane 里跑、或让任务在可见终端里跑时使用。用于本机 DSH bot；云端 Grok Bot 经远程
  shell 驱动本机的回路用 herdr-grokbot。
---

# herdr-dshbot

在 herdr 的 pane 里起 `dsh-tui` 跑 DSH 任务。用户在 herdr 里能看见那个 pane，需要时直接接手。

`scripts/herdr_dsh.py` 把这四步固定下来：起 pane、发任务、等结算、读输出。优先用它；命令面、JSON 字段、状态含义见 [references/herdr-cli.md](references/herdr-cli.md)。

两条路径分开：**本机**用 `scripts/herdr_dsh.py`；只有用户明确点名另一台机器（例如「在 mini 上」）时才用 `scripts/herdr_remote.py`，细节见 [references/remote-host.md](references/remote-host.md)。

## 前置检查

```bash
python3 scripts/herdr_dsh.py check
```

它跑 `herdr status`、`herdr --version`、`dsh-tui --version`，并打印 herdr 的绝对路径。server 没起就停下。不要裸跑 `herdr`，那是开 TUI。

## 开工前：先对齐远端基线

- 建树/派活前先 `git fetch`，分支 base 用远端默认分支（如 `origin/main`），不要拿落后的本地 main 当 base。
- 建树后核对 `git rev-parse HEAD` 等于 `origin/<base>`；本地默认分支落后就用 `git merge --ff-only origin/<base>` 快进。
- 拉不动（网络、SSH、沙箱挡住）时明确报告，不要默认沿用旧基线。

## 硬要求：HERDR_BIN_PATH 自己传

`dsh-tui` 只在三个变量同时存在时才向 herdr 上报状态：`HERDR_ENV=1`、`HERDR_PANE_ID`、`HERDR_BIN_PATH`。前两个 herdr 注入，第三个不注入。

缺第三个时它静默跳过：pane 的 `agent_status` 永远是 `unknown`，`agent get / wait / read` 全部失效，没有任何报错。手动开 pane 时带 `--env HERDR_BIN_PATH=$(command -v herdr)`；`spawn` 已经带好。

## 起任务

```bash
python3 scripts/herdr_dsh.py spawn --name issue-251 --cwd /path/to/repo
```

- 默认 workspace `dsh`。用户明确说「这批任务单独一个 workspace」时才用 `--workspace` 换。
- workspace 不存在时直接失败并列出已有的；要自动建就加 `--create-workspace`。
- 一个 tab 最多 4 个 pane。第 5 个起另开 tab。
- pane 名就是任务名；agent 名自动加 `dsh-` 前缀，但**名字只做显示，寻址一律用 pane id**。
- 输出 `{"workspace": "w9", "pane": "w9:p5", "agent": "dsh-issue-251", "target": "w9:p5"}`，后面两步用 `target`。

### 为什么不用 agent 名寻址

`herdr agent rename` 改的名字不保留：dsh-tui 每次状态变化都会重新注册自己，名字随即变空，之后 `agent get <名字>` 返回 `agent_not_found`。pane id 是稳定的，`agent get / wait / read` 都接受它。脚本已经按这个来。

## 发任务并等结算

```bash
python3 scripts/herdr_dsh.py send --pane w9:p5 --text '把 issue #251 修了，先给计划'
```

`--agent` 可选，只用于输出里标识任务名；`--pane` 是寻址键。

脚本先记 `revision`，再发文本和 `Enter`，轮询到 revision 变化（说明任务被接走），最后 `agent wait` 等 `done` / `idle` / `blocked`。

- 提示必须单行。要分几段，就分几次 `send`。
- 输出里 `timed_out: true` 表示没等到结算，去看屏幕。
- `status` 为 `done` 或 `idle` 都算跑完；`unknown` 既不是完成也不是卡住。

## 读输出和回批准

```bash
python3 scripts/herdr_dsh.py read --pane w9:p5 --lines 30
```

`send` 的输出已经带最后 40 行。`status` 是 `blocked` 时先读屏幕看清问的是什么，再决定回什么：

```bash
herdr pane send-text w9:p5 '同意，继续'
herdr pane send-keys w9:p5 Enter
```

不要不看屏幕就往里发字符。

## 收尾

```bash
python3 scripts/herdr_dsh.py close --pane w9:p5
```

关 pane 会杀掉进程。用户还要看这个会话时先问。临时开的 tab 用完清掉，保留 `dsh` workspace。

## 远端主机（只在显式点名时）

用户说「在 mini 上」「用远端那台」才走这里。没说就默认本机，不要自作主张跨机器。

```bash
python3 scripts/herdr_remote.py --host mini check
python3 scripts/herdr_remote.py --host mini spawn --name t1 --cwd /Users/zhuo/Developer/tmp --workspace dsh --create-workspace
python3 scripts/herdr_remote.py --host mini send --pane wH:p2 --text '单行任务'
```

它先把 `herdr_dsh.py` 推到远端 `~/.cache/dsh-skill/`，再用 ssh 转发子命令，其余命令面和本机完全一样。远端的三处差别——PATH 要显式补 `/opt/homebrew/bin`、workspace 可能要新建、凭据来自远端自己的 `~/.dsh/.credentials.yaml`——全部写在 [references/remote-host.md](references/remote-host.md)。

## 边界

- 只碰自己开的 pane 和 agent（`dsh-` 前缀）。用户已有的 agent 只读，不改、不关、不发输入。
- 远端只在用户点名那台机器时使用；本机的 pane 和远端 pane 不混用。
- 一次任务一个 pane。并行上限：单 tab 4 个 pane，单 workspace 2 个 tab。超了先问用户。
- 云端 Grok Bot 经远程 shell 驱动本机的回路是 `herdr-grokbot`，不要拿本 skill 顶替。

## 和官方文档的偏差

herdr 自带的 skill 要求「在 Herdr 内（`HERDR_ENV=1`）才能控制」。实测从普通 shell 走 `~/.config/herdr/herdr.sock` 能完整控制。本 skill 依赖这一点，升级 herdr 后先跑 `check` 再动。

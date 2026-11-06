# 远端主机（显式指定才走）

本 skill 的主路径是「本机」。只有用户明确点名另一台机器（例如「在 mini 上」「用远端那台」）时才走这里。

入口是 `scripts/herdr_remote.py`：它把 `herdr_dsh.py` 推到远端，再用 ssh 把子命令转过去。

```bash
python3 scripts/herdr_remote.py --host mini check
python3 scripts/herdr_remote.py --host mini spawn --name t1 --cwd /Users/zhuo/Developer/tmp --workspace dsh --create-workspace
python3 scripts/herdr_remote.py --host mini send --pane wH:p2 --text '单行任务'
python3 scripts/herdr_remote.py --host mini read --pane wH:p2 --lines 30
python3 scripts/herdr_remote.py --host mini close --pane wH:p2
```

## 远端和本机的四个差别

1. **PATH**：ssh 非交互 shell 的 PATH 只有 `/usr/bin:/bin:/usr/sbin:/sbin` 加 `~/.zshenv` 里写的内容，不含 `/opt/homebrew/bin`。脚本里已经显式设了远端 PATH；如果远端连 `python3` 都没有，先停。
2. **workspace 可能不存在**：`spawn` 默认找 `dsh` workspace，远端往往没有。用 `--create-workspace`，或先 `herdr workspace create --label dsh --cwd <目录>`。脚本报错时会列出远端现有的 workspace 名。
3. **agent 名字不参与寻址**：`send / read / status` 一律用 `--pane`。见下。
4. **凭据**：远端的 dsh-tui 用它自己 `~/.dsh/.credentials.yaml` 里的模型凭据；交互式 pane 能读到，`dsh-tui dsh headless` 这种非交互路径读不到（只认环境变量）。

## agent rename 不粘（实测 herdr 0.9.3 + dsh-tui 0.19.0）

`herdr agent rename <pane> <名字>` 当下生效，但 dsh-tui 每次状态变化都会重新注册自己，名字随即变回空。之后 `herdr agent get <名字>` 返回 `agent_not_found`。

所以：

- 寻址键只用 pane id：`herdr agent get wH:p2`、`herdr agent wait wH:p2`、`herdr agent read wH:p2` 都接受 pane id。
- 名字只做显示。`spawn` 仍然会改名，但失败不影响后续。
- `send` 的 `--agent` 变成可选，仅用于输出里标识是哪个任务。

## dsh-tui 的 headless 子命令

`dsh-tui run` 会校验 DSH 版本区间（0.19.0 只认到 0.2.1-rc.5）。远端 DSH 是 0.2.2-rc.1 时直接 `ADAPTER_UNAVAILABLE`。

- herdr 路径不受影响：它起的是交互式 dsh-tui。
- 需要一次性无界面任务时用 `dsh-tui dsh headless "<任务>"`（透传官方 CLI），不要用 `dsh-tui run`。

## 远端一次性任务（不进 pane）

不需要可见 pane 时，远端可以直接跑一条：

```bash
ssh mini 'cd <目录> && dsh-task "<任务>"'
```

前提是远端有包装脚本 `~/bin/dsh-task`：它从 `~/.dsh/.credentials.yaml` 取 `DEEPSEEK_API_KEY` 后 `exec dsh-tui dsh headless "$@"`。没有就用上面的 `dsh-tui dsh headless` 加显式 key。

## 远端记得收尾

远端 pane 会一直占着 tab。任务做完、用户也不需要看屏幕时 `close --pane`；只在 `dsh` workspace 里操作，别动用户自己的 workspace（agentero-*、ageval-* 那些）。

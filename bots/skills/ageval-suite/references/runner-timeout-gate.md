# Runner 超时硬闸

## 为什么 profile=7200 不够

ModelSpec 的 timeout/watchdog 与 parent invoke 是不同的限制。parent 会受 `parameters.agent_timeout_seconds`、`AGEVAL_AGENT_INVOKE_TIMEOUT` 和实际剩余 wall 预算约束；当前实现默认 invoke 为300秒。

2026-11-10：Mini HLE ds-pro 的 runner 未设置 invoke；zju-47 HLE qwen3.8 的 runner 继承 dataset .env 的1800秒。两份 profile 都是7200秒，lock/probe 都通过，但真实任务出现 TimeoutError/upstream_stall、BrokenPipeError 和缺 response artifact。这是执行检查遗漏；规则此前已经存在，不能以“skill 没写”为借口。

## 必须执行的检查顺序

1. 在目标机、目标 worktree 的实际启动环境加载所有 env 文件；不打印整个环境，不输出凭证。
2. 读取本次任务的 wall、evaluate、agent_invocations 和 agent_timeout_seconds，并确认各 solver/judge 的 ModelSpec timeout/watchdog；不要只检查文件名。
3. **加载全部 env 之后**显式 export 已审定的 `AGEVAL_AGENT_INVOKE_TIMEOUT`。HLE 本次配置所需为至少7200秒；单次 invoke 覆盖整题时还必须不短于任务 wall。不要把7200推广为所有 bench 通用值。
4. 同一环境中执行 `check_run_timeouts.py`；退出非0就禁止 launch，使用 shell `set -e` 或 `&&`，不能只看输出不检查退出码。
5. 通过超时检查仍不代表 task 能运行。逐 profile 完成真实单题 run，确认产物与 evaluate 无 infra ERROR；lock/probe、短chat 200 都不能代替它。
6. 正式开跑用断线保护、有 PID 和文件日志的 runner；启动后只核验允许的 timeout 环境名，确认其值与预检相同，再核对首题轨迹与评价产物。

## 只读预检命令骨架

先把路径替换为目标机真实路径，不猜 host、profile 或源码版本。这个命令只检查，不起 Attempt：

```bash
set -e
# 在目标机当前 shell 中加载已经核实的 env 文件；不要启用 set -x。
set -a
. "$DATASET/.env"
set +a
# 下值必须由题级预算和本次配置确认，不能凭模板直接跑。
export AGEVAL_AGENT_INVOKE_TIMEOUT="$APPROVED_INVOKE_SECONDS"
"$AGEVAL_PYTHON" "$SKILL_ROOT/references/check_run_timeouts.py" \
  --dataset "$DATASET" --profiles "$PROFILE" \
  --required-seconds "$APPROVED_MIN_SECONDS"
# 只有退出0，才继续其他预检与用户已授权的启动步骤。
```

- `--task <id>` 可重复以限定本次任务；省略时检查数据集所有 task.yaml。
- 使用目标 worktree 的 Python（带 PyYAML）。脚本只读 yaml 和一个 timeout 环境变量，输出模型 id、预算和 profile hash，不输出 key/base_url。
- 本脚本是独立拒绝错误配置的检查器，不是沙箱强制策略，也不会替用户启动、修复或修改产品代码。动态参数/CLI override 不在 yaml 内时，应先核对 lock 后按真实配置检查，不能把未覆盖范围当成通过。
- 同一 suite 还有未封存 Attempt 时，不能假设改 env 会重置 wall 或已消耗预算；先核对恢复契约、主控与 worker，保留旧结果，不手改 summary 伪造结算。

## 连接断开不等于任务结束

SSH exit255/broken pipe 后先查原 PID、worker、progress 和新产物；未确认主控退出就禁止重挂同一 suite。任务连续出现 infra ERROR，先精确停自己的主控，分桶并保留证据，根因与真实单题验证都通过后再恢复。

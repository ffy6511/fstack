---
name: ageval-suite
description: >-
  交接或运行 ageval / TB 类 suite 评测时使用：工作树固定、QNpR 飞书主入口与占用表（含绿底=已完等现有色）、pure
  数据集拷贝、主机偏好（新开优先 zju-47；zju-46 维持不新开；Mini 不加）、dashscope/ 前缀与 infra
  全F删跑重开、死代理预检、ERROR 须 replace 清完才算跑完、飞书禁止单字符全局替换。
---
# ageval suite 运行规范

交接 bot 跑 ageval / Terminal-Bench 类 suite 时按本 skill 执行。具体 suite id、模型名、工作树路径、目标机器由交接方当场给出，不写死在本模板里。

## 0. 飞书主入口（默认）

观察结果与进度的**主入口**：

`https://icnh9yjkbey7.feishu.cn/wiki/QNpRwyOBoibGgAk3e6PcwQwunWe`（评测计划 / QNpR）

- **一、要跑的 Bench**：总进度摘要；含 **负责 bot** 列（谁盯这条 bench）。
- **二、要跑的 Model**：含占用情况、并发；开跑前登记、结束/暂停后清占用。尽量别让表里的 model 空闲；单 model 约 4 小时无限额可考虑单独加并发。问题（限额/ERROR 堆）及时汇报协调 bot。
- **四、运行计划明细**：每配置一行。列至少含：结果/估时、**位置**（实际跑在哪：mbp/mini/bot/**zju-47**/zju-46）、**wt**、**是否同步**、**并发数**、**更新时间**、**备注**。
- **表格写法硬规则**：重要信息**优先加列**，禁止往「备注」塞长串（会撑宽表格、难观察）。备注最多一句短话，能空就空。开跑时间进「更新时间」，conc 进「并发数」，勿把 wt SHA / 口径长说明堆进备注。
- **是否同步**：默认「否」。**不要频繁同步**；须该配置**全部跑完（含清 ERROR，见 §5）且 Junhao 检查确认后**再同步并改「是」。
- 每次进度更新必须**同时**改：第四章对应表 + 开头「要跑的 Bench」。Model 占用变化时改第二章。
- 飞书读写一律 **lark-cli**（先 fetch 再定点改）；禁止浏览器改、禁止整篇 overwrite。
- **lark-cli / str_replace 硬规则（2026-10-30）**：禁止单字符或单数字全局替换（如 pattern `"1"`→`"2"`）。每次替换必须用**多字符、含足够上下文、能唯一命中目标格**的片段。曾因进度例程单数字替换污染 QNpR 全文。
- 旧汇总表 Vh4 不再作为默认进度入口，除非交接明确要求。

### 0b. 飞书表格色彩（沿用文档现有体系，勿自创）

更新 QNpR / 同类评测表时**善用现有底色**，先 fetch 看同行已有色再改，不要另起一套。

- **绿底 = 已完**（文档第四章说明）：`background-color="rgb(240,251,239)"`。仅当该行 suite **按 §5 标准真正跑完**（ERROR 已用 replace-slot / retry-errors 清干净）时，把该行设为绿底。
- 表头灰底等（如 `rgba(245,246,247,0.9)`）、以及按 bench/分区用的浅色底（文档里已有的浅黄/浅紫/浅橙等）**保持原样**，不要改成别的色。
- 在跑 / 待跑：一般不抢绿底；进度写在结果列，勿把未清 ERROR 的行标成已完绿底。

## 1. 开跑前：工作树（必须）

1. **按指定分支/commit 新建独立 worktree**，不要直接在 bare `main` 检出上跑正式评测。
2. 默认可复用约定 wt（server 上常用 `~/work/ageval-wt-main`，对应 clone `~/work/ageval`）；同一 bench 实验固定同一 wt。开跑前先 `git pull` 到交接指定的 main/分支。
3. 开跑前把 wt 的 **HEAD SHA** 写入飞书对应行的 **wt 列或极短备注**（勿写成长备注）；换 commit：先停 → 先更新飞书 → 再征得用户同意。
4. 正式跑用 **该 wt 内** 的 ageval，勿混用其它 commit 的全局二进制。
5. **共享 `.env`**：从交接指定源复制到 wt / dataset 需要处；勿把密钥写进飞书或聊天。
6. **`AGEVAL_AGENT_INVOKE_TIMEOUT`（硬）**：
   - Parent 默认 300s 会把 openai-http 非流式长推理掐成明文 `TimeoutError` → `upstream_stall` → ERROR，所以**至少**不要低于常见单次 API 需要。
   - **开跑前读该 bench 的 `limits.wall_time_seconds`（与 `agent_invocations`）**。ACP/`pi` 且 `agent_invocations: 1` 时，整段多轮会话算**一次** invoke，此时 invoke 超时 ≈ 有效 agent 预算，必须 **≥ wall_time_seconds**（TB4 全题 wall=28800 → 设 **28800**）。设成 1800 会在 ~30min 打出 `acp_timeout`，尽管 wall 仍是 8h。
   - 其它 bench 若 wall 更短或每轮多次 invoke，按 wall 与交接指定对齐；未指定时不要盲目用 1800 盖过更长的 wall。

### 1a. 实际 runner 超时硬闸（2026-11-11 补强）

**禁止仅凭 profile timeout/watchdog、lock/probe 或短 chat 200 放行。** 2026-11-10 HLE 两次启动违反了本节既有要求：Mini runner 未设 invoke（parent 默认300s），zju-47 runner 从 dataset .env 继承1800s；profile 的7200s未保护任务。详细步骤和只读检查器见 [runner-timeout-gate.md](references/runner-timeout-gate.md) 与 [check_run_timeouts.py](references/check_run_timeouts.py)。

1. 在**目标机实际启动环境**先加载全部 env，再显式 export 已按题级 wall/agent_invocations 审定的 `AGEVAL_AGENT_INVOKE_TIMEOUT`，不许被后续 source 覆盖。本次 HLE 至少7200s，但其它 bench 不套此值。
2. 同一环境运行检查器，校验 solver/judge 的 ModelSpec timeout/watchdog 和真实 invoke；退出非0则禁止 launch。必须 `set -e` 或 `&&` 联结，不能人工忽略失败。
3. 检查通过后，仍需**同配置真实单题**产物与 evaluate 验证，无 infra ERROR 才恢复 formal/清E；每个 profile 独立验证，禁止拿其它模型的 smoke 替代。
4. 主控要有断线保护、PID、文件日志；启动后检查实际 PID 的指定 timeout 环境名。SSH broken pipe 不等于 runner 已退，重挂前先查原主控/worker，防止双跑。
5. 连续 infra ERROR 先停自己的主控、分桶、保留证据；未封存 Attempt 的剩余预算/恢复契约未核对，不准改 env 后直接重跑，不手改 summary 伪造完场。

## 1b. 数据集路径与 pure 拷贝（硬规则）

- server：`~/ageval-datasets/<bench>`（**不要** `full-frontier`、**不要** `Developer/work` 前缀）。
- ageval 仓：`~/work/ageval`；默认 wt：`~/work/ageval-wt-main`。
- MBP 权威源常为 `…/ageval-datasets/full-frontier/<bench>`。往服务器推必须 **pure**：
  - **必须排除**：`.ageval/`、`.ageval.*`、`_runner/`、`_runner_*/`、`_xfer/`、`_transfer/`、`.env`、`.DS_Store`、`__pycache__/`、`deepswe-upload-artifacts-*.tar.gz`、`*_slim.tar.gz`
  - **禁止**迁 `.ageval/runs` 或任何 suite 产物、上传中间包
  - 迁完立刻核对：目标侧无 `.ageval`、无 `_xfer`；`du` 应接近「源体积减去 .ageval」
- 跑出来的 attempt/轨迹：**勿频繁**回同步到 MBP；等全部跑完（含清 ERROR）+ Junhao 确认后再同步，并改飞书「是否同步」。

## 1c. 死代理 / Docker 拉镜像预检（硬规则，2026-10-24）

**教训**：LiteLLM/Tailscale 通 ≠ Docker 拉镜像通。runner 若继承 `HTTP_PROXY=http://127.0.0.1:17890` 而本机无进程监听，会导致整场 `environment_image_unresolved`，agent 根本不起。

开任何依赖 Docker 的 suite（Deep-SWE / TB / NL2 等）之前必须：

1. 打印 `env | grep -i proxy`。
2. 若任一 `HTTP_PROXY`/`HTTPS_PROXY`/`http_proxy`/`https_proxy`/`ALL_PROXY` 指向 `127.0.0.1` 或 `localhost`：用 `ss`/`curl -m 2` 确认端口在听。
3. **不通则立刻 unset 上述全部代理变量，禁止开跑**；去 shellrc、`/etc/environment`、systemd user env、`.env`、`_runner/*.sh` 根上删掉死值，勿只改当前 shell。
4. 若必须用代理：只用经 `docker pull` 验证可达的地址（例：某机 daemon 的 `10.205.2.46:7899`），不要用本机未起的本地端口。
5. **开跑前镜像冒烟**：对本 bench 至少成功一次 `docker pull`（或等价 resolve）所需基础镜像；失败不开 suite。
6. 开跑后前几题若批量 `environment_image_unresolved` / `agent_invocations=0`：立刻停，当 infra 污染处理（删 suite 修环境后重开），勿当模型能力。

Tailscale 到校网 LiteLLM（`10.130.138.46:8010`）只保证 API；**不替代**本条 Docker/代理检查。

## 2. 开跑前：模型占用与 LiteLLM 字符串（硬）

1. 先看 QNpR「要跑的 Model」占用/并发列，确认可开。
2. 开跑登记占用；结束或长期暂停后清零并改第四章对应行。
3. 模型 API 若支持 `reasoning_effort` / `effort`，默认最高档，除非用户明确要求降低。
4. **DashScope 背板模型必须带 `dashscope/` 前缀**（例：`dashscope/kimi-k2.7-code`）。裸名在部分 harness（如 miniswe）可能被剥前缀；网关应对裸名有 healthy deployment，但 **profile 仍写 dashscope/**。开跑前对将用字符串 **和** 可能剥成的裸名都 chat 冒烟 200。
5. 不通不开跑。

## 2b. 开跑位置（硬规则）

1. **新开 suite 优先 zju-47（server-47）**。
2. **zju-46**：已在跑的维持；**禁止新开**（系统盘吃紧时尤甚）。之后不再在 46 启动评测服务；数据集在 NFS，一般无需从 46 再 copy。
3. server 内存仍吃紧时，可开到 **Grok Bot 主机（bot/box）**。
4. **Mini**：只维持原先已在跑的 suite 与其既有并发；**现在不加并发、不新开**；某路跑完后再补可以。
5. 飞书「位置」列按实际机器写（zju-47 / zju-46 / mini / bot / mbp）。
6. **清 ERROR 不算新开**：对已有 suite 做 `--retry-errors` / `--replace-slot`（或等价）**不受**「禁止新开 / Mini 不加」限制；有 E 必须清到 0（见 §5）。仍在跑的 suite 等 complete（或 runner 退）后再挂 retry；已 complete 的立刻开。
7. **删污染后重开算新开**：落 zju-47 或 bot，勿落 Mini / zju-46。

## 3. 并发

- **单个 suite 内**：`max-concurrent-tasks` 由交接指定（默认常 1；探错/吃满空闲 model 时可更高）。
- **多路 suite**：允许；按「要跑的 Model」吃满空闲并发，限额则降并汇报。新开优先落在 zju-47/bot，勿为吃满而往 Mini 或 zju-46 加。
- **replace**：同一 suite 的 replace 串行。

## 4. 进度与飞书（默认半小时）

1. 默认每 30 分钟更新 QNpR（交接可改 cron）。
2. 进度私信含：整体状态（活跃 suite 的 **harness / model / suite id**、P/F/E、n/N、当前题、是否 stall）+ 相对上次增量。**禁止省略 model。**
3. 无实质变化可不刷屏；结题/ERROR/stall/磁盘网关异常必须报。
4. 开跑后：行状态改为在跑并填 Suite ID；**并发数**、**更新时间**填列；备注极短或空；位置=实际机器。
5. 超时/stall：先自己查 log/网关，再咨询协调 bot；勿把「要不要查」甩给用户。区分：`limit=wall_time_seconds` / `acp_timeout`（常为 invoke 超时过短）vs 模型 `end_turn` 后 verifier FAIL（`limit` 为空）。
6. 更新飞书时遵守 **§0b 色彩**：真正跑完（§5）的行用**绿底**；未清 ERROR 的行不要标已完。
7. **协调 bot（Grok Bot）巡检**：约每 2 小时看 QNpR/BaNK；发现异常（全 F+API 400、批量 `environment_image_unresolved`、死代理、批量 E）必须**立刻推负责 bot 处理**，不能只记账。

## 5. FAIL / ERROR 与 replace-slot（跑完标准）

1. 连续 FAIL/ERROR：立刻分清模型失败 vs 环境问题；能修先修。
2. **suite run 算「跑完」的硬前提**：所有 ERROR 已用 `--resume-suite --retry-errors` 或 `--replace-slot`（或等价）**完全消除**；残留 ERROR（含限额卡死落成的 E）都不算完。n/N 到齐但还有 E ≠ 跑完。
3. ERROR 必须最终 replace/retry 清掉——**主动开，勿等催**；清完后再把飞书对应行标绿底（§0b），并视情况清 Model 占用。
4. **基础设施污染**（近乎全 F / 0P 且轨迹 API 400/`no healthy`/空 patch；或批量 `environment_image_unresolved` 且 agent 未起）：**删除该 suite run，修环境后重开**——勿当模型终态、勿只对污染批 replace、勿给旧行绿底。
5. `acp_timeout` 若因 invoke≪wall，先把超时对齐再 replace。
6. 破坏性操作先问用户（删污染 suite + 正确环境重开除外，Junhao 已授权为默认处置）。
7. 「禁止新开」**不阻止**清 E（§2b.6）；**阻止**把删后重开落在 Mini/zju-46（§2b.7）。

## 6. 仅 bot 主机：网关与 Docker

用户自己的机器通常直连校园网，不要求本节。bot/box 上：

1. 校网经 Mini Tailscale 子网路由：`accept-routes`，禁止 exit-node。
2. 判通：`curl -m 15–20 http://10.130.138.46:8010/`，期望 200/401。
3. Docker：可清 dangling；禁止 `docker system prune -a` 与 volume prune。
4. 开跑前仍须执行 **§1c 死代理预检**（与 Tailscale 网关检查并列，缺一不可）。

## 7. 产物回同步与 `results upload`（轻量 Attempt evidence，硬规则）

### 7.1 先区分两条方向

- **MBP → server 的 pure dataset 推送**：沿用 §1b，必须排除 `.ageval/`、`runs/`、`suite-runs/`、`_runner/`、`.env` 等运行产物；目标机拿到的是干净题包。
- **server → MBP 的结果回同步 / Hub upload**：不是拷整个 dataset，也不是拷整个 suite；只处理指定的、已封存的 Attempt evidence。必须先得到 Junhao 明确允许，按 suite/task/run_id 精确选取。
- 正式运行结果直接留在目标机器对应 dataset 目录；不要把运行目录拷到 Bot 工作区。

### 7.2 Attempt 与 suite 的边界

- `ageval results upload <dataset> --run <attempt_id>` 上传的是单个 `<dataset>/.ageval/runs/<attempt_id>/`，不会生成 suite leaderboard 行。
- `ageval results upload-suite <dataset> --suite-run <suite_id> [--with-attempts]` 才是 suite 级上传；只接受终态 complete suite。`--with-attempts` 会按 suite task refs 找 Attempt，不代表可以手工把整个 `suite-runs/<id>` 目录搬走。
- 给本地 Viewer 看状态时，suite 只需按需同步 `suite-runs/<id>/summary.json` 与 `progress.json`；这两份不能替代 Attempt evidence。

### 7.3 sealed Attempt 的同步白名单

对已封存 Attempt，手工回同步只允许这些路径；不存在的可选项跳过：

```text
lock.json
result.json
trajectory.jsonl
summary.json
task-artifacts/
verifier-collect/
evaluation/observation.jsonl
evaluation/checks.json
```

其中 `trajectory.jsonl` 是 run 阶段轨迹；`evaluation/observation.jsonl` 是 judge/evaluate 阶段轨迹；`task-artifacts/` 与 `verifier-collect/` 是评分所需的已收集产物。

### 7.4 明确排除的重产物与中间状态

手工同步和上传准备都必须排除：

```text
box/
state/
l1-work/
analysis/
agent/invocations/
evaluation/invocations/
backend_raw/
checkpoints/
activity.jsonl
replay-input.json
.env
缓存、源码工作区、容器层和上传中间包
```

`activity.jsonl` + `checkpoints/` 是未封存 Attempt 的 recovery bundle；`replay-input.json` 只为 fork/replay 保留，不是普通 Viewer/Attempt evidence。已封存 Attempt 默认会清理它们。

注意：当前 `build_attempt_archive()` 源码显式过滤 `l1-work/`、`analysis/` 和 vendor raw，但没有用 `box/` 名称做兜底过滤；正常 sealed Attempt 会因 post-seal pruning 删除 `box/`，但若使用 `--keep-workspace` 或目录残留，不能假设 CLI 自动替它排除。因此回同步采用上述白名单，禁止直接 rsync 整个 Attempt/suite 目录。

### 7.5 回同步前核对

- 源机 `summary.json` 与 `result.json` 已封存；未封存 Attempt 先在源机 settle/recover，不能当普通 upload 物料。
- 从 suite `summary.json` 的 `attempts[].run_id` 精确找需要的 Attempt，不按目录大小或最新文件猜。
- 目标侧先保留旧副本（改名留档，不删除），再把白名单文件写入对应 `.ageval/runs/<attempt_id>/`。
- 完成后逐个核对 `lock/result/summary/trajectory`、P/F/E、task id、文件数和路径；源机只读，不回写、不删源产物。
- 可直接复用 `references/sync_attempt_evidence.py`：传 `--remote`、`--local`、`--suite`，重复传 `--run <attempt_id>`；先加 `--dry-run` 预演，再执行。脚本只复制本节白名单并拒绝禁目录；实现会先 include 嵌套父目录（如 `evaluation/`），再 exclude 其它路径，避免 `evaluation/observation.jsonl` / `checks.json` 被漏掉。
- 对比源盘与 MBP 时按 `task_id` 比较旧/新 `run_id` 和状态；PASS、FAIL、ERROR 的所有新增/替换都同步，不能只同步 PASS。
- 新开、replace、`--retry-errors` 仍须先过 BXrN；同步本身不等于授权重跑。

## 8. 交接检查清单

- [ ] wt 已建/复用且本实验固定；HEAD 已写入飞书 wt 列（非长备注）；需要时已 pull main
- [ ] dataset 路径正确；若从 MBP 推服务器已 pure 排除 runs/_xfer
- [ ] `.env` 已全部加载后显式设置 invoke；已在目标启动环境运行 §1a 检查器并退出0；solver/judge 的 timeout/watchdog、invoke 与实际 wall/agent_invocations 已核对；真实单题验证无 infra ERROR（不能只勾 profile/lock/probe）
- [ ] **§1c 死代理预检通过**；Docker 镜像 pull/resolve 冒烟成功
- [ ] model 字符串带正确前缀（DashScope → `dashscope/`）；开跑前 chat 冒烟 200（含可能被剥成的裸名）
- [ ] 开跑位置符合 §2b（新开优先 zju-47；zju-46 维持不新开；Mini 不加新开；**清 E 例外**；删污染重开落 zju-47/bot；吃紧可 bot）
- [ ] QNpR 占用表已登记；Bench「负责 bot」已标；明细有并发数/更新时间且备注极短
- [ ] 进度例程已开（私信含 harness·model·suite id + 增量；同步第四章+开头 Bench）
- [ ] 位置/是否同步列已按事实填；**已完行绿底**（§0b），有残留 ERROR 不标已完
- [ ] 飞书改表遵守 §0「禁止单字符/单数字全局替换」
- [ ] bot 主机：网关/Docker/产物同步边界已说明
- [ ] ERROR→replace/retry 清干净才算跑完（§5）；infra 污染 → 删 suite 重开；连续失败查因已告知

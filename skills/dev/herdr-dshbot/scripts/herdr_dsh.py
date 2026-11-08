#!/usr/bin/env python3
"""在 herdr 的 pane 里跑 dsh-tui 任务：起 pane、发任务、等结算、读输出。"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time

AGENT_PREFIX = "dsh-"
WORKSPACE_ID_RE = re.compile(r"^w\d+$")


def die(message: str, code: int = 2) -> "None":
    print(message, file=sys.stderr)
    raise SystemExit(code)


def herdr(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    proc = subprocess.run(["herdr", *args], capture_output=True, text=True)
    if check and proc.returncode != 0:
        detail = proc.stderr.strip() or proc.stdout.strip()
        die(f"herdr {' '.join(args)} 失败：{detail}")
    return proc


def result(proc: subprocess.CompletedProcess) -> dict:
    try:
        return json.loads(proc.stdout)["result"]
    except (json.JSONDecodeError, KeyError, TypeError):
        die(f"读不懂 herdr 输出：{proc.stdout.strip()[:400]}")


def agent_state(agent: str) -> tuple:
    payload = result(herdr("agent", "get", agent))
    entry = payload.get("agent") or {}
    return entry.get("agent_status", "unknown"), entry.get("revision")


def resolve_workspace(name_or_id: str, create: bool = False, cwd: str = "") -> str:
    if WORKSPACE_ID_RE.match(name_or_id):
        return name_or_id
    spaces = result(herdr("workspace", "list"))["workspaces"]
    for space in spaces:
        if space.get("label") == name_or_id:
            return space["workspace_id"]
    if create:
        created = result(
            herdr("workspace", "create", "--label", name_or_id, "--cwd", cwd or os.getcwd())
        )
        return created["workspace"]["workspace_id"]
    labels = ", ".join(sorted(str(s.get("label")) for s in spaces))
    die(
        f"找不到 workspace {name_or_id}；现有：{labels}。"
        f"先建：herdr workspace create --label {name_or_id} --cwd <目录>，或加 --create-workspace"
    )


def wait_for_agent(pane: str, agent: str, timeout: float) -> None:
    """等 dsh-tui 注册 agent。

    寻址一律用 pane id：dsh-tui 每次状态变化都会重新注册自己，`agent rename` 改的名字
    不会保留，按名字查会变成 agent_not_found。名字只做显示。
    """
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = herdr("agent", "get", pane, check=False)
        if last.returncode == 0:
            herdr("agent", "rename", pane, agent, check=False)  # 尽力而为，失败不影响寻址
            return
        time.sleep(0.5)
    detail = (last.stderr.strip() or last.stdout.strip()) if last else ""
    die(f"{timeout:g}s 内 agent 没注册上（按 pane {pane} 查）：{detail}")


def tab_panes(workspace: str, tab_id: str) -> list[str]:
    panes = result(herdr("pane", "list", "--workspace", workspace)).get("panes", [])
    return [p["pane_id"] for p in panes if p.get("tab_id") == tab_id]


def first_pane_with_room(workspace: str) -> "str | None":
    """找还没满 4 个 pane 的 tab，取它里面第一个 pane；都满了返回 None。

    取 tab 编号最大的那个：用户在 latest tab 里接着干，不会把新 pane 塞回旧 tab。
    """
    tabs = result(herdr("tab", "list", "--workspace", workspace)).get("tabs", [])
    roomy = [t for t in tabs if (t.get("pane_count") or 0) < 4]
    if not roomy:
        return None
    tab_id = max(roomy, key=lambda t: t.get("number") or 0)["tab_id"]
    panes = result(herdr("pane", "list", "--workspace", workspace)).get("panes", [])
    for pane in panes:
        if pane.get("tab_id") == tab_id:
            return pane["pane_id"]
    return None


def plan_grid(pane_in_tab: str) -> "tuple[str, str] | None":
    """按 2x2 决定从哪个 pane、哪个方向切下一块；None 表示该 tab 满了，开新 tab。

    依赖 pane layout 的矩形，不依赖 pane list 的顺序：list 的顺序按位置排，
    第 2 块切出来的 pane 未必排在最后。
    """
    layout = result(herdr("pane", "layout", "--pane", pane_in_tab))["layout"]
    panes = layout.get("panes", [])
    area_height = layout.get("area", {}).get("height", 0)
    n = len(panes)
    if n == 0:
        return None
    if n == 1:
        return panes[0]["pane_id"], "right"
    if n >= 4:
        return None

    xs = {p["rect"]["x"] for p in panes}
    if n == 2 and len(xs) == 1:
        # 上下叠着的一对：先横着切，避免继续加深这一列
        return panes[0]["pane_id"], "right"

    full_height = [p for p in panes if p["rect"]["height"] >= area_height]
    if n == 3 and full_height:
        # 还剩下一条满高的列，切它
        return full_height[0]["pane_id"], "down"

    target = sorted(panes, key=lambda p: p["rect"]["x"])[-1]
    return target["pane_id"], "down"


def cmd_check(_args: argparse.Namespace) -> None:
    ok = True
    for cmd in (["herdr", "status"], ["herdr", "--version"], ["dsh-tui", "--version"]):
        proc = subprocess.run(cmd, capture_output=True, text=True)
        body = proc.stdout.strip() or proc.stderr.strip()
        print(f"$ {' '.join(cmd)}\n{body}\n")
        ok = ok and proc.returncode == 0
    path = shutil.which("herdr")
    print(f"herdr 路径：{path}")
    if not path:
        ok = False
    raise SystemExit(0 if ok else 1)


def cmd_spawn(args: argparse.Namespace) -> None:
    herdr_bin = shutil.which("herdr")
    if not herdr_bin:
        die("PATH 里找不到 herdr")
    workspace = resolve_workspace(args.workspace, create=args.create_workspace, cwd=args.cwd)
    panes = result(herdr("pane", "list", "--workspace", workspace)).get("panes", [])
    if args.source_pane:
        source = args.source_pane
    elif args.direction == "auto":
        source = first_pane_with_room(workspace)
    elif panes:
        source = panes[0]["pane_id"]
    else:
        source = None

    if args.direction != "auto" and source is None:
        die(f"workspace {workspace} 里没有可分屏的 pane")

    env = ["--env", f"HERDR_BIN_PATH={herdr_bin}"]
    if args.direction == "auto":
        plan = plan_grid(source) if source else None
    else:
        plan = (source, args.direction)

    if plan is None:
        created = result(
            herdr(
                "tab",
                "create",
                "--workspace",
                workspace,
                "--cwd",
                args.cwd,
                "--no-focus",
                *env,
            )
        )
        pane = (created.get("root_pane") or {}).get("pane_id")
        if not pane:
            new_tab = (created.get("tab") or {}).get("tab_id")
            ids = tab_panes(workspace, new_tab) if new_tab else []
            pane = ids[0] if ids else None
        if not pane:
            die("新 tab 建好了，但找不到它的 pane")
    else:
        parent, direction = plan
        split = result(
            herdr(
                "pane",
                "split",
                parent,
                "--direction",
                direction,
                "--ratio",
                "0.5",
                "--no-focus",
                "--cwd",
                args.cwd,
                *env,
            )
        )
        pane = split["pane"]["pane_id"]

    herdr("pane", "rename", pane, args.name)
    herdr("pane", "run", pane, "dsh-tui")

    time.sleep(args.boot_wait)
    herdr("pane", "send-keys", pane, "Esc")
    time.sleep(args.enter_wait)
    herdr("pane", "send-keys", pane, "Enter")

    agent = AGENT_PREFIX + args.name
    wait_for_agent(pane, agent, args.claim_timeout)
    print(
        json.dumps(
            {"workspace": workspace, "pane": pane, "agent": agent, "target": pane},
            ensure_ascii=False,
        )
    )


def cmd_send(args: argparse.Namespace) -> None:
    if "\n" in args.text:
        die("多行文本会被直接提交：压成一行，或分段发、每段单独等结算")

    _status0, rev0 = agent_state(args.pane)
    herdr("pane", "send-text", args.pane, args.text)
    herdr("pane", "send-keys", args.pane, "Enter")

    deadline = time.time() + args.poll_seconds
    while time.time() < deadline:
        status, rev = agent_state(args.pane)
        if rev != rev0:
            break
        time.sleep(0.5)
    else:
        die(
            f"{args.poll_seconds:g}s 内 revision 没变化，任务没提交进去。"
            f"看屏幕：herdr pane read {args.pane} --source visible --lines 30"
        )

    waited = herdr(
        "agent",
        "wait",
        args.pane,
        "--until",
        "done",
        "--until",
        "idle",
        "--until",
        "blocked",
        "--timeout",
        str(args.timeout_ms),
        check=False,
    )
    status, rev = agent_state(args.pane)
    tail = herdr(
        "agent", "read", args.pane, "--source", "recent-unwrapped", "--lines", str(args.lines),
        check=False,
    )
    print(
        json.dumps(
            {
                "agent": args.agent or "",
                "target": args.pane,
                "pane": args.pane,
                "status": status,
                "revision": rev,
                "timed_out": waited.returncode != 0,
                "output": tail.stdout.strip() if tail.returncode == 0 else "",
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def target_of(args: argparse.Namespace) -> str:
    """寻址用 pane id；只给了 agent 名时才退回名字。"""
    return args.pane or args.agent


def cmd_status(args: argparse.Namespace) -> None:
    target = target_of(args)
    status, rev = agent_state(target)
    print(
        json.dumps(
            {"target": target, "agent": args.agent or "", "status": status, "revision": rev},
            ensure_ascii=False,
        )
    )


def cmd_read(args: argparse.Namespace) -> None:
    target = target_of(args)
    out = herdr(
        "agent", "read", target, "--source", args.source, "--lines", str(args.lines), check=False
    )
    if out.returncode == 0:
        print(out.stdout.rstrip())
        return
    if not args.pane:
        die(f"读不到 {target}：{out.stderr.strip()}")
    screen = herdr("pane", "read", args.pane, "--source", "visible", "--lines", str(args.lines))
    print(screen.stdout.rstrip())


def cmd_close(args: argparse.Namespace) -> None:
    herdr("pane", "close", args.pane)
    print(json.dumps({"closed": args.pane}))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="command", required=True)

    check = subs.add_parser("check", help="检查 herdr / dsh-tui 是否就绪")
    check.set_defaults(func=cmd_check)

    spawn = subs.add_parser("spawn", help="开 pane、起 dsh-tui、认领 agent")
    spawn.add_argument("--name", required=True, help="任务名，例如 issue-251")
    spawn.add_argument("--cwd", required=True, help="pane 的工作目录")
    spawn.add_argument("--workspace", default="dsh", help="workspace 名或 id，默认 dsh")
    spawn.add_argument(
        "--create-workspace", action="store_true", help="workspace 不存在时按 --label 新建"
    )
    spawn.add_argument("--source-pane", help="从哪个 pane 分屏，默认取 workspace 第一个")
    spawn.add_argument(
        "--direction",
        default="auto",
        choices=["auto", "down", "right"],
        help="auto 按 2x2 网格排；指定 down/right 时从 source pane 硬切",
    )
    spawn.add_argument("--boot-wait", type=float, default=8.0, help="等 dsh-tui 起来")
    spawn.add_argument("--enter-wait", type=float, default=3.0, help="跳过引导页后的等待")
    spawn.add_argument("--claim-timeout", type=float, default=20.0, help="等 agent 注册")
    spawn.set_defaults(func=cmd_spawn)

    send = subs.add_parser("send", help="发一条任务并等结算")
    send.add_argument("--agent", help="显示用 agent 名，例如 dsh-issue-251；寻址一律用 --pane")
    send.add_argument("--pane", required=True, help="pane id，例如 w9:p5（寻址键）")
    send.add_argument("--text", required=True, help="单行提示")
    send.add_argument("--timeout-ms", type=int, default=600000, help="等结算的上限")
    send.add_argument("--poll-seconds", type=float, default=20.0, help="等 revision 变化的上限")
    send.add_argument("--lines", type=int, default=40, help="回读输出行数")
    send.set_defaults(func=cmd_send)

    status = subs.add_parser("status", help="打印 agent 状态和 revision")
    status.add_argument("--agent", help="仅在不给 --pane 时作为退回寻址")
    status.add_argument("--pane", help="pane id（推荐寻址键）")
    status.set_defaults(func=cmd_status)

    read = subs.add_parser("read", help="读 agent 最近输出，读不到就退回读屏")
    read.add_argument("--agent", help="仅在不给 --pane 时作为退回寻址")
    read.add_argument("--pane", help="pane id；agent 读不到时也用它读屏")
    read.add_argument("--lines", type=int, default=40)
    read.add_argument("--source", default="recent-unwrapped")
    read.set_defaults(func=cmd_read)

    close = subs.add_parser("close", help="关 pane")
    close.add_argument("--pane", required=True)
    close.set_defaults(func=cmd_close)

    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

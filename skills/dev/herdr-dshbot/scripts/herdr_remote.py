#!/usr/bin/env python3
"""在另一台机器（显式指定，例如 mini）的 herdr 里跑 dsh-tui。

和本机路径的区别：
- 先把本目录的 herdr_dsh.py 推到远端缓存目录，再把子命令原样转给远端执行；
- 远端非交互 shell 的 PATH 不含 /opt/homebrew/bin，脚本里显式补上；
- 远端工作区和 agent 可能和本机不同，spawn 时用 --create-workspace 按需新建。

用法：
    python3 scripts/herdr_remote.py --host mini check
    python3 scripts/herdr_remote.py --host mini spawn --name t1 --cwd /path --workspace dsh --create-workspace
    python3 scripts/herdr_remote.py --host mini send --pane w1:p2 --text '单行任务'
"""

from __future__ import annotations

import argparse
import base64
import shlex
import subprocess
import sys
from pathlib import Path

REMOTE_DIR = "~/.cache/dsh-skill"
REMOTE_SCRIPT = f"{REMOTE_DIR}/herdr_dsh.py"
REMOTE_PATH = "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
LOCAL_SCRIPT = Path(__file__).with_name("herdr_dsh.py")


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, **kwargs)


def sync(host: str) -> None:
    payload = base64.b64encode(LOCAL_SCRIPT.read_bytes()).decode()
    remote = (
        f"mkdir -p {REMOTE_DIR} && printf '%s' '{payload}' | base64 -d > {REMOTE_SCRIPT} "
        f"&& chmod 700 {REMOTE_SCRIPT}"
    )
    proc = run(["ssh", host, remote])
    if proc.returncode != 0:
        sys.stderr.write(f"同步 {LOCAL_SCRIPT.name} 到 {host} 失败：{proc.stderr.strip()}\n")
        raise SystemExit(2)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True, help="ssh 目标，例如 mini")
    parser.add_argument("--skip-sync", action="store_true", help="跳过同步，直接用远端缓存副本")
    known, passthrough = parser.parse_known_args()

    if not passthrough:
        parser.error("需要子命令，例如 check / spawn / send / read / close")

    if not known.skip_sync:
        sync(known.host)

    remote_cmd = " ".join(
        [
            f"PATH={REMOTE_PATH}",
            "python3",
            REMOTE_SCRIPT,
            *(shlex.quote(arg) for arg in passthrough),
        ]
    )
    proc = subprocess.run(["ssh", known.host, remote_cmd])
    raise SystemExit(proc.returncode)


if __name__ == "__main__":
    main()

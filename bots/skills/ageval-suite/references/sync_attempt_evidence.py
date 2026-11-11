#!/usr/bin/env python3
"""Whitelist-only sync of sealed ageval Attempt evidence.

Copies suite summary/progress and selected sealed Attempt evidence. It never
copies box/, state/, recovery bundles, vendor raw, .env, or analysis output.
"""
from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import PurePosixPath

FILES = (
    "lock.json", "result.json", "trajectory.jsonl", "summary.json",
    "task-artifacts", "verifier-collect", "evaluation/observation.jsonl",
    "evaluation/checks.json",
)
EXCLUDED = {
    "box", "state", "l1-work", "analysis", "checkpoints", "agent",
    "backend_raw", ".env", "activity.jsonl", "replay-input.json",
}


def safe_rel(rel: str) -> bool:
    return not any(part in EXCLUDED for part in PurePosixPath(rel).parts)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--remote", required=True, help="ssh host:path dataset root")
    parser.add_argument("--local", required=True, help="local dataset root")
    parser.add_argument("--suite", required=True)
    parser.add_argument("--run", action="append", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    remote = args.remote.rstrip("/")
    local = os.path.abspath(args.local)
    if not os.path.isdir(local):
        raise SystemExit(f"local dataset missing: {local}")
    ssh = "ssh -o ControlMaster=no -o ControlPath=none"

    suite_remote = f"{remote}/.ageval/suite-runs/{args.suite}"
    suite_local = os.path.join(local, ".ageval", "suite-runs", args.suite)
    os.makedirs(suite_local, exist_ok=True)
    for name in ("summary.json", "progress.json"):
        cmd = ["rsync", "-a", "-e", ssh, f"{suite_remote}/{name}", os.path.join(suite_local, name)]
        print("SYNC", cmd[-2], "->", cmd[-1])
        if not args.dry_run:
            subprocess.run(cmd, check=True)

    for run_id in args.run:
        if not run_id or "/" in run_id or run_id.startswith("."):
            raise SystemExit(f"unsafe run id: {run_id}")
        source = f"{remote}/.ageval/runs/{run_id}/"
        target = os.path.join(local, ".ageval", "runs", run_id)
        os.makedirs(target, exist_ok=True)
        filters = []
        for item in FILES:
            # Include every parent directory so nested paths such as
            # evaluation/observation.jsonl are reachable before the final
            # exclude rule.  Directory trees are still restricted to FILES.
            parts = item.split("/")
            for i in range(1, len(parts)):
                parent = "/".join(parts[:i]) + "/"
                filters += ["--include", parent]
            filters += ["--include", item, "--include", f"{item}/**"]
        filters += ["--exclude", "*"]
        cmd = ["rsync", "-a", "-e", ssh, *filters, source, target]
        print("SYNC", source, "->", target, "(whitelist only)")
        if not args.dry_run:
            subprocess.run(cmd, check=True)

    if args.dry_run:
        return
    for run_id in args.run:
        target = os.path.join(local, ".ageval", "runs", run_id)
        if not os.path.isdir(target):
            continue
        for root, _, files in os.walk(target):
            rel_root = os.path.relpath(root, target).replace(os.sep, "/")
            if rel_root != "." and not safe_rel(rel_root):
                raise SystemExit(f"excluded path present: {run_id}/{rel_root}")
            for filename in files:
                rel = filename if rel_root == "." else f"{rel_root}/{filename}"
                if not safe_rel(rel):
                    raise SystemExit(f"excluded file present: {run_id}/{rel}")
    print("OK")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Read-only timeout gate. No API call, ageval run, env write, or result write.

Run AFTER sourcing all env files, in the same environment as the controller.
--required-seconds is an operator-reviewed budget, not a guessed default.
Needs PyYAML: use the target ageval worktree's .venv/bin/python.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import sys

import yaml


def positive(value: object, label: str) -> float:
    if isinstance(value, bool):
        raise ValueError(f"{label}: expected a positive finite number")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label}: unset or invalid") from exc
    if not math.isfinite(number) or number <= 0:
        raise ValueError(f"{label}: expected a positive finite number")
    return number


def check(dataset: Path, profiles: Path, required: float, tasks: list[str], env: dict[str, str]) -> dict:
    required = positive(required, "required_seconds")
    dataset = dataset.expanduser().resolve(strict=True)
    profiles = profiles.expanduser().resolve(strict=True)
    errors = []
    manifest = yaml.safe_load((dataset / "ageval.yaml").read_text())
    if not isinstance(manifest, dict) or manifest.get("format") != "ageval.dataset/1":
        raise ValueError("invalid dataset manifest")
    task_root = (dataset / (manifest.get("tasks") or {}).get("root", "tasks")).resolve(strict=True)
    if not task_root.is_relative_to(dataset):
        raise ValueError("task root escapes dataset")
    if tasks:
        files = []
        for task in tasks:
            if not task or Path(task).name != task or task in (".", ".."):
                raise ValueError("unsafe task id")
            files.append(task_root / task / "task.yaml")
    else:
        files = sorted(task_root.glob("*/task.yaml"))
    if not files:
        raise ValueError("no task manifests found")
    invoke_required = required
    for path in files:
        if not path.resolve(strict=True).is_relative_to(dataset):
            raise ValueError("task manifest escapes dataset")
        task = yaml.safe_load(path.read_text())
        if not isinstance(task, dict):
            raise ValueError("invalid task manifest")
        limits = task.get("limits") or {}
        wall = positive(limits.get("wall_time_seconds"), "task wall_time_seconds")
        invokes = positive(limits.get("agent_invocations"), "task agent_invocations")
        # With a single invocation, the parent must not cut the whole agent
        # conversation earlier than the declared task wall budget.
        if invokes == 1:
            invoke_required = max(invoke_required, wall)
    try:
        actual = positive(env.get("AGEVAL_AGENT_INVOKE_TIMEOUT"), "AGEVAL_AGENT_INVOKE_TIMEOUT")
        if actual < invoke_required:
            errors.append(f"runner invoke {actual:g}s < required {invoke_required:g}s")
    except ValueError as exc:
        actual = None
        errors.append(str(exc) + "; refusing implicit parent fallback")
    raw = profiles.read_bytes()
    profile = yaml.safe_load(raw)
    if not isinstance(profile, dict) or profile.get("format") != "ageval.profiles/1":
        raise ValueError("invalid profile manifest")
    roles = profile.get("agent_profiles")
    if not isinstance(roles, dict) or not roles:
        raise ValueError("profile has no agent_profiles mapping")
    checked = {}
    for role, binding in roles.items():
        model = binding.get("model") if isinstance(binding, dict) else None
        if not isinstance(model, dict) or not isinstance(model.get("id"), str):
            errors.append(f"role {role}: missing nested model.id")
            continue
        budgets = {}
        for field in ("timeout", "watchdog"):
            try:
                value = positive(model.get(field), f"role {role} model.{field}")
                budgets[field] = value
                if value < required:
                    errors.append(f"role {role} model.{field} {value:g}s < required {required:g}s")
            except ValueError as exc:
                errors.append(str(exc))
        # Deliberately print only model id and budgets, never bindings,
        # environment variables as a whole, keys, prompts, or credential URLs.
        checked[role] = {"model_id": model["id"], **budgets}
    return {
        "gate": "PASS" if not errors else "BLOCKED",
        "scope": "timeout check only; not runtime smoke or permission to launch",
        "dataset": str(dataset),
        "profile": str(profiles),
        "profile_sha256": hashlib.sha256(raw).hexdigest(),
        "task_count": len(files),
        "required_model_seconds": required,
        "required_invoke_seconds": invoke_required,
        "actual_runner_invoke_seconds": actual,
        "roles": checked,
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--profiles", type=Path, required=True)
    parser.add_argument("--required-seconds", type=float, required=True)
    parser.add_argument("--task", action="append", default=[])
    args = parser.parse_args()
    try:
        report = check(args.dataset, args.profiles, args.required_seconds, args.task, dict(os.environ))
    except (OSError, ValueError, yaml.YAMLError) as exc:
        # Do not print YAML source or arbitrary exception text: it may contain
        # a legacy profile that accidentally embeds credentials.
        print(json.dumps({"gate": "BLOCKED", "error": type(exc).__name__,
                          "reason": "invalid/inaccessible dataset, task, profile, or timeout; inspect locally"}))
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["gate"] == "PASS" else 2


if __name__ == "__main__":
    sys.exit(main())

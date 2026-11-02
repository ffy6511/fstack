#!/usr/bin/env python3
"""OpenChamber → Grok Bot webhook notify watcher.

Event-driven via SSE (/api/notifications/stream + optional /api/event).
Falls back to polling /api/sessions/status when SSE dies.
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

DEFAULT_OC_URL = "http://127.0.0.1:57123"
DEFAULT_ENV_CANDIDATES = (
    Path.home() / ".config" / "openchamber" / "grokbot-webhook.env",
    Path.home() / ".config" / "herdr" / "grokbot-webhook.env",
)
STATE_PATH = Path.home() / ".config" / "openchamber" / "run" / "oc-notify.state.json"
LOG_PATH = Path.home() / ".config" / "openchamber" / "run" / "oc-notify.log"

NOTIFY_STATUSES = frozenset(
    {"done", "blocked", "error", "question", "permission", "idle"}
)

_stop = threading.Event()


def log(msg: str) -> None:
    line = "%s %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg)
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_PATH, "a") as f:
            f.write(line + "\n")
    except OSError:
        pass
    print(line, flush=True)


def load_env_file(path: Path) -> Dict[str, str]:
    out: Dict[str, str] = {}
    if not path.is_file():
        return out
    with open(path) as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip().strip('"').strip("'")
            out[k.strip()] = v
    return out


def resolve_env() -> Tuple[str, Optional[str], Path]:
    override = os.environ.get("OPENCHAMBER_WEBHOOK_ENV")
    candidates = [Path(override)] if override else list(DEFAULT_ENV_CANDIDATES)
    env_path = None
    data: Dict[str, str] = {}
    for c in candidates:
        if c and c.is_file():
            data = load_env_file(c)
            env_path = c
            break
    if not env_path:
        raise SystemExit(
            "missing webhook env; set OPENCHAMBER_WEBHOOK_ENV or create "
            + str(DEFAULT_ENV_CANDIDATES[0])
        )
    webhook = data.get("GROKBOT_WEBHOOK") or os.environ.get("GROKBOT_WEBHOOK")
    if not webhook:
        raise SystemExit("GROKBOT_WEBHOOK empty in %s" % env_path)
    auth = data.get("GROKBOT_AUTH") or os.environ.get("GROKBOT_AUTH") or ""
    return webhook, auth, env_path


def normalize_auth(auth: Optional[str]) -> Optional[str]:
    if not auth:
        return None
    a = auth.strip()
    if a.lower().startswith("authorization:"):
        a = a.split(":", 1)[1].strip()
    if not a.lower().startswith("bearer "):
        a = "Bearer %s" % a
    return a


def map_kind_to_status(kind: str, title: str = "", body: str = "") -> str:
    k = (kind or "").lower()
    blob = ("%s %s %s" % (k, title, body)).lower()
    if "error" in blob or k.endswith(".error"):
        return "error"
    if "question" in blob or "ask" in k:
        return "question"
    if "permission" in blob or "permit" in k or "approve" in blob:
        return "permission"
    if "block" in blob:
        return "blocked"
    if "done" in blob or "finish" in blob or "complete" in blob:
        return "done"
    if "idle" in blob:
        return "idle"
    if k in NOTIFY_STATUSES:
        return k
    if "session" in k and "idle" in k:
        return "idle"
    return "done"


class Deduper:
    """Same session+status(+tag) only once until cycle resets."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.lock = threading.Lock()
        self.data: Dict[str, Any] = {"sent": {}, "session_phase": {}, "seeded": False}
        self._load()

    def _load(self) -> None:
        try:
            if self.path.is_file():
                self.data = json.loads(self.path.read_text())
        except (OSError, json.JSONDecodeError):
            pass

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, indent=2, sort_keys=True))
        tmp.replace(self.path)
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass

    def seed_from_sessions(self, sessions: Dict[str, Any]) -> None:
        with self.lock:
            if self.data.get("seeded"):
                return
            for sid, st in (sessions or {}).items():
                status = st if isinstance(st, str) else (st or {}).get("status") or str(st)
                key = "%s|%s|" % (sid, status)
                self.data.setdefault("sent", {})[key] = time.time()
                self.data.setdefault("session_phase", {})[sid] = status
            self.data["seeded"] = True
            self.save()
            log("seeded dedupe from %d sessions" % len(sessions or {}))

    def mark_phase(self, session: str, phase: str) -> None:
        with self.lock:
            prev = self.data.setdefault("session_phase", {}).get(session)
            self.data["session_phase"][session] = phase
            if prev and prev != phase:
                if phase in ("busy", "working", "running") or prev in (
                    "idle",
                    "done",
                    "error",
                ):
                    sent = self.data.setdefault("sent", {})
                    for k in list(sent.keys()):
                        if k.startswith("%s|" % session):
                            del sent[k]
            self.save()

    def should_send(self, session: str, status: str, tag: str = "") -> bool:
        key = "%s|%s|%s" % (session, status, tag)
        with self.lock:
            if key in self.data.setdefault("sent", {}):
                return False
            self.data["sent"][key] = time.time()
            self.data.setdefault("session_phase", {})[session] = status
            self.save()
            return True


def http_json(
    method: str,
    url: str,
    body: Optional[dict] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: float = 15.0,
):
    data = None
    hdrs = dict(headers or {})
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        code = resp.getcode()
        try:
            parsed = json.loads(raw.decode("utf-8") or "null")
        except json.JSONDecodeError:
            parsed = raw.decode("utf-8", errors="replace")
        return code, parsed


def post_webhook(
    webhook: str,
    auth: Optional[str],
    payload: dict,
    dry_run: bool = False,
) -> Tuple[int, str]:
    if dry_run:
        print("DRY-RUN would POST:", json.dumps(payload, ensure_ascii=False), flush=True)
        return 0, "dry-run"
    headers = {"Content-Type": "application/json"}
    if auth:
        headers["Authorization"] = auth
    try:
        code, parsed = http_json(
            "POST", webhook, body=payload, headers=headers, timeout=20
        )
        return code, json.dumps(parsed) if not isinstance(parsed, str) else parsed
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:500]
        return e.code, body
    except Exception as e:  # noqa: BLE001
        return -1, str(e)


class Watcher:
    def __init__(
        self,
        oc_url: str,
        webhook: str,
        auth: Optional[str],
        dry_run: bool = False,
        poll_seconds: float = 0,
    ) -> None:
        self.oc_url = oc_url.rstrip("/")
        self.webhook = webhook
        self.auth = normalize_auth(auth)
        self.dry_run = dry_run
        self.poll_seconds = poll_seconds
        self.dedupe = Deduper(STATE_PATH)
        self._busy: Dict[str, str] = {}

    def fetch_sessions_status(self) -> Dict[str, Any]:
        try:
            code, data = http_json(
                "GET", "%s/api/sessions/status" % self.oc_url, timeout=10
            )
            if code == 200 and isinstance(data, dict):
                return data.get("sessions") or {}
        except Exception as e:  # noqa: BLE001
            log("sessions/status error: %s" % e)
        return {}

    def lookup_session_meta(self, session: str) -> Dict[str, str]:
        """Enrich directory/project/title/outcome from OC HTTP APIs.

        /api/sessions/status has no directory; poll-edge and thin SSE events
        must look it up so herdr/openchamber routines can route.
        """
        out: Dict[str, str] = {
            "directory": "",
            "projectID": "",
            "project": "",
            "title": "",
            "outcome": "",
            "agent": "",
        }
        if not session or session in ("unknown", "smoke-emit", "smoke-local"):
            return out
        try:
            code, data = http_json(
                "GET", "%s/api/session/%s" % (self.oc_url, session), timeout=8
            )
            if code == 200 and isinstance(data, dict):
                body = data.get("data") if isinstance(data.get("data"), dict) else data
                loc = body.get("location") or {}
                if isinstance(loc, dict):
                    out["directory"] = str(loc.get("directory") or loc.get("path") or "")
                out["projectID"] = str(body.get("projectID") or body.get("projectId") or "")
                out["title"] = str(body.get("title") or "")
                out["outcome"] = str(body.get("outcome") or "")
                out["agent"] = str(body.get("agent") or "")
                if out["projectID"] and not out["project"]:
                    try:
                        pc, pd = http_json(
                            "GET",
                            "%s/api/project/%s" % (self.oc_url, out["projectID"]),
                            timeout=5,
                        )
                        if pc == 200 and isinstance(pd, dict):
                            pb = pd.get("data") if isinstance(pd.get("data"), dict) else pd
                            out["project"] = str(
                                pb.get("canonical")
                                or pb.get("path")
                                or pb.get("label")
                                or pb.get("name")
                                or ""
                            )
                            if not out["directory"]:
                                out["directory"] = out["project"]
                    except Exception:  # noqa: BLE001
                        pass
        except Exception as e:  # noqa: BLE001
            log("session meta lookup error %s: %s" % (session, e))
        if not out["directory"]:
            # fallback: scan /api/session list
            try:
                code, data = http_json("GET", "%s/api/session" % self.oc_url, timeout=8)
                items = data if isinstance(data, list) else (
                    (data or {}).get("data") if isinstance(data, dict) else None
                )
                if isinstance(items, list):
                    for it in items:
                        if not isinstance(it, dict):
                            continue
                        if str(it.get("id") or "") != str(session):
                            continue
                        loc = it.get("location") or {}
                        if isinstance(loc, dict):
                            out["directory"] = str(
                                loc.get("directory") or loc.get("path") or ""
                            )
                        out["projectID"] = str(
                            it.get("projectID") or it.get("projectId") or out["projectID"]
                        )
                        out["title"] = out["title"] or str(it.get("title") or "")
                        out["outcome"] = out["outcome"] or str(it.get("outcome") or "")
                        out["agent"] = out["agent"] or str(it.get("agent") or "")
                        break
            except Exception as e:  # noqa: BLE001
                log("session list lookup error: %s" % e)
        return out

    def enrich_payload(self, payload: dict) -> dict:
        meta = self.lookup_session_meta(str(payload.get("session") or ""))
        if not payload.get("directory"):
            payload["directory"] = meta.get("directory") or ""
        if not payload.get("title") or str(payload.get("title") or "").startswith("session "):
            if meta.get("title"):
                payload["title"] = meta["title"]
        for k in ("projectID", "project", "outcome", "agent"):
            if meta.get(k) and not payload.get(k):
                payload[k] = meta[k]
        return payload

    def handle_notification(self, props: dict, event_type: str) -> None:
        session = (
            props.get("sessionId")
            or props.get("session")
            or props.get("sessionID")
            or "unknown"
        )
        title = props.get("title") or ""
        body = props.get("body") or props.get("text") or ""
        directory = props.get("directory") or props.get("cwd") or ""
        kind = props.get("kind") or event_type
        status = map_kind_to_status(str(kind), title, body)
        tag = str(kind)
        if not self.dedupe.should_send(str(session), status, tag):
            log("dedupe skip session=%s status=%s tag=%s" % (session, status, tag))
            return
        payload = self.enrich_payload({
            "source": "openchamber",
            "session": str(session),
            "status": status,
            "title": title,
            "text": body,
            "directory": directory,
            "event": event_type,
        })
        code, _resp = post_webhook(
            self.webhook, self.auth, payload, dry_run=self.dry_run
        )
        log(
            "notify session=%s status=%s dir=%s http=%s"
            % (session, status, payload.get("directory") or "-", code)
        )

    def handle_session_status_event(self, props: dict, event_type: str) -> None:
        session = (
            props.get("sessionID")
            or props.get("sessionId")
            or props.get("session")
            or props.get("id")
            or "unknown"
        )
        status = props.get("status") or props.get("state") or ""
        if isinstance(status, dict):
            status = status.get("type") or status.get("status") or str(status)
        status = str(status).lower()
        prev = self._busy.get(str(session))
        self._busy[str(session)] = status
        self.dedupe.mark_phase(str(session), status)
        if prev in ("busy", "working", "running", "active") and status in (
            "idle",
            "done",
            "complete",
        ):
            mapped = "idle" if status == "idle" else "done"
            if not self.dedupe.should_send(str(session), mapped, "status-edge"):
                return
            payload = self.enrich_payload({
                "source": "openchamber",
                "session": str(session),
                "status": mapped,
                "title": "session %s" % mapped,
                "text": "session.status %s→%s" % (prev, status),
                "directory": props.get("directory") or "",
                "event": event_type,
            })
            code, _ = post_webhook(
                self.webhook, self.auth, payload, dry_run=self.dry_run
            )
            log(
                "status-edge session=%s %s→%s dir=%s http=%s"
                % (session, prev, status, payload.get("directory") or "-", code)
            )

    def on_sse_payload(self, obj: dict, source: str) -> None:
        et = obj.get("type") or ""
        props = obj.get("properties") or obj.get("payload") or {}
        if not isinstance(props, dict):
            props = {}
        if et in (
            "openchamber:notification-stream-ready",
            "openchamber:event-stream-ready",
            "server.connected",
            "server.heartbeat",
            "heartbeat",
        ):
            return
        if "notification" in et or source == "notifications":
            if et == "openchamber:notification" or "notification" in et:
                self.handle_notification(props, et)
                return
        if "session.status" in et or et.endswith("session.status") or (
            source == "event" and "status" in et and "session" in et
        ):
            self.handle_session_status_event(props, et)
            return
        if props.get("kind") and (props.get("sessionId") or props.get("title")):
            self.handle_notification(props, et or "openchamber:notification")

    def read_sse_stream(self, path: str, source: str, backoff_holder: list) -> None:
        url = "%s%s" % (self.oc_url, path)
        while not _stop.is_set():
            try:
                log("SSE connect %s" % path)
                req = urllib.request.Request(
                    url,
                    headers={
                        "Accept": "text/event-stream",
                        "Cache-Control": "no-cache",
                    },
                    method="GET",
                )
                with urllib.request.urlopen(req, timeout=300) as resp:
                    backoff_holder[0] = 1.0
                    buf = b""
                    while not _stop.is_set():
                        chunk = resp.read(1)
                        if not chunk:
                            break
                        buf += chunk
                        while b"\n" in buf:
                            line_b, buf = buf.split(b"\n", 1)
                            line = line_b.decode("utf-8", errors="replace").rstrip("\r")
                            if not line or line.startswith(":"):
                                continue
                            if line.startswith("data:"):
                                data = line[5:].lstrip()
                                if not data:
                                    continue
                                try:
                                    obj = json.loads(data)
                                except json.JSONDecodeError:
                                    continue
                                if isinstance(obj, dict):
                                    self.on_sse_payload(obj, source)
                log("SSE ended %s" % path)
            except Exception as e:  # noqa: BLE001
                if _stop.is_set():
                    break
                log("SSE error %s: %s" % (path, e))
            delay = backoff_holder[0]
            backoff_holder[0] = min(delay * 2, 60.0)
            _stop.wait(delay)

    def poll_loop(self) -> None:
        if self.poll_seconds <= 0:
            return
        last: Dict[str, str] = {}
        while not _stop.is_set():
            sessions = self.fetch_sessions_status()
            for sid, st in sessions.items():
                status = (
                    st if isinstance(st, str) else (st or {}).get("status") or str(st)
                )
                status = str(status).lower()
                prev = last.get(sid)
                last[sid] = status
                self.dedupe.mark_phase(sid, status)
                if prev in ("busy", "working", "running") and status in (
                    "idle",
                    "done",
                ):
                    mapped = "idle" if status == "idle" else "done"
                    if self.dedupe.should_send(sid, mapped, "poll-edge"):
                        payload = self.enrich_payload({
                            "source": "openchamber",
                            "session": sid,
                            "status": mapped,
                            "title": "session %s" % mapped,
                            "text": "poll %s→%s" % (prev, status),
                            "directory": "",
                            "event": "poll.sessions.status",
                        })
                        # Prefer outcome=succeeded → done for routing bots
                        if payload.get("outcome") == "succeeded" and mapped == "idle":
                            payload["status"] = "done"
                            payload["text"] = "%s (outcome=succeeded)" % payload["text"]
                        code, _ = post_webhook(
                            self.webhook, self.auth, payload, dry_run=self.dry_run
                        )
                        log(
                            "poll-edge session=%s %s→%s dir=%s status=%s http=%s"
                            % (
                                sid,
                                prev,
                                status,
                                payload.get("directory") or "-",
                                payload.get("status"),
                                code,
                            )
                        )
            _stop.wait(self.poll_seconds)

    def inject_smoke(self) -> None:
        props = {
            "title": "smoke synthetic",
            "body": "injected by --smoke",
            "kind": "session.idle",
            "sessionId": "smoke-local",
            "directory": "/tmp/grokbot-oc-probe",
        }
        self.handle_notification(props, "smoke:synthetic")

    def run(self, also_event_stream: bool = True) -> None:
        sessions = self.fetch_sessions_status()
        self.dedupe.seed_from_sessions(sessions)

        b1 = [1.0]
        t1 = threading.Thread(
            target=self.read_sse_stream,
            args=("/api/notifications/stream", "notifications", b1),
            daemon=True,
            name="sse-notifications",
        )
        t1.start()

        if also_event_stream:
            b2 = [1.0]
            t2 = threading.Thread(
                target=self.read_sse_stream,
                args=("/api/event", "event", b2),
                daemon=True,
                name="sse-event",
            )
            t2.start()

        if self.poll_seconds > 0:
            tp = threading.Thread(target=self.poll_loop, daemon=True, name="poll")
            tp.start()

        try:
            while not _stop.is_set():
                _stop.wait(1.0)
        except KeyboardInterrupt:
            pass
        _stop.set()


def main() -> None:
    ap = argparse.ArgumentParser(description="OpenChamber → Grok Bot notify watcher")
    ap.add_argument(
        "--once-dry-run",
        action="store_true",
        help="Print would-be POSTs to stdout; do not call webhook",
    )
    ap.add_argument(
        "--smoke",
        action="store_true",
        help="Emit via OC /api/notifications/emit (fallback synthetic)",
    )
    ap.add_argument(
        "--poll-seconds",
        type=float,
        default=0,
        help="Fallback poll interval for /api/sessions/status (0=off)",
    )
    ap.add_argument(
        "--oc-url",
        default=os.environ.get("OPENCHAMBER_URL", DEFAULT_OC_URL),
        help="OpenChamber base URL",
    )
    ap.add_argument(
        "--no-event-stream",
        action="store_true",
        help="Only listen to /api/notifications/stream",
    )
    ap.add_argument(
        "--duration",
        type=float,
        default=0,
        help="Exit after N seconds (0=run forever); useful for smoke",
    )
    args = ap.parse_args()

    webhook, auth, env_path = resolve_env()
    log("env=%s oc=%s dry_run=%s" % (env_path, args.oc_url, args.once_dry_run))

    def _sig(_s, _f):
        _stop.set()

    signal.signal(signal.SIGINT, _sig)
    signal.signal(signal.SIGTERM, _sig)

    w = Watcher(
        oc_url=args.oc_url,
        webhook=webhook,
        auth=auth,
        dry_run=args.once_dry_run,
        poll_seconds=args.poll_seconds,
    )

    if args.duration > 0:

        def _timeout():
            _stop.wait(args.duration)
            _stop.set()

        threading.Thread(target=_timeout, daemon=True).start()

    if args.smoke:

        def _delayed_smoke():
            time.sleep(1.5)
            try:
                code, data = http_json(
                    "POST",
                    "%s/api/notifications/emit" % w.oc_url,
                    body={
                        "kind": "session.idle",
                        "sessionId": "smoke-emit",
                        "title": "Smoke emit",
                        "body": "openchamber notify smoke",
                        "directory": "/tmp/grokbot-oc-probe",
                    },
                    timeout=5,
                )
                delivered = isinstance(data, dict) and data.get("delivered")
                log("smoke emit http=%s delivered=%s" % (code, delivered))
                if not delivered:
                    w.inject_smoke()
            except Exception as e:  # noqa: BLE001
                log("smoke emit failed (%s); using synthetic" % e)
                w.inject_smoke()

        threading.Thread(target=_delayed_smoke, daemon=True).start()

    w.run(also_event_stream=not args.no_event_stream)


if __name__ == "__main__":
    main()

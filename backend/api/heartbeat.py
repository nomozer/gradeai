"""
heartbeat.py — Frontend heartbeat + auto-shutdown watchdog.

The frontend pings ``/api/heartbeat`` every 10 s. If we miss enough pings
in a row (``HEARTBEAT_TIMEOUT``) the browser tab is presumed closed, so
the backend kills the dev frontend process and shuts itself down. This
stops orphaned ``uvicorn`` processes from piling up after the user closes
their browser during long-running dev sessions.

The watchdog is disabled when ``DEV_MODE=1`` is set (the ``scripts/dev.cjs``
launcher sets this automatically) so that dev reloads don't race with the
shutdown thread during hot-reload.
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
import time

from fastapi import APIRouter

HEARTBEAT_TIMEOUT_SEC = int(os.getenv("HEARTBEAT_TIMEOUT", "30"))
DEV_MODE = os.getenv("DEV_MODE", "0").strip().lower() in ("1", "true", "yes")
FRONTEND_PORT = "3000"

# None = "no heartbeat received yet" → don't start countdown until
# frontend connects.  This grace period lets the backend boot and answer
# API-test requests without self-destructing.
_last_heartbeat: float | None = None

router = APIRouter()


@router.post("/api/heartbeat")
async def heartbeat():
    """Reset heartbeat timer — called by the frontend every 10 s."""
    global _last_heartbeat
    _last_heartbeat = time.time()
    return {"status": "ok"}


def _kill_frontend() -> None:
    """Find and kill the process serving the frontend (default port 3000).

    Parses netstat output in Python instead of relying on ``findstr :3000``.
    The old naive match also hit ports like 13000 / 30000 / 30001 — any
    string containing ':3000' — which could kill an unrelated process on
    the same machine. Here we split each row and compare the port exactly.
    """
    try:
        if sys.platform == "win32":
            out = subprocess.check_output(
                "netstat -ano", shell=True
            ).decode(errors="replace")
            for line in out.splitlines():
                if "LISTENING" not in line:
                    continue
                parts = line.split()
                # netstat columns: proto, local_addr, foreign_addr, state, pid
                if len(parts) < 5:
                    continue
                local_addr = parts[1]  # e.g. "0.0.0.0:3000" or "[::]:3000"
                # Port lives after the final ':' — exact match, no substring
                # collisions with 13000 / 30000 / 30001 / etc.
                port = local_addr.rsplit(":", 1)[-1]
                if port != FRONTEND_PORT:
                    continue
                pid = parts[-1]
                print(f"[HITL] Killing frontend process PID: {pid}")
                subprocess.run(
                    f"taskkill /F /T /PID {pid}", shell=True, capture_output=True
                )
        else:
            subprocess.run(
                f"fuser -k {FRONTEND_PORT}/tcp", shell=True, capture_output=True
            )
    except Exception as e:
        print(f"[HITL] Could not kill frontend: {e}")


def _monitor() -> None:
    """Background thread: shut the backend down if the browser stops pinging.

    The loop body is wrapped in try/except so a transient error (clock skew,
    syscall glitch) doesn't silently kill the watchdog thread — if the
    watchdog dies, the backend stops being able to auto-shutdown and lingers
    on the port after the browser tab closes.
    """
    while True:
        try:
            time.sleep(5)
            if _last_heartbeat is None:
                continue  # Still waiting for the first heartbeat — don't kill anything
            elapsed = time.time() - _last_heartbeat
            if elapsed > HEARTBEAT_TIMEOUT_SEC:
                print(f"[HITL] No heartbeat for {HEARTBEAT_TIMEOUT_SEC}s — shutting down.")
                _kill_frontend()
                os._exit(0)
        except Exception as exc:  # keep the watchdog alive
            print(f"[HITL] heartbeat monitor error (continuing): {exc}")


def start_watchdog() -> None:
    """Start the watchdog thread unless DEV_MODE is set."""
    if DEV_MODE:
        print("[HITL] DEV_MODE=true — heartbeat auto-shutdown DISABLED.")
        return
    threading.Thread(target=_monitor, daemon=True).start()

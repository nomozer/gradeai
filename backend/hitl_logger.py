"""hitl_logger.py — Structured logging for HITL save events.

Each save event (per-question distilled lesson, approved grade, score-delta
lesson) is written as one JSON object per line to ``data/hitl_events.jsonl``
and echoed to the console. JSONL is append-only and trivially parseable with
pandas / ``jq`` for research-side analytics:

    jq -c 'select(.event=="finalize") | .deltas' data/hitl_events.jsonl

Why a dedicated logger instead of ``print``:
  • Timestamps added automatically (research audit requires them).
  • Structured records instead of free-form strings — no parsing needed later.
  • UTF-8 file handler, so Vietnamese text never raises encoding errors.
  • Independent logger namespace (`hitl.save`) so it can be silenced or
    re-routed without touching uvicorn's access log.
"""

from __future__ import annotations

import json
import logging
import logging.handlers
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_LOG_DIR = Path(__file__).resolve().parent / "data"
_LOG_FILE = _LOG_DIR / "hitl_events.jsonl"


class _JsonlFormatter(logging.Formatter):
    """Emit each record as a single JSON line with ISO timestamp + fields."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "event": getattr(record, "event", "unknown"),
        }
        # All extra fields passed via ``extra={...}`` flow through here.
        for key, value in record.__dict__.items():
            if key in payload or key.startswith("_"):
                continue
            if key in {
                "args", "asctime", "created", "exc_info", "exc_text",
                "filename", "funcName", "levelname", "levelno", "lineno",
                "message", "module", "msecs", "msg", "name", "pathname",
                "process", "processName", "relativeCreated", "stack_info",
                "thread", "threadName", "taskName",
            }:
                continue
            payload[key] = value
        return json.dumps(payload, ensure_ascii=False)


class _ConsoleFormatter(logging.Formatter):
    """Short human-readable line for live observability."""

    def format(self, record: logging.LogRecord) -> str:
        event = getattr(record, "event", "?")
        fields = " ".join(
            f"{k}={v!r}" for k, v in record.__dict__.items()
            if k not in {
                "args", "asctime", "created", "exc_info", "exc_text",
                "filename", "funcName", "levelname", "levelno", "lineno",
                "message", "module", "msecs", "msg", "name", "pathname",
                "process", "processName", "relativeCreated", "stack_info",
                "thread", "threadName", "taskName", "event",
            } and not k.startswith("_")
        )
        return f"[HITL_SAVE] {event} {fields}"


def _build_logger() -> logging.Logger:
    log = logging.getLogger("hitl.save")
    if log.handlers:
        return log  # idempotent — uvicorn --reload could re-import

    log.setLevel(logging.INFO)
    log.propagate = False  # keep uvicorn access log clean

    _LOG_DIR.mkdir(parents=True, exist_ok=True)
    file_h = logging.FileHandler(_LOG_FILE, encoding="utf-8")
    file_h.setFormatter(_JsonlFormatter())
    log.addHandler(file_h)

    console_h = logging.StreamHandler()
    console_h.setFormatter(_ConsoleFormatter())
    log.addHandler(console_h)
    return log


_logger = _build_logger()


def log_event(event: str, **fields: Any) -> None:
    """Record one HITL save event.

    ``event`` is the short tag ("approve", "finalize", "analyze-comment").
    ``fields`` are event-specific key/values (task, lesson_ids, deltas, …).
    """
    _logger.info(event, extra={"event": event, **fields})

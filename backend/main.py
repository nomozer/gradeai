"""
main.py — FastAPI Backend for the HITL VLM Grading Agent

Responsibilities (kept deliberately small):
    • App bootstrap (FastAPI, CORS, lifespan)
    • Singleton wiring (MemoryManager → PromptOrchestrator → AgentOrchestrator)
    • Mounting routers (grading endpoints + heartbeat + memory + history)

Domain layout — each folder = one chapter of the report:
    • api/      — Pydantic schemas + endpoint routers + middleware
    • grading/  — AgentOrchestrator + Gemini client + scoring + helpers
    • memory/   — Dual-store (SQLite + ChromaDB) + JSONL event log
    • prompts/  — Subject-aware system prompts (math, cs, phys, chem, bio)

Route handlers themselves live in ``api/grading.py``; this file does
no per-endpoint work beyond ``include_router()`` + injecting singletons.

Research Project: Tác tử AI hỗ trợ chấm điểm tự luận đa phương thức kết hợp
                  phản hồi từ giáo viên (Human-in-the-loop VLM Grading Agent)
"""

from __future__ import annotations

import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

logger = logging.getLogger(__name__)

# Windows default console encoding is cp1252 — reconfigure stdout/stderr to
# UTF-8 so Vietnamese text in logs does not raise UnicodeEncodeError.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

# uvicorn is launched from backend/, so direct imports (no "backend." prefix).
from api.auth import router as auth_router, attach_auth
from api.grading import router as grading_router, attach_grading
from api.heartbeat import router as heartbeat_router, start_watchdog
from api.history import router as history_router, attach_history_memory
from api.memory import router as memory_router, attach_memory
from api.middleware import (
    make_auth_guard,
    make_csrf_origin_guard,
    make_request_size_guard,
    make_security_headers_middleware,
    normalize_origin,
)
from auth import UserStore
from grading import AgentOrchestrator, PromptOrchestrator
from memory import MemoryManager

# Kick off heartbeat watchdog before FastAPI bootstrap so it catches startup
# failures too. No-op under DEV_MODE=1.
start_watchdog()


# ---------------------------------------------------------------------------
# App bootstrap
# ---------------------------------------------------------------------------

_DEFAULT_CORS_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
_BACKEND_DEV_ORIGINS = ("http://localhost:8000", "http://127.0.0.1:8000")
_DEFAULT_ALLOWED_HOSTS = "localhost,127.0.0.1"


def _split_csv_env(name: str, default: str = "") -> list[str]:
    return [
        item.strip().rstrip("/")
        for item in os.getenv(name, default).split(",")
        if item.strip()
    ]


def _env_flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


CORS_ORIGINS = _split_csv_env("CORS_ORIGINS", _DEFAULT_CORS_ORIGINS)
ALLOWED_HOSTS = _split_csv_env("ALLOWED_HOSTS", _DEFAULT_ALLOWED_HOSTS)
CSRF_TRUSTED_ORIGINS = tuple(
    dict.fromkeys(
        [
            *(normalize_origin(origin) for origin in CORS_ORIGINS),
            *(
                normalize_origin(origin)
                for origin in _split_csv_env("CSRF_TRUSTED_ORIGINS", "")
            ),
            *_BACKEND_DEV_ORIGINS,
        ]
    )
)
CSRF_ORIGIN_CHECK_ENABLED = _env_flag("CSRF_ORIGIN_CHECK", "1")
CORS_ALLOW_CREDENTIALS = _env_flag("CORS_ALLOW_CREDENTIALS", "0")
MAX_REQUEST_BODY_BYTES = int(os.getenv("MAX_REQUEST_BODY_BYTES", str(40 * 1024 * 1024)))
PROMPT_LOGS_ENABLED = _env_flag("HITL_PROMPT_LOGS", "0")
# Login/auth. The admin account is seeded from these on startup (idempotent —
# only created if missing). Set them on any public deploy. ``AUTH_ENABLED``
# defaults ON; set AUTH_ENABLED=0 to run fully open (local dev convenience).
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "").strip()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
AUTH_ENABLED = _env_flag("AUTH_ENABLED", "1")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Seed the admin account from env (idempotent — only if missing) so the
    # first login exists on a fresh deploy.
    if AUTH_ENABLED:
        user_store.ensure_admin(ADMIN_USERNAME, ADMIN_PASSWORD)
    yield


app = FastAPI(
    title="HITL VLM Grading Agent API",
    lifespan=lifespan,
    version="0.1.0",
    description="Backend for the Human-in-the-Loop multimodal essay-grading system",
)

# User/session store — built early because the auth-guard middleware needs its
# token validator. Opens its own engine on the shared SQLite file.
user_store = UserStore()

app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)
app.middleware("http")(make_security_headers_middleware())
app.middleware("http")(make_request_size_guard(MAX_REQUEST_BODY_BYTES))
app.middleware("http")(
    make_csrf_origin_guard(
        CSRF_TRUSTED_ORIGINS,
        enabled=CSRF_ORIGIN_CHECK_ENABLED,
    )
)
# Session-auth gate — sits just inside CORS so preflight OPTIONS still gets
# CORS headers and a 401 from a blocked request still carries them. ``/api/
# auth/login`` is public; everything else under /api needs a valid bearer
# token. Disabled wholesale via AUTH_ENABLED=0 for an open local run.
app.middleware("http")(
    make_auth_guard(
        user_store.get_user_for_token,
        enabled=AUTH_ENABLED,
        public_paths={"/api/auth/login"},
    )
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=CORS_ALLOW_CREDENTIALS,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Access-Token"],
)

# ---------------------------------------------------------------------------
# Singleton wiring
#
# Memory drives prompt retrieval, prompt drives grading. The grading router
# is import-free of these singletons; it picks them up via ``attach_grading``
# after construction — same pattern as ``api/memory.py`` and ``api/history.py``.
# ---------------------------------------------------------------------------
memory = MemoryManager()
prompt_orch = PromptOrchestrator(
    memory,
    k_lessons=3,
    log_dir=(
        Path(__file__).resolve().parent / "data" / "prompt_logs"
        if PROMPT_LOGS_ENABLED
        else None
    ),
)
orchestrator = AgentOrchestrator(memory=memory, prompt_orchestrator=prompt_orch)

attach_grading(memory, prompt_orch, orchestrator)
attach_memory(memory)
attach_history_memory(memory)
attach_auth(user_store)

app.include_router(auth_router)
app.include_router(grading_router)
app.include_router(heartbeat_router)
app.include_router(memory_router)
app.include_router(history_router)

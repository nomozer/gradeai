"""
request_context.py — Per-request user scope via a ContextVar.

Multi-tenancy is enforced by scoping every MemoryManager read/write to the
authenticated user. Rather than thread a ``user_id`` argument through
``run_pipeline → build_prompt → search_relevant_lessons`` (and every
``ingest_feedback`` / ``log_pipeline_run`` call site), we stash the id in a
``ContextVar`` that the auth dependency sets per request and MemoryManager
reads internally.

Why a ContextVar works across the pipeline's thread hops: FastAPI runs the
auth dependency and the endpoint in the SAME task/context, and
``asyncio.to_thread`` (used for ``build_prompt`` and the ``ingest_feedback``
calls) propagates the current ``contextvars.Context`` into the worker thread.
``log_pipeline_run`` runs directly on the event-loop thread, so it sees the
value too. Each request is its own task with its own context copy, so there
is no cross-request leakage.

Default ``0`` means "no authenticated user" — used by offline scripts
(``scripts/run_experiment.py`` etc.) that call MemoryManager directly without
an HTTP request. Those scripts therefore all share the ``user_id=0`` bucket,
which is fine since they run against throwaway temp dirs.
"""

from __future__ import annotations

from contextvars import ContextVar

#: System / unauthenticated bucket. Real users always have a positive id.
SYSTEM_USER_ID = 0

current_user_id: ContextVar[int] = ContextVar("current_user_id", default=SYSTEM_USER_ID)


def get_current_user_id() -> int:
    """Return the user id scoped to the current request (or ``0`` if none)."""
    return current_user_id.get()


def set_current_user_id(user_id: int) -> None:
    """Bind the current request's user id (called by the auth dependency)."""
    current_user_id.set(user_id)

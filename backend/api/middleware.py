"""
middleware.py — Cross-cutting HTTP middleware for the HITL API.

Lives in ``api/`` because every middleware here operates on the FastAPI
request lifecycle, not on the grading domain. ``main.py`` wires these in
during app bootstrap.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Awaitable, Callable
from urllib.parse import urlparse

from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


CSRF_UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def normalize_origin(value: str | None) -> str:
    """Return ``scheme://host[:port]`` from an Origin or Referer header.

    Empty string when the input is unparseable — callers treat that as
    "no usable origin" and fall through to the next check.
    """
    if not value:
        return ""
    parsed = urlparse(value.strip())
    if not parsed.scheme or not parsed.hostname:
        return ""
    port = f":{parsed.port}" if parsed.port else ""
    return f"{parsed.scheme.lower()}://{parsed.hostname.lower()}{port}"


def make_csrf_origin_guard(
    trusted_origins: Iterable[str],
    *,
    enabled: bool = True,
) -> Callable[[Request, Callable[[Request], Awaitable]], Awaitable]:
    """Build the CSRF origin-guard middleware bound to a trusted-origin set.

    The app does not currently use cookie/session auth, so synchronizer CSRF
    tokens would add complexity without a real credential to protect. This
    guard still closes the browser CSRF path for state-changing endpoints
    and keeps the backend ready if credentialed auth is added later.

    Returns an async function suitable for ``app.middleware("http")``.
    """
    trusted = frozenset(trusted_origins)

    async def csrf_origin_guard(request: Request, call_next):
        if (
            enabled
            and request.url.path.startswith("/api/")
            and request.method.upper() in CSRF_UNSAFE_METHODS
        ):
            origin = normalize_origin(request.headers.get("origin"))
            if not origin:
                origin = normalize_origin(request.headers.get("referer"))
            if origin and origin not in trusted:
                logger.warning(
                    "Blocked cross-site API request method=%s path=%s origin=%s",
                    request.method,
                    request.url.path,
                    origin,
                )
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Cross-site request blocked."},
                )
        return await call_next(request)

    return csrf_origin_guard


__all__ = ["CSRF_UNSAFE_METHODS", "normalize_origin", "make_csrf_origin_guard"]

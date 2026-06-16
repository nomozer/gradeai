"""
middleware.py — Cross-cutting HTTP middleware for the HITL API.

Lives in ``api/`` because every middleware here operates on the FastAPI
request lifecycle, not on the grading domain. ``main.py`` wires these in
during app bootstrap.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Awaitable, Callable
from typing import Any, Optional
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


def _bearer_token(request: Request) -> str:
    """Extract a session token from ``Authorization: Bearer`` (or X-Access-Token)."""
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return request.headers.get("x-access-token", "").strip()


def make_auth_guard(
    token_validator: Callable[[str], Optional[dict[str, Any]]],
    *,
    enabled: bool = True,
    public_paths: Iterable[str] = (),
) -> Callable[[Request, Callable[[Request], Awaitable]], Awaitable]:
    """Build the session-auth gate for every ``/api/*`` request.

    A request must carry a valid session token (``Authorization: Bearer``)
    that ``token_validator`` resolves to a user, otherwise it is rejected with
    401 before reaching any handler. This is the uniform gate — defence in
    depth on top of the per-endpoint ``get_current_user`` dependency — so an
    endpoint that forgets the dependency is still not publicly reachable.

    ``OPTIONS`` is exempt (CORS preflight) and ``public_paths`` lists routes
    that must work unauthenticated (e.g. ``/api/auth/login``). When ``enabled``
    is False (no auth store wired) the guard is a no-op so the test suite and
    any auth-less local run keep working.

    ``token_validator`` is a plain callable (``UserStore.get_user_for_token``)
    so this module stays decoupled from the ``auth`` package.
    """
    public = frozenset(public_paths)

    async def auth_guard(request: Request, call_next):
        if (
            enabled
            and request.url.path.startswith("/api/")
            and request.method.upper() != "OPTIONS"
            and request.url.path not in public
        ):
            token = _bearer_token(request)
            if not token or token_validator(token) is None:
                logger.warning(
                    "Blocked unauthenticated API request method=%s path=%s",
                    request.method,
                    request.url.path,
                )
                return JSONResponse(
                    status_code=401,
                    content={
                        "detail": "Phiên đăng nhập không hợp lệ hoặc đã hết hạn."
                    },
                )
        return await call_next(request)

    return auth_guard


def make_request_size_guard(
    max_bytes: int,
) -> Callable[[Request, Callable[[Request], Awaitable]], Awaitable]:
    """Reject oversized API requests before the body is read.

    The grading endpoints carry base64 PDF/image payloads, so the limit is
    intentionally generous. It still prevents accidental or hostile requests
    from pushing the process into memory pressure.
    """

    async def request_size_guard(request: Request, call_next):
        if max_bytes > 0 and request.url.path.startswith("/api/"):
            raw_len = request.headers.get("content-length")
            if raw_len:
                try:
                    content_length = int(raw_len)
                except ValueError:
                    content_length = 0
                if content_length > max_bytes:
                    logger.warning(
                        "Rejected oversized API request path=%s bytes=%s limit=%s",
                        request.url.path,
                        content_length,
                        max_bytes,
                    )
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "Request body too large."},
                    )
        return await call_next(request)

    return request_size_guard


def make_security_headers_middleware() -> Callable[
    [Request, Callable[[Request], Awaitable]], Awaitable
]:
    """Attach conservative browser security headers to every response."""

    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        headers = response.headers
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=()",
        )
        if request.url.path.startswith("/api/"):
            headers.setdefault("Cache-Control", "no-store")
            headers.setdefault("Pragma", "no-cache")
        return response

    return security_headers


__all__ = [
    "CSRF_UNSAFE_METHODS",
    "normalize_origin",
    "make_csrf_origin_guard",
    "make_auth_guard",
    "make_request_size_guard",
    "make_security_headers_middleware",
]

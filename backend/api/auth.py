"""
auth.py — Login, session, and admin user-management endpoints.

    • POST   /api/auth/login        — username + password → bearer token
    • POST   /api/auth/logout       — revoke the current session
    • GET    /api/auth/me           — current user (id / username / role)
    • GET    /api/auth/users        — list users            (admin only)
    • POST   /api/auth/users        — create a user         (admin only)
    • PATCH  /api/auth/users/{id}   — reset pw / disable / change role (admin)
    • DELETE /api/auth/users/{id}   — delete a user         (admin only)

The ``UserStore`` singleton is injected via ``attach_auth()`` from ``main.py``
(same pattern as the other routers). ``get_current_user`` is the dependency
every scoped endpoint depends on — besides returning the user, it binds the
``current_user_id`` ContextVar so MemoryManager scopes that request's data to
this teacher.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth import ROLE_ADMIN, ROLE_USER, UserStore
from memory import MemoryManager
from request_context import set_current_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

_users: UserStore | None = None
_memory: MemoryManager | None = None


def attach_auth(store: UserStore, memory: MemoryManager) -> None:
    global _users, _memory
    _users = store
    _memory = memory


def _require_store() -> UserStore:
    if _users is None:
        raise HTTPException(status_code=500, detail="Auth store not attached")
    return _users


def _require_memory() -> MemoryManager:
    if _memory is None:
        raise HTTPException(status_code=500, detail="Memory manager not attached")
    return _memory


def extract_bearer_token(request: Request) -> str:
    """Pull the session token from ``Authorization: Bearer`` (or X-Access-Token)."""
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return request.headers.get("x-access-token", "").strip()


async def get_current_user(request: Request) -> dict:
    """Resolve + bind the authenticated user for this request.

    Re-validates the token against the store (cheap SQLite lookup) rather than
    trusting middleware-set request state, so it is correct regardless of how
    Starlette propagates scope state through BaseHTTPMiddleware. Binds the
    ``current_user_id`` ContextVar as a side effect so downstream MemoryManager
    calls (including the ones run via ``asyncio.to_thread``) scope to this user.
    """
    store = _require_store()
    user = store.get_user_for_token(extract_bearer_token(request))
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
        )
    set_current_user_id(int(user["id"]))
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Chỉ admin mới có quyền này.")
    return user


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    token_quota: int = 0
    created_at: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user: UserOut


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=4, max_length=256)
    role: str = ROLE_USER
    token_quota: int = Field(default=0, ge=0)


class UpdateUserRequest(BaseModel):
    password: str | None = Field(default=None, min_length=4, max_length=256)
    is_active: bool | None = None
    role: str | None = None
    token_quota: int | None = Field(default=None, ge=0)


class UsersResponse(BaseModel):
    items: list[UserOut]


class OverviewUserRow(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    token_quota: int = 0
    created_at: str | None = None
    lessons: int = 0
    graded: int = 0
    tokens_used: int = 0


class OverviewResponse(BaseModel):
    total_accounts: int
    total_teachers: int
    total_admins: int
    total_graded: int
    total_lessons: int
    users: list[OverviewUserRow]


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest):
    store = _require_store()
    user = store.verify_login(req.username, req.password)
    if user is None:
        raise HTTPException(
            status_code=401, detail="Sai tên đăng nhập hoặc mật khẩu, hoặc tài khoản đã bị khóa."
        )
    token = store.create_session(int(user["id"]))
    logger.info("Login user=%s role=%s", user["username"], user["role"])
    return LoginResponse(token=token, user=UserOut(**user))


@router.post("/logout")
def logout(request: Request):
    store = _require_store()
    store.delete_session(extract_bearer_token(request))
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(**user)


# ---------------------------------------------------------------------------
# Admin user management
# ---------------------------------------------------------------------------


@router.get("/overview", response_model=OverviewResponse)
async def overview(_admin: dict = Depends(require_admin)):
    """System-wide stats for the admin dashboard — accounts + per-teacher usage."""
    store = _require_store()
    usage = _require_memory().usage_by_user()
    rows: list[OverviewUserRow] = []
    total_graded = 0
    total_lessons = 0
    teachers = 0
    admins = 0
    for u in store.list_users():
        u_usage = usage.get(u["id"], {})
        lessons = int(u_usage.get("lessons", 0))
        graded = int(u_usage.get("graded", 0))
        tokens = int(u_usage.get("tokens", 0))
        total_lessons += lessons
        total_graded += graded
        if u["role"] == ROLE_ADMIN:
            admins += 1
        else:
            teachers += 1
        rows.append(
            OverviewUserRow(**u, lessons=lessons, graded=graded, tokens_used=tokens)
        )
    return OverviewResponse(
        total_accounts=len(rows),
        total_teachers=teachers,
        total_admins=admins,
        total_graded=total_graded,
        total_lessons=total_lessons,
        users=rows,
    )


@router.get("/users", response_model=UsersResponse)
async def list_users(_admin: dict = Depends(require_admin)):
    store = _require_store()
    return UsersResponse(items=[UserOut(**u) for u in store.list_users()])


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(req: CreateUserRequest, _admin: dict = Depends(require_admin)):
    store = _require_store()
    role = req.role if req.role in (ROLE_ADMIN, ROLE_USER) else ROLE_USER
    try:
        user = store.create_user(req.username, req.password, role, req.token_quota)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    logger.info("Admin %s created user %s (role=%s)", _admin["username"], user["username"], role)
    return UserOut(**user)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int, req: UpdateUserRequest, admin: dict = Depends(require_admin)
):
    store = _require_store()
    target = store.get_user_by_id(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")

    last_admin = (
        target["role"] == ROLE_ADMIN
        and target["is_active"]
        and store.count_admins(active_only=True) <= 1
    )
    if req.is_active is False and last_admin:
        raise HTTPException(status_code=400, detail="Không thể vô hiệu hóa admin cuối cùng.")
    if req.role is not None and req.role != ROLE_ADMIN and last_admin:
        raise HTTPException(status_code=400, detail="Không thể bỏ quyền của admin cuối cùng.")

    if req.password:
        store.set_password(user_id, req.password)
    if req.role is not None and req.role in (ROLE_ADMIN, ROLE_USER):
        store.set_role(user_id, req.role)
    if req.token_quota is not None:
        store.set_token_quota(user_id, req.token_quota)
    if req.is_active is not None:
        store.set_active(user_id, req.is_active)

    updated = store.get_user_by_id(user_id)
    return UserOut(**updated)  # type: ignore[arg-type]


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, admin: dict = Depends(require_admin)):
    store = _require_store()
    target = store.get_user_by_id(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
    if target["id"] == admin["id"]:
        raise HTTPException(status_code=400, detail="Không thể tự xóa tài khoản đang đăng nhập.")
    if (
        target["role"] == ROLE_ADMIN
        and target["is_active"]
        and store.count_admins(active_only=True) <= 1
    ):
        raise HTTPException(status_code=400, detail="Không thể xóa admin cuối cùng.")
    store.delete_user(user_id)
    logger.info("Admin %s deleted user id=%s", admin["username"], user_id)
    return {"deleted": True, "user_id": user_id}

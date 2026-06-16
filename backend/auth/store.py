"""
store.py — User + session persistence for login/auth.

Lives in its own ``auth`` package (separate from ``memory``) because it owns a
different concern: WHO may use the system, not WHAT the system has learned. It
opens its own SQLAlchemy engine on the SAME SQLite file as MemoryManager
(``data/hitl_mirror.db``) — WAL mode lets multiple connections share the file
safely — and manages two tables:

    • users    — id, username (unique), password_hash, role, is_active
    • sessions — opaque bearer token → user_id, with an expiry

Sessions are opaque random tokens stored server-side (NOT JWT) so they are
trivially revocable: disabling a user or resetting a password deletes their
sessions, logging them out everywhere immediately. For a fixed group of
teachers this is simpler and safer than stateless tokens + a rotating secret.
"""

from __future__ import annotations

import datetime
import logging
import secrets
from pathlib import Path
from typing import Any

from sqlalchemy import (
    DateTime,
    Integer,
    Text,
    create_engine,
    event,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    sessionmaker,
)

from .passwords import hash_password, verify_password

logger = logging.getLogger(__name__)

ROLE_ADMIN = "admin"
ROLE_USER = "user"
DEFAULT_SESSION_TTL_DAYS = 30


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False, default=ROLE_USER)
    is_active: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    def to_dict(self, *, include_hash: bool = False) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.id,
            "username": self.username,
            "role": self.role,
            "is_active": bool(self.is_active),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_hash:
            data["password_hash"] = self.password_hash
        return data


class AuthSession(Base):
    __tablename__ = "sessions"

    token: Mapped[str] = mapped_column(Text, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    expires_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class UserStore:
    """SQLite-backed user + session store."""

    def __init__(self, db_dir: Path | None = None) -> None:
        if db_dir is None:
            db_dir = Path(__file__).resolve().parent.parent / "data"
        db_dir.mkdir(parents=True, exist_ok=True)
        db_path = db_dir / "hitl_mirror.db"
        self._engine = create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False},
        )

        # Match MemoryManager's concurrency hardening — both engines hit the
        # same file, so both must enable WAL + a busy timeout or a login write
        # racing a grading write would hit "database is locked".
        @event.listens_for(self._engine, "connect")
        def _set_sqlite_pragmas(dbapi_conn, _record):  # noqa: ANN001
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA busy_timeout=5000")
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.close()

        Base.metadata.create_all(self._engine)
        self._SessionLocal = sessionmaker(bind=self._engine, expire_on_commit=False)

    def _session(self) -> Session:
        return self._SessionLocal()

    # ---- users ------------------------------------------------------------

    def create_user(
        self, username: str, password: str, role: str = ROLE_USER
    ) -> dict[str, Any]:
        """Create a user. Raises ValueError if the username already exists."""
        username = (username or "").strip()
        if not username:
            raise ValueError("Tên đăng nhập không được để trống.")
        if role not in (ROLE_ADMIN, ROLE_USER):
            role = ROLE_USER
        user = User(
            username=username,
            password_hash=hash_password(password),
            role=role,
            is_active=1,
        )
        with self._session() as session:
            session.add(user)
            try:
                session.commit()
            except IntegrityError as exc:
                session.rollback()
                raise ValueError("Tên đăng nhập đã tồn tại.") from exc
            session.refresh(user)
            return user.to_dict()

    def get_user_by_username(
        self, username: str, *, include_hash: bool = False
    ) -> dict[str, Any] | None:
        with self._session() as session:
            user = (
                session.query(User)
                .filter(User.username == (username or "").strip())
                .one_or_none()
            )
            return user.to_dict(include_hash=include_hash) if user else None

    def get_user_by_id(self, user_id: int) -> dict[str, Any] | None:
        with self._session() as session:
            user = session.get(User, user_id)
            return user.to_dict() if user else None

    def list_users(self) -> list[dict[str, Any]]:
        with self._session() as session:
            users = session.query(User).order_by(User.created_at.asc()).all()
            return [u.to_dict() for u in users]

    def count_users(self) -> int:
        with self._session() as session:
            return session.query(User).count()

    def set_active(self, user_id: int, active: bool) -> bool:
        with self._session() as session:
            user = session.get(User, user_id)
            if user is None:
                return False
            user.is_active = 1 if active else 0
            session.commit()
        if not active:
            self.delete_sessions_for_user(user_id)
        return True

    def set_password(self, user_id: int, password: str) -> bool:
        with self._session() as session:
            user = session.get(User, user_id)
            if user is None:
                return False
            user.password_hash = hash_password(password)
            session.commit()
        # Force re-login everywhere after a password change.
        self.delete_sessions_for_user(user_id)
        return True

    def set_role(self, user_id: int, role: str) -> bool:
        if role not in (ROLE_ADMIN, ROLE_USER):
            return False
        with self._session() as session:
            user = session.get(User, user_id)
            if user is None:
                return False
            user.role = role
            session.commit()
        return True

    def delete_user(self, user_id: int) -> bool:
        with self._session() as session:
            user = session.get(User, user_id)
            if user is None:
                return False
            session.delete(user)
            session.commit()
        self.delete_sessions_for_user(user_id)
        return True

    def count_admins(self, *, active_only: bool = True) -> int:
        with self._session() as session:
            q = session.query(User).filter(User.role == ROLE_ADMIN)
            if active_only:
                q = q.filter(User.is_active == 1)
            return q.count()

    # ---- login + sessions -------------------------------------------------

    def verify_login(self, username: str, password: str) -> dict[str, Any] | None:
        """Return the user dict on valid credentials + active account, else None."""
        with self._session() as session:
            user = (
                session.query(User)
                .filter(User.username == (username or "").strip())
                .one_or_none()
            )
            if user is None or not user.is_active:
                return None
            if not verify_password(password, user.password_hash):
                return None
            return user.to_dict()

    def create_session(
        self, user_id: int, ttl_days: int = DEFAULT_SESSION_TTL_DAYS
    ) -> str:
        token = secrets.token_urlsafe(32)
        expires = _utcnow() + datetime.timedelta(days=ttl_days)
        with self._session() as session:
            session.add(
                AuthSession(token=token, user_id=user_id, expires_at=expires)
            )
            session.commit()
        return token

    def get_user_for_token(self, token: str) -> dict[str, Any] | None:
        """Validate a bearer token → return its active user, or None.

        Expired sessions are deleted lazily on lookup. A disabled user (even
        with a still-valid token) is rejected.
        """
        if not token:
            return None
        with self._session() as session:
            row = session.get(AuthSession, token)
            if row is None:
                return None
            expires = row.expires_at
            if expires is not None and expires.tzinfo is None:
                expires = expires.replace(tzinfo=datetime.timezone.utc)
            if expires is not None and expires < _utcnow():
                session.delete(row)
                session.commit()
                return None
            user = session.get(User, row.user_id)
            if user is None or not user.is_active:
                return None
            return user.to_dict()

    def delete_session(self, token: str) -> None:
        if not token:
            return
        with self._session() as session:
            row = session.get(AuthSession, token)
            if row is not None:
                session.delete(row)
                session.commit()

    def delete_sessions_for_user(self, user_id: int) -> None:
        with self._session() as session:
            session.query(AuthSession).filter(
                AuthSession.user_id == user_id
            ).delete()
            session.commit()

    # ---- bootstrap --------------------------------------------------------

    def ensure_admin(self, username: str, password: str) -> None:
        """Seed an admin account from env on startup if it doesn't exist.

        Idempotent: if the username already exists it is left untouched (so a
        teacher who changed the admin password won't have it reset on every
        redeploy). Only creates when missing.
        """
        username = (username or "").strip()
        if not username or not password:
            logger.warning(
                "ADMIN_USERNAME/ADMIN_PASSWORD not set — no admin seeded. "
                "Set them so the first login exists."
            )
            return
        if self.get_user_by_username(username) is not None:
            return
        self.create_user(username, password, role=ROLE_ADMIN)
        logger.info("Seeded admin account '%s' from environment", username)

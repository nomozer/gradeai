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
import re
import secrets
from pathlib import Path
from typing import Any

from sqlalchemy import (
    DateTime,
    Integer,
    Text,
    create_engine,
    event,
    func,
    inspect,
    text,
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
USERNAME_RE = re.compile(r"^[a-z0-9]{3,32}$")
USERNAME_RULE_MESSAGE = (
    "Tên đăng nhập chỉ gồm chữ thường không dấu và số, dài 3-32 ký tự "
    "(vd: gv001, admin01)."
)


def normalize_username(username: str | None) -> str:
    """Normalize login names at creation time: trim + lowercase only."""
    return (username or "").strip().lower()


def validate_username(username: str | None) -> str:
    """Return the normalized username, or raise a user-facing ValueError."""
    normalized = normalize_username(username)
    if not normalized:
        raise ValueError("Tên đăng nhập không được để trống.")
    if not USERNAME_RE.fullmatch(normalized):
        raise ValueError(USERNAME_RULE_MESSAGE)
    return normalized


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
    # Max total Gemini tokens this user may spend on grading. 0 = unlimited.
    # Enforced in the grading endpoints against the sum of their pipeline runs.
    token_quota: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Human-readable display name + the school's own teacher code. Both
    # OPTIONAL (nullable) so legacy accounts and topic-only bulk rows still
    # work. ``teacher_code`` is unique WHEN PRESENT — enforced by a unique
    # index built in ``_migrate`` (SQLite treats NULLs as distinct, so many
    # rows may leave it blank). ``username`` stays the login credential;
    # these are descriptive metadata for the admin dashboard.
    full_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    teacher_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    def to_dict(self, *, include_hash: bool = False) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.id,
            "username": self.username,
            "role": self.role,
            "is_active": bool(self.is_active),
            "token_quota": int(self.token_quota or 0),
            "full_name": self.full_name,
            "teacher_code": self.teacher_code,
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
        self._migrate()
        self._SessionLocal = sessionmaker(bind=self._engine, expire_on_commit=False)

    def _migrate(self) -> None:
        """Add columns introduced after the initial users schema on legacy DBs.

        ``create_all`` only creates MISSING tables — it never alters an
        existing one. ``token_quota`` / ``full_name`` / ``teacher_code`` were
        added after the first users table shipped, so probe + ``ALTER TABLE``
        if absent (cheap on SQLite). The unique index on ``teacher_code`` is
        (re)created unconditionally with ``IF NOT EXISTS`` so both fresh and
        legacy DBs get the same uniqueness guard — SQLite allows many NULLs in
        a unique index, which is exactly "unique only when a code is set".
        """
        inspector = inspect(self._engine)
        if not inspector.has_table("users"):
            return
        cols = {c["name"] for c in inspector.get_columns("users")}
        with self._engine.begin() as conn:
            if "token_quota" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE users "
                        "ADD COLUMN token_quota INTEGER NOT NULL DEFAULT 0"
                    )
                )
                logger.info("Migrated 'users' table: added 'token_quota' column")
            if "full_name" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN full_name TEXT"))
                logger.info("Migrated 'users' table: added 'full_name' column")
            if "teacher_code" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN teacher_code TEXT"))
                logger.info("Migrated 'users' table: added 'teacher_code' column")
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_teacher_code "
                    "ON users(teacher_code)"
                )
            )

    def _session(self) -> Session:
        return self._SessionLocal()

    # ---- users ------------------------------------------------------------

    @staticmethod
    def _norm_optional(value: str | None) -> str | None:
        """Trim + collapse empty to None so blank cells don't collide in the
        UNIQUE index (many NULL teacher_codes are allowed; many '' would not)."""
        value = (value or "").strip()
        return value or None

    def create_user(
        self,
        username: str,
        password: str,
        role: str = ROLE_USER,
        token_quota: int = 0,
        full_name: str | None = None,
        teacher_code: str | None = None,
    ) -> dict[str, Any]:
        """Create a user. Raises ValueError on a duplicate username or code."""
        username = validate_username(username)
        if role not in (ROLE_ADMIN, ROLE_USER):
            role = ROLE_USER
        full_name = self._norm_optional(full_name)
        teacher_code = self._norm_optional(teacher_code)
        with self._session() as session:
            # Friendly pre-checks for clear error messages; the UNIQUE index
            # is still the real guard against a concurrent-insert race.
            if (
                session.query(User)
                .filter(func.lower(User.username) == username)
                .first()
            ):
                raise ValueError("Tên đăng nhập đã tồn tại.")
            if teacher_code and (
                session.query(User)
                .filter(User.teacher_code == teacher_code)
                .first()
            ):
                raise ValueError(f"Mã giáo viên '{teacher_code}' đã tồn tại.")
            user = User(
                username=username,
                password_hash=hash_password(password),
                role=role,
                is_active=1,
                token_quota=max(0, int(token_quota or 0)),
                full_name=full_name,
                teacher_code=teacher_code,
            )
            session.add(user)
            try:
                session.commit()
            except IntegrityError as exc:
                session.rollback()
                raise ValueError(
                    "Tên đăng nhập hoặc mã giáo viên đã tồn tại."
                ) from exc
            session.refresh(user)
            return user.to_dict()

    def get_user_by_username(
        self, username: str, *, include_hash: bool = False
    ) -> dict[str, Any] | None:
        username_key = normalize_username(username)
        with self._session() as session:
            user = (
                session.query(User)
                .filter(func.lower(User.username) == username_key)
                .first()
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

    def set_token_quota(self, user_id: int, quota: int) -> bool:
        with self._session() as session:
            user = session.get(User, user_id)
            if user is None:
                return False
            user.token_quota = max(0, int(quota or 0))
            session.commit()
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
        username_key = normalize_username(username)
        with self._session() as session:
            user = (
                session.query(User)
                .filter(func.lower(User.username) == username_key)
                .first()
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

    # ---- backup / restore -------------------------------------------------

    def export_users(self) -> list[dict[str, Any]]:
        """Dump all users INCLUDING password_hash (so a restore keeps logins)."""
        with self._session() as session:
            return [
                {
                    "id": u.id, "username": u.username,
                    "password_hash": u.password_hash, "role": u.role,
                    "is_active": int(u.is_active),
                    "token_quota": int(u.token_quota or 0),
                    "full_name": u.full_name,
                    "teacher_code": u.teacher_code,
                    "created_at": u.created_at.isoformat() if u.created_at else None,
                }
                for u in session.query(User).all()
            ]

    def import_users(self, rows: list[dict[str, Any]]) -> int:
        """REPLACE the users table from a backup (preserves id + password_hash).

        Sessions are intentionally NOT touched — but the admin running the
        restore may be logged out afterwards if their account isn't in the
        backup; ``main``/the restore endpoint re-seeds the env admin as a
        safety net so there is always a way back in.
        """
        def _ts(s: Any) -> datetime.datetime:
            if isinstance(s, str):
                try:
                    return datetime.datetime.fromisoformat(s)
                except ValueError:
                    pass
            return _utcnow()

        with self._session() as session:
            session.query(User).delete()
            session.commit()
        with self._session() as session:
            for r in rows:
                session.add(User(
                    id=r.get("id"),
                    username=str(r.get("username") or "").strip(),
                    password_hash=r.get("password_hash") or "",
                    role=r.get("role") or ROLE_USER,
                    is_active=int(r.get("is_active", 1)),
                    token_quota=max(0, int(r.get("token_quota") or 0)),
                    full_name=self._norm_optional(r.get("full_name")),
                    teacher_code=self._norm_optional(r.get("teacher_code")),
                    created_at=_ts(r.get("created_at")),
                ))
            session.commit()
        return len(rows)

    # ---- bootstrap --------------------------------------------------------

    def ensure_admin(self, username: str, password: str) -> None:
        """Seed an admin account from env on startup if it doesn't exist.

        Idempotent: if the username already exists it is left untouched (so a
        teacher who changed the admin password won't have it reset on every
        redeploy). Only creates when missing.
        """
        if not normalize_username(username) or not password:
            logger.warning(
                "ADMIN_USERNAME/ADMIN_PASSWORD not set — no admin seeded. "
                "Set them so the first login exists."
            )
            return
        try:
            username = validate_username(username)
        except ValueError as exc:
            logger.warning("ADMIN_USERNAME is invalid — no admin seeded: %s", exc)
            return
        if self.get_user_by_username(username) is not None:
            return
        self.create_user(username, password, role=ROLE_ADMIN)
        logger.info("Seeded admin account '%s' from environment", username)
